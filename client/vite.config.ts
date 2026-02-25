import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
);

// https://vite.dev/config/
export default defineConfig({
  root: "client",
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
  server: {
    port: parseInt(process.env.VITE_PORT) || 3000,
  },
});
