import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Vital fix: Ensure API_KEY is always a string ("" if missing) to prevent 
      // 'process is not defined' errors in the browser.
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      // Prevent other 'process' access crashes
      'process.env': {}
    }
  };
});