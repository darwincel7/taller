import { spawn } from 'child_process';
import fetch from 'node-fetch';

const server = spawn('node', ['dist/server.js'], {
  env: { ...process.env, NODE_ENV: 'production', PORT: '3001' }
});

setTimeout(async () => {
  try {
    const res = await fetch('http://localhost:3001/api/whatsapp/status');
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  } catch(e) {
    console.error(e);
  }
  server.kill('SIGKILL');
  process.exit(0);
}, 3000);
