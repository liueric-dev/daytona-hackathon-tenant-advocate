import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = 'http://localhost:3001';

// In dev the browser talks only to Vite (same origin), and Vite forwards API calls to the server.
// That keeps the session cookie first-party and the server's Origin check satisfied.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': API, '/auth': API },
  },
});
