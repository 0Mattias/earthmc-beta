import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, Schema, HarmCategory, HarmBlockThreshold } from '@google/genai';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

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

const SYSTEM_PROMPT = `You are a helpful database query assistant for the EarthMC Minecraft server tracker.
You are tasked with answering user questions about players, towns, nations, and their real-time or historical data.

Here is the database schema:
CREATE TABLE IF NOT EXISTS players (uuid TEXT PRIMARY KEY, name TEXT NOT NULL, first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS towns (uuid TEXT PRIMARY KEY, name TEXT NOT NULL, first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS nations (uuid TEXT PRIMARY KEY, name TEXT NOT NULL, first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS player_activity (id BIGSERIAL, snapshot_ts TIMESTAMPTZ NOT NULL, player_uuid TEXT NOT NULL, player_name TEXT NOT NULL, is_online BOOLEAN NOT NULL DEFAULT TRUE, is_visible BOOLEAN NOT NULL DEFAULT FALSE, x INTEGER, y INTEGER, z INTEGER, yaw INTEGER, world TEXT, PRIMARY KEY (id, snapshot_ts));
CREATE TABLE IF NOT EXISTS server_snapshots (id BIGSERIAL PRIMARY KEY, snapshot_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(), version TEXT, moon_phase TEXT, has_storm BOOLEAN, is_thundering BOOLEAN, server_time BIGINT, full_time BIGINT, max_players INTEGER, num_online_players INTEGER, num_online_nomads INTEGER, num_residents INTEGER, num_nomads INTEGER, num_towns INTEGER, num_town_blocks INTEGER, num_nations INTEGER, num_quarters INTEGER, num_cuboids INTEGER, vote_party_target INTEGER, vote_party_remaining INTEGER);
CREATE TABLE IF NOT EXISTS player_snapshots (id BIGSERIAL PRIMARY KEY, snapshot_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(), player_uuid TEXT NOT NULL, player_name TEXT NOT NULL, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS town_snapshots (id BIGSERIAL PRIMARY KEY, snapshot_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(), town_uuid TEXT NOT NULL, town_name TEXT NOT NULL, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS nation_snapshots (id BIGSERIAL PRIMARY KEY, snapshot_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(), nation_uuid TEXT NOT NULL, nation_name TEXT NOT NULL, data JSONB NOT NULL);

Notes:
- Always use the execute_sql tool to retrieve data to answer the user's question. 
- Ensure your SQL queries begin with SELECT or WITH.
- When the tool returns JSON database results, you MUST interpret those results and create a helpful, human-readable response based on them. Do not remain silent when data is returned.
- You are ONLY ALLOWED to make ONE tool call per query. You MUST formulate your final answer immediately after receiving the first database result. Do NOT attempt to make a second tool call.
- The UI handles the presentation, so keep your responses concise, helpful, and derived directly from the data.
`;

export async function POST(req: NextRequest) {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const { messages } = await req.json();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formattedMessages = messages.map((msg: any) => ({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: msg.content || msg.parts?.[0]?.text || '' }]
        }));

        const history = formattedMessages.slice(0, -1);
        const currentMessageText = formattedMessages[formattedMessages.length - 1].parts[0].text;

        const chat = ai.chats.create({
            model: 'gemini-3-flash-preview',
            history: history,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                tools: [{ functionDeclarations: [executeSqlTool] }],
                temperature: 0.2,
                safetySettings: [
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }
                ]
            }
        });

        const responseStream = await chat.sendMessageStream({ message: currentMessageText });

        // Create a ReadableStream to stream the response chunks back directly to the client
        const stream = new ReadableStream({
            async start(controller) {
                let toolCall = null;
                try {
                    let hasText = false;
                    let finishReason = '';

                    for await (const chunk of responseStream) {
                        if (chunk.candidates?.[0]?.finishReason) {
                            finishReason = chunk.candidates[0].finishReason;
                        }

                        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                            toolCall = chunk.functionCalls[0];
                        }
                        if (chunk.text && chunk.text.trim()) {
                            hasText = true;
                            controller.enqueue(new TextEncoder().encode(chunk.text));
                        }
                    }

                    if (!toolCall && !hasText) {
                        if (finishReason === 'SAFETY') {
                            controller.enqueue(new TextEncoder().encode("\n\n*My safety filters prevented me from answering this query.*"));
                        } else {
                            controller.enqueue(new TextEncoder().encode("\n\n*[The model returned an empty response. Wait a moment and try again.]*"));
                        }
                    }

                    if (toolCall && toolCall.name === 'execute_sql') {

                        // Execute the SQL
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const args = toolCall.args as any;
                        const query = args.query.trim();

                        if (!query.toUpperCase().startsWith('SELECT') && !query.toUpperCase().startsWith('WITH')) {
                            const errorMsg = "Error: Only SELECT queries are allowed for safety.";
                            controller.enqueue(new TextEncoder().encode(`\\n\\n[Query Error: ${errorMsg}]`));
                            controller.close();
                            return;
                        }

                        try {
                            const dbRes = await pool.query(query);
                            const dbResultStr = JSON.stringify(dbRes.rows, null, 2);

                            const finalStream = await chat.sendMessageStream({
                                message: [{
                                    functionResponse: {
                                        name: 'execute_sql',
                                        response: { result: dbResultStr }
                                    }
                                }]
                            });

                            let hasFinalText = false;
                            let finalFinishReason = '';

                            for await (const finalChunk of finalStream) {
                                if (finalChunk.candidates?.[0]?.finishReason) {
                                    finalFinishReason = finalChunk.candidates[0].finishReason;
                                }

                                if (finalChunk.functionCalls && finalChunk.functionCalls.length > 0) {
                                    controller.enqueue(new TextEncoder().encode(`\n\n*[The model attempted to make a sequential database query, which is not supported in this chat. Please ask a more specific question.]*`));
                                    hasFinalText = true;
                                }

                                if (finalChunk.text) {
                                    hasFinalText = true;
                                    controller.enqueue(new TextEncoder().encode(finalChunk.text));
                                }
                            }

                            if (!hasFinalText) {
                                if (finalFinishReason === 'SAFETY') {
                                    controller.enqueue(new TextEncoder().encode("\n\n*My safety filters prevented me from displaying these records.*"));
                                } else {
                                    // Sometimes large queries make the model output empty strings.
                                    controller.enqueue(new TextEncoder().encode(`\n\n*[The query returned data, but I could not formulate a response. Usually this happens if the result is too large. Length: ${dbResultStr.length} chars]*`));
                                }
                            }
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        } catch (dbError: any) {
                            controller.enqueue(new TextEncoder().encode(`\\n\\n[Database Error executing query: ${dbError.message}]`));
                        }
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (e: any) {
                    controller.enqueue(new TextEncoder().encode(`\\n\\n[Error: ${e.message}]`));
                } finally {
                    controller.close();
                }
            }
        });

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
            },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("Chat API Error:", error);
        return NextResponse.json({
            error: 'Internal Server Error',
            message: error.message,
            stack: error.stack,
            name: error.name
        }, { status: 500 });
    }
}
