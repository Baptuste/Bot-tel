import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// La Mini App est servie soit par le serveur Node (web/dist en prod),
// soit par ce serveur de dev (via un tunnel cloudflared).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    // cloudflared expose un hote aleatoire *.trycloudflare.com : on l'autorise.
    allowedHosts: true,
    // en dev, les appels /api sont renvoyes vers le serveur Node du bot.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
