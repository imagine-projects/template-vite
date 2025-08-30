import { defineConfig } from "vite";
import path from "path";
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite'

process.env.MODE = "preview";

let count = 0;
setInterval(() => {
  console.log('hello', count++);
}, 1000);

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
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    hmr: process.env.DISABLE_HMR === 'true' ? false : true,
  },
  plugins: [tanstackRouter({
    target: 'react',
    autoCodeSplitting: true,
  }), tailwindcss(), react()],
});

