import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import App from "./App";
import { I18nProvider } from "./lib/i18n";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

// reducedMotion="user": when the system asks for reduced motion, framer drops every
// transform and layout animation app-wide (an overlay fades in place instead of
// rising) and keeps the rest, opacity included. Framer listens to the setting, and
// each element reads it when it mounts, so an overlay opened after a change already
// follows it. CSS motion has its own rule in index.css; the home-to-map morph follows
// the scroll position, and useMorphProgress handles it.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <App />
        </I18nProvider>
      </QueryClientProvider>
    </MotionConfig>
  </React.StrictMode>
);
