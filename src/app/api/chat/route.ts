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

const queryAndAnalyzeSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        query: {
            type: Type.STRING,
            description: "A secure, read-only PostgreSQL SELECT query to execute against the EarthMC tracker database. Use this for queries that return massive amounts of rows."
        },
        analysis_goal: {
            type: Type.STRING,
            description: "A highly detailed prompt instructing the Subagent on exactly what data you are looking for and how it should summarize the raw JSON."
        }
    },
    required: ["query", "analysis_goal"]
};

const queryAndAnalyzeTool = {
    name: "query_and_analyze",
    description: "Executes a large SELECT query and silently passes the raw JSON results to a background Gemini Subagent. The Subagent deeply analyzes the rows based on your `analysis_goal` and returns only a concise text summary back to you. Use this for big data aggregations, large player listings, or whenever a query might return hundreds of rows that would clutter the main chat.",
    parameters: queryAndAnalyzeSchema
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

Data Frequency Context:
- The database logs player coordinates and online activity ('player_activity') roughly every 3 seconds.
- General server data (player stats, towns, nations from the 'snapshots' tables) is only logged every 3 minutes.
- ALWAYS rely on 'player_activity' for anything involving online status, current locations, or THE TOTAL ONLINE PLAYER COUNT. Do not use 'server_snapshots' to check how many players are online, as it is 3 minutes stale.
- Keep this context in mind if you give strategic advice regarding movement speeds, tracking, or stale town data.

Interactive Tags:
To make the chat UI interactive, YOU MUST use the following special tags in your response when referencing entities or actions. The UI will parse these into clickable buttons/links.
1. When mentioning a Player, wrap their name: '[player:PlayerName]'
2. When mentioning a Town, wrap its name: '[town:TownName]'
3. When mentioning a Nation, wrap its name: '[nation:NationName]'
4. If you report a player's coordinates (whether online or last seen), ALWAYS append a map action button at the very end of your message: '[action:map:X:Z]' (replace X and Z with the integers).
5. If you talk about a player and you know their UUID from the activity tables, ALWAYS append a draw path action button at the end of your message: '[action:path:UUID:PlayerName]'
6. ALWAYS wrap your internal thought processes or general reasoning in this tag: '[thought:Your thought process here...]'
7. Before calling a database tool, wrap your thought in a query tag instead: '[query:I am executing a SQL scan...]'

SQL Structure Rules (CRITICAL FOR ACCURATE DATA):
- ALWAYS use 'ILIKE' instead of '=' when searching by player, town, or nation names to ensure case-insensitivity.
- EVER ONLY query the main 'player_activity' table. NEVER query physical partition storage buckets directly (e.g. 'player_activity_2026...').
- To find if a player is CURRENTLY online: "SELECT x, y, z, world, snapshot_ts FROM player_activity WHERE player_name ILIKE 'xyz' AND snapshot_ts = (SELECT MAX(snapshot_ts) FROM player_activity WHERE snapshot_ts >= NOW() - INTERVAL '5 minutes') AND is_online = true". If this returns 0 rows, THEY ARE CURRENTLY OFFLINE. If it returns rows, report them as online.
- ALWAYS append "ORDER BY snapshot_ts DESC LIMIT 1" when asking about the historical/current state of towns or nations, otherwise you will fetch thousands of outdated historical logs.

Agentic Transparency & Quota Guardrails:
- All "[thought:...]" and "[query:...]" tags MUST be placed contiguously at the VERY BEGINNING of your response. NEVER intersperse regular text between these tags. ONLY output regular text to the user once you are completely finished with all thoughts and queries.
- Before executing ANY database tools, you MUST explicitly "think out loud" in a conversational sentence, AND you MUST wrap it in a query tag: "[query:Let me check the database for current online players...]".
- For general planning or reasoning (like responding to "hi"), use the thought tag: "[thought:Greeting the user and explaining my role.]".
- NEVER leave the user waiting silently without a "[query:...]" tag.
- PREVENT INFINITE LOOPING / QUOTA BURN: If you search the database for a specific player, town, or nation, and the query returns 0 rows (meaning they do not exist), you are permitted ZERO (0) retries.
- DO NOT RETRY with wildcard matches (e.g. "%xyz%"), DO NOT try splitting words, and DO NOT guess string permutations. 
- You MUST immediately stop querying and gracefully tell the user that the entity does not exist in the database.

Open-Ended / Vague Queries Strategy:
- If the user asks a highly open-ended question like "find someone online who is easy to jump" or "who is the richest town?", DO NOT query individuals one-by-one in an infinite loop.
- You MUST construct a single, highly-filtered SQL query to find the best matching results. Be creative: e.g. for "easy to jump", you might select an online player who has no town ('hasTown: false' in data JSON or 'num_towns = 0' depending on table) and return 'ORDER BY RANDOM() LIMIT 5'.
- Use SQL features like 'WHERE', 'ORDER BY', 'LIMIT 10', and joins to aggregate and filter exactly what you need in ONE or TWO tool calls.

- You can query up to 20 times in a row. If you hit an error, read it, fix your query, and try again.
- The UI handles the presentation, so keep your responses concise, helpful, and derived directly from the data.
- STRICT DOMAIN RESTRICTION: You must only answer questions related to EarthMC, Minecraft, or the data in the database. Refuse to answer general questions, help with code, roleplay, or discuss unrelated topics.
- STRICT FORMATTING: DO NOT use bolding (**), asterisks (*), or emojis under any circumstances. Format your text plainly. MAKE SURE TO ADD A NEWLINE OR REAL SPACES BETWEEN DIFFERENT PLAYERS AND UI ACTION TAGS so the buttons don't clump together in a single run-on sentence.
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
                tools: [{ functionDeclarations: [executeSqlTool, queryAndAnalyzeTool] }],
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
                    // Initialize the conversation data
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let nextMessage: any = currentMessageText;
                    const maxIter = 20;
                    let iter = 0;
                    let generatedSomeText = false;
                    let lastToolCall = null;

                    while (iter < maxIter) {
                        iter++;
                        let responseStream;
                        try {
                            // Send the next message/tool response
                            responseStream = await chat.sendMessageStream({ message: nextMessage });
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

                            nextMessage = [{
                                functionResponse: {
                                    name: 'execute_sql',
                                    response: { result: dbResultStr }
                                }
                            }];
                        } else if (toolCall.name === 'query_and_analyze') {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const args = toolCall.args as any;
                            const query = args.query ? args.query.trim() : "";
                            const analysisGoal = args.analysis_goal || "";

                            let subagentResponseStr = "";
                            if (!query.toUpperCase().startsWith('SELECT') && !query.toUpperCase().startsWith('WITH')) {
                                subagentResponseStr = "Error: Only SELECT queries are allowed.";
                            } else {
                                try {
                                    const dbRes = await pool.query(query);
                                    let dbResultStr = JSON.stringify(dbRes.rows, null, 2);

                                    // Truncate massively gigantic JSON so the subagent doesn't crash on input limit
                                    if (dbResultStr.length > 500000) {
                                        dbResultStr = dbResultStr.substring(0, 500000) + "\n\n...[TRUNCATED DUE TO EXTREME SIZE]...";
                                    }

                                    // Spin up a one-shot subagent to read the JSON
                                    const subagent = ai.models.generateContent({
                                        model: 'gemini-3-flash-preview',
                                        contents: `You are a strict data-analyst subagent for the EarthMC Agent. You have been handed raw JSON data from the PostgreSQL tracker. Look at the data and fulfill the analysis_goal exactly as requested. Keep your answer extremely concise, entirely factual, and do not use markdown formatting like asterisks.
                                        
Analysis Goal: ${analysisGoal}

Row Count: ${dbRes.rows.length}
Raw Data:
${dbResultStr}`
                                    });

                                    const response = await subagent;
                                    subagentResponseStr = response.text || "Subagent failed to generate an analysis.";

                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                } catch (dbError: any) {
                                    subagentResponseStr = `Subagent/Database Error: ${dbError.message}`;
                                }
                            }

                            nextMessage = [{
                                functionResponse: {
                                    name: 'query_and_analyze',
                                    response: { result: subagentResponseStr }
                                }
                            }];
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
