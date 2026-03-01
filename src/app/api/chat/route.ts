import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, Schema } from '@google/genai';
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
- The UI handles the presentation, so keep your responses concise, helpful, and derived directly from the data.
`;

export async function POST(req: NextRequest) {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const { messages } = await req.json();

        // Add system prompt to the beginning of the messages
        const fullMessages = [
            { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
            { role: 'model', parts: [{ text: "Understood. I await your queries." }] },
            ...messages
        ];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formattedMessages = fullMessages.map((msg: any) => ({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: msg.content || msg.parts?.[0]?.text || '' }]
        }));

        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-3.0-flash',
            contents: formattedMessages,
            config: {
                tools: [{ functionDeclarations: [executeSqlTool] }],
                temperature: 0.2
            }
        });

        // Create a ReadableStream to stream the response chunks back directly to the client
        const stream = new ReadableStream({
            async start(controller) {
                let toolCall = null;

                try {
                    for await (const chunk of responseStream) {
                        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                            toolCall = chunk.functionCalls[0];
                            break; // Stop streaming text, we need to handle the tool execution
                        }
                        if (chunk.text && chunk.text.trim()) {
                            controller.enqueue(new TextEncoder().encode(chunk.text));
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

                        // We can optionally send exactly what query was run back to the user
                        // controller.enqueue(new TextEncoder().encode(`\n\n*Executing Query: ${query}*`));

                        try {
                            const dbRes = await pool.query(query);
                            const dbResultStr = JSON.stringify(dbRes.rows, null, 2);

                            // Send another request to Gemini with the tool output
                            const followupContents = [
                                ...formattedMessages,
                                {
                                    role: 'model',
                                    parts: [{ functionCall: toolCall }]
                                },
                                {
                                    role: 'user',
                                    parts: [{
                                        functionResponse: {
                                            name: 'execute_sql',
                                            response: { result: dbResultStr }
                                        }
                                    }]
                                }
                            ];

                            const finalStream = await ai.models.generateContentStream({
                                model: 'gemini-3.0-flash',
                                contents: followupContents,
                                config: { temperature: 0.2 }
                            });

                            for await (const finalChunk of finalStream) {
                                if (finalChunk.text) {
                                    controller.enqueue(new TextEncoder().encode(finalChunk.text));
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
