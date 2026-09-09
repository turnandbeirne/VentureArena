// DEV-ONLY: `npx vite --config vite.preview.config.js` serves the Arena
// screens against dev-mock-supabase.js (no backend needed) via preview.html.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const MOCK = fileURLToPath(new URL('./src/dev-mock-supabase.js', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'mock-supabase-client',
      enforce: 'pre',
      load(id) {
        if (/\/src\/lib\/supabaseClient\.js$/.test(id)) return readFileSync(MOCK, 'utf8');
        return null;
      },
    },
  ],
  server: { port: 5199, strictPort: true },
});
