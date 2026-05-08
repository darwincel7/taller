import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
    apiKey: "proxy",
    httpOptions: {
        baseUrl: "http://localhost:3000/api/google-genai"
    }
});
console.log(ai);
