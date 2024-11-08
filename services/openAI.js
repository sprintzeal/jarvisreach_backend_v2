

import dotenv from "dotenv";
// Load environment variables from .env file
dotenv.config();
import OpenAI from 'openai';

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Function to call the ChatGPT API
export async function promptChatgpt(prompt) {
    const chatCompletion = await client.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'gpt-3.5-turbo',
    });

    return chatCompletion
}
