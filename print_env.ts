import dotenv from "dotenv";
dotenv.config();

console.log("Has Service Key:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
