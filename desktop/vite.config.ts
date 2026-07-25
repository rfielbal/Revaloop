import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // Les WebView2 et WKWebView supportés par cette alpha comprennent ES2021.
    // Éviter ici un lowering Safari 13 que Rolldown/esbuild ne peut pas
    // appliquer correctement aux dépendances React modernes.
    target: "es2021",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
});
