// Launching the Chrome that is already installed, and talking to it.
//
// No browser is downloaded and nothing is installed: developers on this project have
// Chrome, and every GitHub-hosted Ubuntu runner ships google-chrome preinstalled, so
// the browser layer costs the repository no bytes and CI no network. CHROME_PATH
// overrides the search for anything unusual.

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { connect } from "./websocket.mjs";

const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/snap/bin/chromium",
];

export function findChrome() {
  const named = process.env.CHROME_PATH || process.env.CHROME_BIN;
  if (named) {
    if (!fs.existsSync(named)) throw new Error(`CHROME_PATH points at nothing: ${named}`);
    return named;
  }
  for (const c of CANDIDATES) if (fs.existsSync(c)) return c;
  throw new Error(
    "No Chrome found. Install Google Chrome or Chromium, or set CHROME_PATH to the binary.\n" +
      "Looked in:\n  " +
      CANDIDATES.join("\n  "),
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A browser that failed to come up is not a test result, so a launch gets one retry
// before the suite reports that it could not run at all.
export async function launch() {
  try {
    return await launchOnce();
  } catch (first) {
    process.stderr.write(`chrome did not start (${first.message}); retrying once\n`);
    return await launchOnce();
  }
}

async function launchOnce() {
  const bin = findChrome();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fov-browser-tests-"));
  const args = [
    // --headless=new is the real browser engine, not the old shell: same layout, same
    // compositor, same hit testing. Geometry measured here is geometry a user gets.
    "--headless=new",
    // Port 0 makes Chrome choose; it writes the real one to DevToolsActivePort. Naming
    // a port would mean this suite could collide with a dev server or with itself.
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-sync",
    "--disable-extensions",
    "--disable-component-update",
    "--disable-features=Translate,MediaRouter,OptimizationHints",
    // Overlay scrollbars only: a classic scrollbar would take width off the layout
    // viewport and every "is this element as wide as the screen" assertion would be
    // measuring the scrollbar instead of the bug.
    "--hide-scrollbars",
    "--mute-audio",
    "--window-size=900,900",
    "about:blank",
  ];
  // A CI container runs as root, where the sandbox cannot start.
  //
  // --enable-unsafe-swiftshader comes with --disable-gpu: since Chrome 130 the software
  // GL fallback is refused for WebGL unless it is asked for by name, and the basemap is
  // a WebGL layer (components/Basemap). Without it a runner with no GPU has no basemap
  // at all, and the whole map reads as a hole in the page.
  if (process.platform !== "darwin") {
    args.unshift(
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--enable-unsafe-swiftshader",
    );
  }

  const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  const portFile = path.join(profile, "DevToolsActivePort");
  let endpoint = null;
  for (let i = 0; i < 200 && endpoint == null; i++) {
    await sleep(50);
    if (child.exitCode != null) {
      throw new Error(`Chrome exited with ${child.exitCode}\n${stderr}`);
    }
    if (!fs.existsSync(portFile)) continue;
    const lines = fs.readFileSync(portFile, "utf8").split("\n");
    if (lines.length < 2 || !lines[1]) continue;
    endpoint = `ws://127.0.0.1:${lines[0].trim()}${lines[1].trim()}`;
  }
  if (!endpoint) throw new Error(`Chrome never opened a debugger port\n${stderr}`);

  const browser = await Connection.open(endpoint);
  return {
    browser,
    async close() {
      try {
        await browser.send("Browser.close");
      } catch {
        // Closing the browser races the socket it answers on; kill covers the rest.
      }
      browser.dispose();
      child.kill("SIGKILL");
      // Chrome is still flushing its profile as it dies; retry rather than race it. And
      // if it is still writing after all of them, leave the directory: it is under the
      // OS temp dir, and an ENOTEMPTY here used to throw out of close() and end a run
      // that had already passed every assertion with exit code 2.
      try {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
      } catch (e) {
        process.stderr.write(`  (left ${profile} behind: ${e.code ?? e.message})\n`);
      }
    },
  };
}

// One CDP connection. Sessions (flat mode) share it: every page target gets a
// sessionId and messages carry it, which is one socket instead of one per tab.
class Connection {
  static async open(endpoint) {
    const ws = connect(endpoint);
    await ws.ready;
    return new Connection(ws);
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Set();
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(timer);
        if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? "")})`));
        else resolve(msg.result);
        return;
      }
      for (const fn of this.listeners) fn(msg);
    });
    ws.on("closed", (why) => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error(`CDP connection closed: ${why}`));
      }
      this.pending.clear();
    });
  }

  onEvent(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timed out after 30s: ${method}`));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  dispose() {
    this.ws.close();
  }
}

// One emulated phone: a page target with device metrics, touch, and a theme.
export class Page {
  static async open(browser, { width, height, deviceScaleFactor = 2, seed = null, theme = "light", lang = "en" }) {
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    const page = new Page(browser, targetId, sessionId);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.setViewport({ width, height, deviceScaleFactor });
    await page.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: theme }],
    });
    // Seeded before the app boots, so the first render already has it. localStorage is
    // where recents, saved places, theme and language live.
    const source =
      `try{localStorage.setItem("fov.theme.v1",${JSON.stringify(theme)});` +
      `localStorage.setItem("fov.lang.v1",${JSON.stringify(lang)});` +
      (seed ? Object.entries(seed).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(JSON.stringify(v))});`).join("") : "") +
      `}catch(e){}`;
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source });
    return page;
  }

  constructor(browser, targetId, sessionId) {
    this.browser = browser;
    this.targetId = targetId;
    this.sessionId = sessionId;
  }

  send(method, params) {
    return this.browser.send(method, params, this.sessionId);
  }

  async setViewport({ width, height, deviceScaleFactor = 2 }) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor,
      mobile: true,
      screenWidth: width,
      screenHeight: height,
    });
    // Touch emulation is not decoration: `(pointer: coarse)` decides the phone layout,
    // and a hit test with a mouse event would take a different code path through the
    // compositor than the finger this suite is standing in for.
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await this.send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
  }

  async goto(url) {
    const loaded = new Promise((resolve) => {
      const off = this.browser.onEvent((m) => {
        if (m.method === "Page.loadEventFired" && m.sessionId === this.sessionId) {
          off();
          resolve();
        }
      });
    });
    await this.send("Page.navigate", { url });
    await loaded;
  }

  async eval(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression: `(() => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      const e = r.exceptionDetails;
      throw new Error(`page threw: ${e.exception?.description ?? e.text}`);
    }
    return r.result.value;
  }

  // Poll an expression until it is truthy. Everything on this screen is animated or
  // debounced, so every wait in the specs goes through here rather than a fixed sleep.
  async waitFor(expression, { timeout = 8000, label = expression } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      // Coerced in the page, not here: a condition that names an element would
      // otherwise be serialized across the wire as a DOM tree, which CDP refuses.
      const v = await this.eval(`return !!(${expression});`);
      if (v) return v;
      if (Date.now() > deadline) throw new Error(`timed out waiting for: ${label}`);
      await sleep(80);
    }
  }

  async tap(x, y) {
    await this.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, radiusX: 12, radiusY: 12, force: 1 }],
    });
    await sleep(50);
    await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(260);
  }

  async swipe(x, fromY, toY, steps = 16) {
    await this.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: fromY, radiusX: 12, radiusY: 12, force: 1 }],
    });
    for (let i = 1; i <= steps; i++) {
      const y = fromY + ((toY - fromY) * i) / steps;
      await this.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y, radiusX: 12, radiusY: 12, force: 1 }],
      });
      await sleep(12);
    }
    await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(400);
  }

  async type(text) {
    for (const ch of text) {
      await this.send("Input.dispatchKeyEvent", { type: "keyDown", text: ch, key: ch });
      await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
      await sleep(18);
    }
  }

  // The whole viewport, as PNG bytes. No `clip`: a clipped capture composites the region
  // a second time without the WebGL surface, so the basemap comes back as an empty
  // rectangle. Specs crop what they need out of the full frame (lib/pixels.mjs).
  async capturePng() {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(r.data, "base64");
  }

  async screenshot(file) {
    fs.writeFileSync(file, await this.capturePng());
  }

  async close() {
    await this.browser.send("Target.closeTarget", { targetId: this.targetId });
  }
}

export { sleep };
