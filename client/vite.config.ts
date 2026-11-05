import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Makes the app installable, and generates the service worker
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "OrgPulse",
        short_name: "OrgPulse",
        description: "Smart notifications for organisations",
        theme_color: "#0e7c66",
        background_color: "#faf8f5",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  // The API only accepts requests from port 5173, so never quietly move to another port
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
