import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { webDebugVitePlugin } from "../../src/adapters/vite-plugin.ts";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [webDebugVitePlugin(), react()],
  server: {
    host: "127.0.0.1",
    port: 4186,
    strictPort: true,
  },
});
