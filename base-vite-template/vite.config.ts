import { defineConfig } from "vite";
import path from "path";
import tailwindcss from '@tailwindcss/vite'

process.env.MODE = "preview";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "::",
    port: 5173,
  },
  plugins: [tailwindcss()],
}));
