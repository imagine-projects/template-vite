import { defineConfig } from "vite";
import path from "path";
import tailwindcss from '@tailwindcss/vite';

process.env.MODE = "preview";

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "::",
    allowedHosts: true,
    port: process.env.DEV_SERVER_PORT ? parseInt(process.env.DEV_SERVER_PORT) : 3000,
  },
  plugins: [tailwindcss()],
});

