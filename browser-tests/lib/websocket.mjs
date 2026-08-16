// A WebSocket client in ~120 lines, over node:net.
//
// The browser layer talks to Chrome over the DevTools protocol, which is a WebSocket.
// Every off-the-shelf way to get one costs the repository something: `ws` would be a
// new production-lockfile entry for test-only code, and puppeteer/playwright download a
// browser this machine and the CI runner already have. Node 20 has no global WebSocket
// (that landed in 22), so this is the remaining option, and the protocol surface a CDP
// client needs is small: an HTTP upgrade, masked client frames, unmasked server frames,
// continuation, and a pong for every ping.
//
// Deliberately not implemented: TLS (the debugger is on loopback), permessage-deflate
// (we never negotiate it), and binary frames (nothing here asks for one).

import net from "node:net";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export function connect(url) {
  const u = new URL(url);
  if (u.protocol !== "ws:") throw new Error(`only ws:// is supported, got ${url}`);
  const key = crypto.randomBytes(16).toString("base64");
  const expect = crypto
    .createHash("sha1")
    .update(key + GUID)
    .digest("base64");

  const emitter = new EventEmitter();
  const socket = net.connect({
    host: u.hostname,
    port: Number(u.port || 80),
    // Nagle would sit on the small JSON writes a CDP conversation is made of.
    noDelay: true,
  });

  let buf = Buffer.alloc(0);
  let handshakeDone = false;
  // Opcode + payload of a fragmented message in progress.
  let fragOp = 0;
  let frag = [];

  const ready = new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
          `Host: ${u.host}\r\n` +
          `Upgrade: websocket\r\n` +
          `Connection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\n` +
          `Sec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    emitter.once("open", resolve);
    emitter.once("closed", (reason) => reject(new Error(`socket closed before open: ${reason}`)));
  });

  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!handshakeDone) {
      const end = buf.indexOf("\r\n\r\n");
      if (end === -1) return;
      const head = buf.subarray(0, end).toString("latin1");
      buf = buf.subarray(end + 4);
      if (!/^HTTP\/1\.1 101/.test(head)) {
        emitter.emit("closed", `handshake refused: ${head.split("\r\n")[0]}`);
        socket.destroy();
        return;
      }
      const accept = /sec-websocket-accept:\s*(\S+)/i.exec(head)?.[1];
      if (accept !== expect) {
        emitter.emit("closed", "handshake accept mismatch");
        socket.destroy();
        return;
      }
      handshakeDone = true;
      emitter.emit("open");
    }
    drain();
  });

  socket.on("close", () => emitter.emit("closed", "socket closed"));
  socket.on("error", (e) => emitter.emit("closed", String(e)));

  function drain() {
    for (;;) {
      if (buf.length < 2) return;
      const b0 = buf[0];
      const b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < off + 2) return;
        len = buf.readUInt16BE(off);
        off += 2;
      } else if (len === 127) {
        if (buf.length < off + 8) return;
        const big = buf.readBigUInt64BE(off);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("frame too large");
        len = Number(big);
        off += 8;
      }
      let mask = null;
      if (masked) {
        if (buf.length < off + 4) return;
        mask = buf.subarray(off, off + 4);
        off += 4;
      }
      if (buf.length < off + len) return;
      let payload = Buffer.from(buf.subarray(off, off + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buf = buf.subarray(off + len);

      if (opcode === 0x9) {
        socket.write(frame(0xa, payload));
        continue;
      }
      if (opcode === 0xa) continue;
      if (opcode === 0x8) {
        emitter.emit("closed", "peer closed");
        socket.end();
        return;
      }
      if (opcode === 0x1 || opcode === 0x2) {
        if (fin) {
          if (opcode === 0x1) emitter.emit("message", payload.toString("utf8"));
          continue;
        }
        fragOp = opcode;
        frag = [payload];
        continue;
      }
      if (opcode === 0x0) {
        frag.push(payload);
        if (!fin) continue;
        const whole = Buffer.concat(frag);
        frag = [];
        if (fragOp === 0x1) emitter.emit("message", whole.toString("utf8"));
      }
    }
  }

  // Client-to-server frames must be masked (RFC 6455 §5.3); an unmasked one is a
  // protocol error and Chrome drops the connection without an explanation.
  function frame(opcode, payload) {
    const mask = crypto.randomBytes(4);
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    header[0] = 0x80 | opcode;
    const body = Buffer.from(payload);
    for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
    return Buffer.concat([header, mask, body]);
  }

  return {
    ready,
    on: (event, fn) => emitter.on(event, fn),
    send: (text) => socket.write(frame(0x1, Buffer.from(text, "utf8"))),
    close: () => {
      try {
        socket.write(frame(0x8, Buffer.alloc(0)));
      } catch {
        // Already gone; destroying below is the whole point.
      }
      socket.destroy();
    },
  };
}
