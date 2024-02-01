import { CohereClient } from "cohere-ai";
import { RerankRequestDocumentsItem } from "cohere-ai/api";
import { encode } from "gpt-tokenizer";
import { getEncoding } from "js-tiktoken";
import OpenAI from "openai";
import { ChatMessage, ChatSession, CompletionDebug, VectorDocument } from "../common/api";
import { Database, VectorStore } from "./database";

const tiktokenEncoding = getEncoding("cl100k_base");
const chatModel = "gpt-3.5-turbo-1106";
const queryExpansionModel = "gpt-3.5-turbo-1106";

export class ChatSessions {
    readonly openai: OpenAI;
    readonly cohere?: CohereClient;

    constructor(openaiKey: string, readonly database: Database, readonly vectors: VectorStore, cohereKey?: string) {
        this.openai = new OpenAI({ apiKey: openaiKey });
        if (cohereKey) {
            this.cohere = new CohereClient({ token: cohereKey });
        }
    }

    async createSession(ip: string, botId: string, sourceIds?: string[]) {
        let contextInstructions = `
In addition to the user question, you are provided with contextual information which you should use to anser the question. The format will be:
---snippet <url of snippet with id 0>
<title of snippet with id 0>
""""""
<multi-line text of snippet with id 0>
""""""
---snippet <url of snippet with id 1>
<title of snippet with id 1>
""""""
<multi-line text of snippet with id 1>
""""""
---snippet <url of snippet with id 2>
<title of snippet with id 2>
""""""
<multi-line text of snippet with id 2>
""""""
---snippet <url of snippet with id 3>
<title of snippet with id 3>
""""""
<multi-line text of snippet with id 3>
""""""
---snippet <url of snippet with id 4>
<title of snippet with id 4>
"""
<multi-line text of snippet with id 4>
"""
... more snippets ...
---question
<multi-line text of user question>

Perform these steps:
1. Answer the user question based on the snippets or say "I'm sorry I can not help with that" if you can't answer the question based on the information in the snippets.
2. Generate a 2 sentences long summary of your answer

Follow this output format exactly:
<multi-line text of your answer>
---summary
<text of your 2 sentence summary of your answer>
        `.trim();

        const bot = await this.database.getBot(botId);
        const session: ChatSession = {
            botId,
            sourceIds: sourceIds ?? bot.sources,
            createdAt: new Date().getTime(),
            lastModified: new Date().getTime(),
            debug: false,
            ip,
            messages: [],
            rawMessages: [],
        };

        const systemPrompt = bot.systemPrompt;
        if (!systemPrompt) throw new Error("Couldn't find system prompt for bot " + botId);
        const initialMessages: ChatMessage[] = [
            { role: "system", content: systemPrompt + "\n\n" + contextInstructions },
            { role: "assistant", content: bot.botWelcome ?? "How can I assist you today?" },
        ];
        session.messages.push(...initialMessages);
        session.rawMessages.push(...initialMessages);
        await this.database.setChat(session);
        return session._id!;
    }

    async expandQuery(query: string, context: string) {
        context = (context.trim().length == 0 ? "" : context.trim()) + "\n\n---rawquery\n" + query;
        const prompt = `
You will be provided with text delimited by triple quotes. It starts with an optional conversation history between
a user and an assistant, where messages by the user are delimited by ---user, and messages by the assistant are
delimited by ---assistant. After the optional conversation history, the next question by the user, delimited by
---rawquery. Your goal is it to expand this next question, while retaining its intent.

Perform these steps:
1. Read the conversation history and resolve references in the raw query to previous messages to make the raw query more precise.
2. Generate 5 alternative queries that express the same intent as the raw query.
3. Output the 5 alternative queries, one per line, without any formatting

Use this format:
<alterantive query 1>
<alterantive query 2>
<alterantive query 3>
<alterantive query 4>
<alterantive query 5>

The text:
"""
${context}
"""
`.trim();

        let start = performance.now();
        const response = await this.openai.chat.completions.create({
            model: queryExpansionModel,
            messages: [{ role: "user", content: prompt }],
            temperature: 0,
        });
        console.log("Expanding query took: " + ((performance.now() - start) / 1000).toFixed(3) + " secs");
        return response.choices[0].message.content;
    }

    async complete(sessionId: string, message: string, chunkcb: (chunk: string, type: "text" | "debug") => void) {
        const session = await this.database.getChat(sessionId);
        if (!session) throw new Error("Session does not exist");

        // Check debug flag in message
        session.debug = session.debug || message.includes("---debug");
        message = message.replaceAll("---debug", "").trim();

        // RAG, use history as part of rag query to establish more contextd
        const historyMessages: ChatMessage[] = [];
        for (let i = 1; i < session.rawMessages.length; i++) {
            const rawMessage = session.rawMessages[i];
            if ((rawMessage.content as string).includes("---topicdrift") && i > 1) {
                historyMessages.length = 0;
                historyMessages.push(session.rawMessages[1]);
            }
            historyMessages.push(rawMessage);
        }
        let ragHistory = historyMessages
            .filter((msg) => msg.role != "system")
            .map((msg) =>
                msg.content.trim().length == 0 ? "" : "---" + msg.role + "\n" + msg.content?.toString().replaceAll("---topicdrift", "").trim()
            )
            .join("\n\n");
        let ragQuery = message + "\n" + ((await this.expandQuery(message, ragHistory)) ?? "");

        // Query vector db with expanded query
        let embedStart = performance.now();
        const ragQueryVector = (await this.vectors.embedder.embed([ragQuery]))[0];
        console.log("Embedding query took: " + ((performance.now() - embedStart) / 1000).toFixed(3) + " secs");
        let queryStart = performance.now();
        const vectorQueries = session.sourceIds.map((sourceId) => this.vectors.query(sourceId, ragQueryVector, 25));
        const context = (await Promise.all(vectorQueries)).flat();
        console.log(`Querying ${session.sourceIds.length} sources took: ` + ((performance.now() - queryStart) / 1000).toFixed(3) + " secs");

        // Rerank results via cohere if enabled
        const useCohere = true;
        const k = 8;
        if (this.cohere && useCohere) {
            const start = performance.now();
            const reranked: RerankRequestDocumentsItem[] = context.map((doc) => {
                return { text: doc.text };
            });
            const response = await this.cohere.rerank({
                model: `rerank-multilingual-v2.0`,
                topN: 8,
                query: ragQuery,
                returnDocuments: false,
                documents: reranked,
            });
            const newContext: VectorDocument[] = [];
            for (const result of response.results) {
                newContext.push(context[result.index]);
            }
            context.length = 0;
            context.push(...newContext);
            console.log("Reranking took: " + ((performance.now() - start) / 1000).toFixed(3) + " secs");
        } else {
            context.length = 8;
        }

        // Create new user message, composed of user message and RAG context
        const contextContent =
            context
                .map(
                    (doc, index) =>
                        "---snippet " + doc.docUri.trim() + "\n" + doc.docTitle.trim() + "\n" + `""""""\n` + doc.text.trim() + `\n""""""\n`
                )
                .join("\n\n") + `""""""\n`;
        const messageContent = `${contextContent}\n\n---question\n${message}`;
        session.messages.push({
            role: "user",
            content: messageContent,
        });
        session.rawMessages.push({ role: "user", content: message });

        // Submit completion request to OpenAI, consisting of (summarized) history, new user message + RAG context
        let response = "";
        const submittedMessages = [session.rawMessages[0], ...historyMessages];
        submittedMessages.push(session.messages[session.messages.length - 1]);

        // Stream response. If a command is detected, stop calling the chunk callback
        // so frontend never sees commands.
        const start = performance.now();
        let tries = 2;
        let answer = "";
        while (tries > 0) {
            const stream = await this.openai.chat.completions.create({ model: chatModel, messages: submittedMessages, temperature: 0, stream: true });
            let first = true;
            let inAnswer = true;
            let waitForNextDelta = false;
            for await (const completion of stream) {
                if (first) {
                    completion.choices[0].delta.content = completion.choices[0].delta.content?.trimStart();
                    first = false;
                }

                response += completion.choices[0].delta.content ?? "";
                if (inAnswer && response.endsWith("---")) {
                    waitForNextDelta = true;
                    continue;
                }
                if (waitForNextDelta && response.endsWith("---summary")) {
                    inAnswer = false;
                    waitForNextDelta = false;
                    continue;
                }
                const delta = completion.choices[0].delta.content;
                if (inAnswer && delta && delta.length > 0) {
                    chunkcb(delta, "text");
                    answer += completion.choices[0].delta.content ?? "";
                }
            }
            if (answer.trim().length > 0) {
                if (tries < 2) {
                    const answer = submittedMessages.pop()!;
                    submittedMessages.pop();
                    submittedMessages.pop();
                    submittedMessages.push(answer);
                }
                break;
            }
            const query = submittedMessages.pop()!;
            submittedMessages.length = 2;
            submittedMessages.push(query);
            console.log("Model did not follow output format. Cutting history");
            tries--;
            answer = "";
        }

        // Check if there was topic drift
        const topicDrift = response.includes("---topicdrift");

        // Check if we should show debug output
        if (session.debug) {
            let submitted = "";
            submittedMessages.forEach((msg) => (submitted += typeof msg.content == "string" ? msg.content : ""));

            const debug: CompletionDebug = {
                query: message,
                ragHistory,
                ragQuery,
                submittedMessages: submittedMessages.map((msg) => {
                    return { role: msg.role, content: typeof msg.content == "string" ? msg.content : "" };
                }),
                response,
                tokensIn: encode(submitted).length,
                tokensOut: encode(response).length,
            };

            chunkcb(JSON.stringify(debug, null, 2), "debug");
        }

        // Record history, use summary of GPT reply instead of full reply
        const summary = response.split("---summary")[1] ?? answer.substring(0, Math.min(200, answer.length - 1)) + " ...";
        session.messages.push({ role: "assistant", content: response.split("---")[0].trim() });
        session.rawMessages.push({ role: "assistant", content: summary + (topicDrift ? "---topicdrift" : "") });
        session.lastModified = new Date().getTime();
        this.database.setChat(session);
        console.log("Completion took: " + ((performance.now() - start) / 1000).toFixed(3) + " secs");
    }
}
