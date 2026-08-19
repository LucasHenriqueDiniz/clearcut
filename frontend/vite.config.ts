import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The UI shows its own version and compares it against the latest GitHub
  // release; keep that single source of truth in package.json.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Resolves the "@/*" alias straight from tsconfig.json.
  resolve: { tsconfigPaths: true },
  // Tauri's devUrl and the Docker web stack both expect 3000. Binding is left
  // at Vite's default (localhost); the container passes --host to open it up.
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    // Tauri ships its own webview, so there is no old-browser tail to support.
    target: "es2022",
    sourcemap: true,
  },
});
