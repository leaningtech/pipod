import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The installed BrowserPod version, shown in the "Powered by" links
const browserpodVersion = JSON.parse(readFileSync('node_modules/@leaningtech/browserpod/package.json', 'utf-8')).version;

// https://vitejs.dev/config/
export default defineConfig({
  // Vite only exposes prefixed variables to the page; allow BP_APIKEY as well as VITE_*
  envPrefix: ['VITE_', 'BP_'],
  define: {
    __BROWSERPOD_VERSION__: JSON.stringify(browserpodVersion)
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  optimizeDeps: {
    exclude: ['@sipphq/sipp']
  }
});
