import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
