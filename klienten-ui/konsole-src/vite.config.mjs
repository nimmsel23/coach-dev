import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react()],
  publicDir: "public",
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:9150",
      "/k/": "http://127.0.0.1:9150",
      "/konsole/api": "http://127.0.0.1:9150",
      "/integrations": "http://127.0.0.1:9150",
      "/schmiede": "http://127.0.0.1:9150",
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../konsole"),
    assetsDir: "assets",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        konsole: path.resolve(__dirname, "konsole.html"),
      },
    },
  },
});
