import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(() => {
    const apiOrigin = process.env.LABLINEAGE_API_ORIGIN || 'http://127.0.0.1:8788';
    return {
      server: {
        proxy: {
          '/api': apiOrigin,
          '/v1': apiOrigin,
        },
      },
      plugins: [tailwindcss(), react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
