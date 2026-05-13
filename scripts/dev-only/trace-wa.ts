import fs from 'fs';
import { connectToWhatsApp, getWhatsAppStatus } from './server/whatsapp.js';

// Monkey patch console.log and console.error to write to a log file
const logStream = fs.createWriteStream('./whatsapp-debug.log', { flags: 'a' });
const origLog = console.log;
const origErr = console.error;

console.log = function(...args) {
    origLog.apply(console, args);
    logStream.write(new Date().toISOString() + ' LOG: ' + args.join(' ') + '\n');
};
console.error = function(...args) {
    origErr.apply(console, args);
    logStream.write(new Date().toISOString() + ' ERR: ' + args.join(' ') + '\n');
};

console.log('--- STARTING TRACE ---');
connectToWhatsApp(true);
