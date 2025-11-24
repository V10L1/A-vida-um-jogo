import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Safely replace process.env.API_KEY with the string value
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      // Ensure process.env object exists to prevent crashes accessing other properties
      'process.env': JSON.stringify({ API_KEY: env.API_KEY || '' }),
    },
    server: {
      host: true
    }
  };
});