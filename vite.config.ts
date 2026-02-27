
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Force binding to all interfaces (Wi-Fi, LAN, etc.)
    port: 5173,
    strictPort: true, // Fail if port is busy instead of switching
  },
})
