import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  /*
   * `host: true` fait ecouter le serveur sur toutes les interfaces reseau.
   *
   * Par defaut Vite ne repond que sur 127.0.0.1 : un telephone du meme reseau
   * local obtient un delai d'attente, sans rien qui explique pourquoi. C'est
   * necessaire pour essayer le CRM sur mobile.
   *
   * Cela n'expose que le reseau local, pas Internet -- et uniquement tant que
   * `npm run dev` tourne.
   */
  server: { host: true },
  preview: { host: true },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
