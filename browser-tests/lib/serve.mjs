// The app under test, served by the project's own Vite config.
//
// Mock mode, always: the geocoder and the planner answer from fixtures, so a suggestion
// list has the same rows on this machine, on a plane and on a CI runner. Vite gives an
// inline VITE_* precedence over any .env file, so a developer whose .env.local points at
// a live backend still gets the fixtures here.
//
// The port is picked by the OS. This suite must never be the reason `npm run dev` cannot
// have 5173, and two runs of it at once must not fight.

import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function serveApp() {
  process.env.VITE_API_MODE = "mock";
  delete process.env.VITE_API_BASE;

  const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, "vite.config.ts"),
    logLevel: "warn",
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0];
  if (!url) throw new Error("Vite started but reported no URL");
  return { url, close: () => server.close() };
}
