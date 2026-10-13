/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_MODE: "mock" | "live";
  readonly VITE_API_BASE: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
// package.json's version, injected by vite.config.ts (`define`).
declare const __APP_VERSION__: string;
