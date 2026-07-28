import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(() => {
    return {
      server: {
        proxy: {
          '/api': 'http://127.0.0.1:8788',
          '/v1': 'http://127.0.0.1:8788',
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
