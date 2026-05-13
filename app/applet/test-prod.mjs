import { spawn } from 'child_process';

const server = spawn('node', ['dist/server.js'], {
  env: { ...process.env, NODE_ENV: 'production', PORT: '3001' }
});

server.stdout.on('data', console.log);
server.stderr.on('data', console.error);

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
