/**
 * Same-origin proxy for the routing backend, for deployments on Cloudflare Pages.
 *
 * In development the Vite dev server proxies /api to the backend (see vite.config.ts).
 * A static build has no dev server, so without this file a live build would send every
 * plan and stops request to the static host, which answers 404 with an HTML page.
 * This function is what makes VITE_API_BASE=/api mean something in production.
 *
 * Cloudflare routes /api/* here because of the file's path and name: `functions/api/`
 * gives the prefix and `[[path]]` is the catch-all segment. The backend origin comes
 * from the BACKEND_ORIGIN environment variable set on the Pages project, so it stays
 * server-side and never lands in the JavaScript bundle.
 *
 * Going through the same origin also means the backend needs no CORS configuration and
 * may stay on plain HTTP behind Cloudflare, which is what the free-tier Oracle box is.
 *
 * @typedef {{ BACKEND_ORIGIN?: string }} Env
 */

/** An upstream that never answers must not hold a Worker open indefinitely. */
const UPSTREAM_TIMEOUT_MS = 25_000;

/** Errors are shaped like the backend's own, because the client reads `detail`. */
function problem(status, detail) {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * @param {{ request: Request, env: Env }} context
 */
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const origin = (env.BACKEND_ORIGIN || "").replace(/\/+$/, "");

  // Deployment probe. It answers without touching the backend, so the deploy workflow
  // can prove that the host really invokes this function - the difference between a
  // proxy that works and a proxy that only exists in the repository.
  if (path === "/__proxy") {
    return new Response(
      JSON.stringify({ proxy: "pages-function", backend: origin ? "configured" : "missing" }),
      { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
    );
  }

  if (!origin) {
    return problem(503, "this deployment has no routing backend configured");
  }

  // Only reads reach the routing API. Anything else is refused here rather than
  // forwarded, so the proxy cannot be used as an open relay into the backend.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return problem(405, "method not allowed");
  }

  const headers = new Headers();
  headers.set("accept", request.headers.get("accept") || "application/json");
  const forwardedFor = request.headers.get("cf-connecting-ip");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

  let upstream;
  try {
    upstream = await fetch(origin + path + url.search, {
      method: request.method,
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e && (e.name === "TimeoutError" || e.name === "AbortError");
    return problem(504, timedOut ? "the routing backend timed out" : "the routing backend is unreachable");
  }

  // Rebuild the response so upstream caching headers cannot pin a plan (which depends
  // on the current weather) in a browser or an edge cache.
  const out = new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
  });
  const contentType = upstream.headers.get("content-type");
  if (contentType) out.headers.set("content-type", contentType);
  out.headers.set("cache-control", "no-store");
  return out;
}
