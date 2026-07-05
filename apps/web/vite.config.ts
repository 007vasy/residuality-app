import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, proxy API/WS to the local API server. In the Docker image the built
// assets are served by nginx which proxies /api, /ws, and /mcp to the api service.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4099", changeOrigin: true },
      "/ws": { target: "ws://localhost:4099", ws: true },
      "/mcp": { target: "http://localhost:4099", changeOrigin: true },
    },
  },
});
