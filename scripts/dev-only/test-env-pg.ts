import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();
console.log("Keys:", Object.keys(process.env).filter(k => k.toLowerCase().includes('database') || k.toLowerCase().includes('postgres')));
