import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: "AIzaFAKEKEY" });
const chat = ai.chats.create({ model: "gemini-3-flash-preview" });

try {
    const params = {
        message: [{
            functionResponse: {
                name: 'execute_sql',
                response: { result: "some result" }
            }
        }]
    };
    
    // We can't access tContent directly, but we can access history!
    chat.sendMessageStream(params).catch(()=>{}).finally(()=>{
        console.log(JSON.stringify(chat.getHistory(), null, 2));
    });
} catch (e) {
    console.log(e);
}
