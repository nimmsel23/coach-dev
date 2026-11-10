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
    port: 5915,
    proxy: {
      "/api": "http://127.0.0.1:9150",
      "/k/": "http://127.0.0.1:9150",
      "/yuhonas": "http://127.0.0.1:9150",
      "/exercises": "http://127.0.0.1:9150",
      "/coach": "http://127.0.0.1:9150",
      "/_klienten": "http://127.0.0.1:9150",
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../schmiede"),
    assetsDir: "assets",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        klienten: path.resolve(__dirname, "klienten.html"),
      },
    },
  },
});
