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
- If necessary, make multiple sequential tool calls to gather all required information. Handle database errors gracefully by adjusting your query to fix issues like syntax errors.
- To find a player's last known coordinates (especially if they are offline), query the player_activity table by ordering by snapshot_ts DESC with LIMIT 1. Example: SELECT x, y, z, world, snapshot_ts FROM player_activity WHERE player_name ILIKE 'xyz' ORDER BY snapshot_ts DESC LIMIT 1.
- You can query up to 10 times in a row. If you hit an error, read it, fix your query, and try again.
- The UI handles the presentation, so keep your responses concise, helpful, and derived directly from the data.
- STRICT DOMAIN RESTRICTION: You must only answer questions related to EarthMC, Minecraft, or the data in the database. Refuse to answer general questions, help with code, roleplay, or discuss unrelated topics.
- STRICT FORMATTING: DO NOT use bolding (**), asterisks (*), or emojis under any circumstances. Format your text plainly.
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

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Initialize the conversation for this specific turn
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const turnMessages: any[] = [{ role: 'user', parts: [{ text: currentMessageText }] }];
                    const maxIter = 10;
                    let iter = 0;
                    let generatedSomeText = false;
                    let lastToolCall = null;

                    while (iter < maxIter) {
                        iter++;
                        let responseStream;
                        try {
                            // Send the entire accumulated chain for this turn
                            responseStream = await chat.sendMessageStream({ message: [...turnMessages] });
                            // Clear turnMessages so we can accumulate the model's new response parts
                            turnMessages.length = 0;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        } catch (e: any) {
                            controller.enqueue(new TextEncoder().encode(`\n\n[Chat API Error: ${e.message}]`));
                            break;
                        }

                        let toolCall = null;
                        let finishReason = '';

                        for await (const chunk of responseStream) {
                            if (chunk.candidates?.[0]?.finishReason) {
                                finishReason = chunk.candidates[0].finishReason;
                            }

                            if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                                toolCall = chunk.functionCalls[0];
                            }
                            if (chunk.text && chunk.text.trim()) {
                                generatedSomeText = true;
                                controller.enqueue(new TextEncoder().encode(chunk.text));
                            }
                        }

                        lastToolCall = toolCall;

                        if (!toolCall) {
                            if (!generatedSomeText) {
                                if (finishReason === 'SAFETY') {
                                    controller.enqueue(new TextEncoder().encode("\n\n[My safety filters prevented me from answering this query.]"));
                                } else {
                                    controller.enqueue(new TextEncoder().encode("\n\n[The model returned an empty response. Wait a moment and try again.]"));
                                }
                            }
                            break; // Stop looping if the model gives a final text answer without a tool call
                        }

                        if (toolCall.name === 'execute_sql') {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const args = toolCall.args as any;
                            const query = args.query ? args.query.trim() : "";

                            let dbResultStr = "";
                            if (!query.toUpperCase().startsWith('SELECT') && !query.toUpperCase().startsWith('WITH')) {
                                dbResultStr = "Error: Only SELECT queries are allowed.";
                            } else {
                                try {
                                    const dbRes = await pool.query(query);
                                    dbResultStr = JSON.stringify(dbRes.rows, null, 2);
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                } catch (dbError: any) {
                                    dbResultStr = `Database Error: ${dbError.message}`;
                                }
                            }

                            // The model MUST see its own tool call and the subsequent tool result
                            turnMessages.push({
                                role: 'model',
                                parts: [{
                                    functionCall: {
                                        name: 'execute_sql',
                                        args: args
                                    }
                                }]
                            });

                            turnMessages.push({
                                role: 'user', // In Gemini, tool results are often passed back as user/function roles 
                                parts: [{
                                    functionResponse: {
                                        name: 'execute_sql',
                                        response: { result: dbResultStr }
                                    }
                                }]
                            });
                        }
                    }

                    if (iter >= maxIter && lastToolCall) {
                        controller.enqueue(new TextEncoder().encode("\n\n[Max internal query sequence reached.]"));
                    }

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (e: any) {
                    controller.enqueue(new TextEncoder().encode(`\n\n[Error: ${e.message}]`));
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
