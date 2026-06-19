import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En dev, le client (5173) proxifie le WebSocket et l'API vers le serveur (3001),
// donc tout est en « même origine » côté navigateur — identique à la prod.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Autorise Vite à servir les sources du workspace `shared` (hors dossier client).
    fs: { allow: ['..'] },
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api': { target: 'http://localhost:3001' },
    },
  },
  optimizeDeps: { exclude: ['@kuhhandel/shared'] },
});
