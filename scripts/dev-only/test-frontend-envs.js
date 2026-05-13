import fs from 'fs';
const html = fs.readFileSync('index.html', 'utf-8');
console.log("Does HTML have hardcoded envs? No, Vite injects them at build/serve.");
