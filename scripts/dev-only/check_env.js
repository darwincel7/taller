import * as dotenv from 'dotenv';
dotenv.config();
console.log(process.env.DATABASE_URL ? "Has DATABASE_URL" : "No DATABASE_URL");
console.log(process.env.POSTGRES_URL ? "Has POSTGRES_URL" : "No POSTGRES_URL");
console.log(Object.keys(process.env).filter(k => k.toLowerCase().includes('database') || k.toLowerCase().includes('postgres') || k.toLowerCase().includes('supa')));
