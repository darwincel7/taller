import dotenv from "dotenv";
dotenv.config();

console.log("Has DB_PASSWORD:", !!process.env.DB_PASSWORD);
