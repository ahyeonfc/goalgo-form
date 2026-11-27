import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages(…/goalgo-form/) 아래에서 돌아가게 상대 경로로 빌드한다
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },
});
