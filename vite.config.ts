
/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  define: {
    'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY),
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
  },
  server: {
    host: '0.0.0.0', // Force binding to all interfaces (Wi-Fi, LAN, etc.)
    port: 3000,
    strictPort: true, // Fail if port is busy instead of switching
    allowedHosts: true, // Allow all hosts for ngrok/tunneling
  },
})
