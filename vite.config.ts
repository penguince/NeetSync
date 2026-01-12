import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/background.ts'),
        popup: resolve(__dirname, 'src/ui/popup/popup.ts'),
        options: resolve(__dirname, 'src/ui/options/options.ts'),
      },
      output: {
        format: 'es',
        inlineDynamicImports: false,
        manualChunks: undefined,
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'background.js';
          }
          if (chunkInfo.name === 'popup') {
            return 'popup.js';
          }
          if (chunkInfo.name === 'options') {
            return 'options.js';
          }
          return '[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return '[name][extname]';
          }
          return 'assets/[name][extname]';
        },
      },
    },
    target: 'esnext',
    minify: false,
    sourcemap: false,
  },
  plugins: [
    {
      name: 'copy-extension-files',
      closeBundle() {
        const distDir = resolve(__dirname, 'dist');
        
        // Ensure content directory exists for esbuild
        if (!existsSync(resolve(distDir, 'content'))) {
          mkdirSync(resolve(distDir, 'content'), { recursive: true });
        }
        
        // Copy manifest.json
        copyFileSync(
          resolve(__dirname, 'src/manifest.json'),
          resolve(distDir, 'manifest.json')
        );
        
        // Copy icons
        const publicDir = resolve(__dirname, 'public');
        if (!existsSync(resolve(distDir, 'icons'))) {
          mkdirSync(resolve(distDir, 'icons'), { recursive: true });
        }
        
        const icons = ['icon16.png', 'icon48.png', 'icon128.png'];
        icons.forEach((icon) => {
          const src = resolve(publicDir, icon);
          const dest = resolve(distDir, 'icons', icon);
          if (existsSync(src)) {
            copyFileSync(src, dest);
          }
        });
        
        // Copy and transform popup.html
        let popupHtml = readFileSync(resolve(__dirname, 'src/ui/popup/popup.html'), 'utf-8');
        popupHtml = popupHtml
          .replace('href="popup.css"', 'href="popup.css"')
          .replace('src="popup.ts"', 'src="popup.js"')
          .replace('src="../../icons/icon48.png"', 'src="icons/icon48.png"')
          .replace('type="module"', '');
        writeFileSync(resolve(distDir, 'popup.html'), popupHtml);
        
        // Copy popup.css
        copyFileSync(
          resolve(__dirname, 'src/ui/popup/popup.css'),
          resolve(distDir, 'popup.css')
        );
        
        // Copy and transform options.html
        let optionsHtml = readFileSync(resolve(__dirname, 'src/ui/options/options.html'), 'utf-8');
        optionsHtml = optionsHtml
          .replace('href="options.css"', 'href="options.css"')
          .replace('src="options.ts"', 'src="options.js"')
          .replace('src="../../icons/icon48.png"', 'src="icons/icon48.png"')
          .replace('type="module"', '');
        writeFileSync(resolve(distDir, 'options.html'), optionsHtml);
        
        // Copy options.css
        copyFileSync(
          resolve(__dirname, 'src/ui/options/options.css'),
          resolve(distDir, 'options.css')
        );
        
        console.log('Extension files copied successfully!');
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});

