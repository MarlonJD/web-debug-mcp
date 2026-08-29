import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

import { webDebugVitePlugin } from "../../src/adapters/vite-plugin.ts";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [webDebugVitePlugin(), vue()],
  server: {
    host: "127.0.0.1",
    port: 4176,
    strictPort: true,
  },
});
