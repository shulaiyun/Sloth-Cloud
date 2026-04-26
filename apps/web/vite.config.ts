import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';

function normalizeProxyTarget(value: string | undefined) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = normalizeProxyTarget(env.VITE_DEV_API_TARGET)
    || normalizeProxyTarget(env.VITE_API_BASE_URL)
    || 'http://127.0.0.1:14000';
  const publicBasePath = String(env.VITE_PUBLIC_BASE_PATH ?? '').trim();

  return {
    base: publicBasePath || '/',
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
