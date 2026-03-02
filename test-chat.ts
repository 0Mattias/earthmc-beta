import { GoogleGenAI, Type, Schema } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const executeSqlSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        query: {
            type: Type.STRING,
            description: "A secure, read-only PostgreSQL SELECT query to execute against the EarthMC tracker database."
        }
    },
    required: ["query"]
};

const executeSqlTool = {
    name: "execute_sql",
    description: "Executes a SELECT query against the EarthMC database to answer the user's question.",
    parameters: executeSqlSchema
};

async function run() {
    const chat = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
            tools: [{ functionDeclarations: [executeSqlTool] }],
            temperature: 0.2
        }
    });

    try {
        console.log("Sending message...");
        const responseStream = await chat.sendMessageStream("Tell me about London by querying the database.");
        
        let toolCall = null;
        for await (const chunk of responseStream) {
            console.log("Chunk:", JSON.stringify(chunk, null, 2));
            if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                toolCall = chunk.functionCalls[0];
            }
        }

        if (toolCall) {
            console.log("Got tool call:", toolCall);
            // Send response back
            const finalStream = await chat.sendMessageStream([{
                functionResponse: {
                    name: 'execute_sql',
                    response: { result: "London is a great town." }
                }
            }]);
            for await (const chunk of finalStream) {
                console.log("Final chunk text:", chunk.text);
            }
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
