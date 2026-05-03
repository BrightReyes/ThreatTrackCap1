import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const firebaseRoot = path.resolve(__dirname, 'node_modules/firebase');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^firebase\/(.+)$/,
        replacement: `${firebaseRoot.replace(/\\/g, '/')}/$1`,
      },
    ],
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        login: path.resolve(__dirname, 'login.html'),
        dashboard: path.resolve(__dirname, 'dashboard.html'),
        incidents: path.resolve(__dirname, 'incidents.html'),
        analytics: path.resolve(__dirname, 'analytics.html'),
        users: path.resolve(__dirname, 'users.html'),
        notifications: path.resolve(__dirname, 'notifications.html'),
        settings: path.resolve(__dirname, 'settings.html'),
      },
    },
  },
});
