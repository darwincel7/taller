import dotenv from 'dotenv';
dotenv.config();
console.log("URL:", process.env.VITE_SUPABASE_URL);
console.log("KEY:", process.env.VITE_SUPABASE_ANON_KEY);
