import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      // selfDestroying: true,

      pwaAssets: {
        disabled: false,
        config: true,
      },

      manifest: {
        name: "Progressive Web App Builder",
        short_name: "PWA Builder",
        description: "Making PWA applications easier and faster",
        theme_color: "#ffffff",
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          // {
          //   urlPattern: /\/routes.json$/,
          //   handler: "CacheFirst",
          //   options: {
          //     cacheName: "routes-cache",
          //     expiration: {
          //       maxEntries: 10,
          //       // maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
          //       maxAgeSeconds: 60 * 3, // <== 3 minutes
          //     },
          //     cacheableResponse: {
          //       statuses: [0, 200],
          //     },
          //   },
          // },
        ],
      },
      // includeAssets: ["/routes.json"],

      devOptions: {
        enabled: false,
        navigateFallback: "index.html",
        suppressWarnings: true,
        type: "module",
      },
    }),
  ],
});
