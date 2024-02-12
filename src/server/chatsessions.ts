import { CohereClient } from "cohere-ai";
import { RerankRequestDocumentsItem } from "cohere-ai/api";
import { getEncoding } from "js-tiktoken";
import OpenAI from "openai";
import { Bot, ChatMessage, ChatSession, CompletionDebug, VectorDocument } from "../common/api";
import { Database, VectorStore } from "./database";

const tiktokenEncoding = getEncoding("cl100k_base");
const queryExpansionModel = "gpt-3.5-turbo";
const RAG_MAX_DOCUMENTS = 25;

const queryExpansionInstructions = (context: string) =>
    `
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

const contextInstructions = `
The user will provide you with contextual information and a question. The format will be:
---context <url of context with id 0>
<title of context with id 0>
""""""
<multi-line text of context with id 0>
""""""
---context <url of context with id 1>
<title of context with id 1>
""""""
<multi-line text of context with id 1>
""""""
---context <url of context with id 2>
<title of context with id 2>
""""""
<multi-line text of context with id 2>
""""""
---context <url of context with id 3>
<title of context with id 3>
""""""
<multi-line text of context with id 3>
""""""
---context <url of context with id 4>
<title of context with id 4>
"""
<multi-line text of context with id 4>
"""
... more contexts ...
---question
<multi-line text of user question>

Your task is it to answer the question based on the contextual information.

Perform these steps:
1. Answer the user question based on the contextual information. If you can not give a helpful and truthful answer, say "I am sorry I can not help with that"
2. Generate a 2 sentences long summary of your answer

Follow this output format exactly:
<multi-line text of your answer>
---summary
<text of your 2 sentence summary of your answer>
        `.trim();

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
        const initialMessages = this.createInitialMessages(bot);
        session.messages.push(...initialMessages);
        session.rawMessages.push(...initialMessages);
        await this.database.setChat(session);
        return session._id!;
    }

    createInitialMessages(bot: Bot) {
        const systemPrompt = bot.systemPrompt.trim();
        if (!systemPrompt) throw new Error("Couldn't find system prompt for bot " + bot.name);
        const initialMessages: ChatMessage[] = [
            { role: "system", content: systemPrompt + "\n\n" + contextInstructions },
            { role: "assistant", content: bot.botWelcome ?? "How can I assist you today?" },
        ];
        return initialMessages;
    }

    async expandQuery(query: string, messages: ChatMessage[]) {
        const history = messages
            .filter((msg) => msg.role != "system")
            .map((msg) => (msg.content.trim().length == 0 ? "" : "---" + msg.role + "\n" + msg.content.trim()))
            .join("\n\n");
        const context = (history.trim().length == 0 ? "" : history.trim()) + "\n\n---rawquery\n" + query;
        const prompt = queryExpansionInstructions(context);

        let start = performance.now();
        const response = await this.openai.chat.completions.create({
            model: queryExpansionModel,
            messages: [{ role: "user", content: prompt }],
            temperature: 0,
        });
        console.log("Expanding query took: " + ((performance.now() - start) / 1000).toFixed(3) + " secs");
        return { expansion: response.choices[0].message.content ?? "", history };
    }

    async createContext(query: string, sourceIds: string[], bot: Bot) {
        // Embed RAG query vector
        let embedStart = performance.now();
        const ragQueryVector = (await this.vectors.embedder.embed([query]))[0];
        console.log("Embedding query took: " + ((performance.now() - embedStart) / 1000).toFixed(3) + " secs");

        // Query all RAG sources
        let queryStart = performance.now();
        const vectorQueries = sourceIds.map((sourceId) => this.vectors.query(sourceId, ragQueryVector, RAG_MAX_DOCUMENTS));
        const context = (await Promise.all(vectorQueries)).flat();
        console.log(`Querying ${sourceIds.length} sources took: ` + ((performance.now() - queryStart) / 1000).toFixed(3) + " secs");
        context.sort((a, b) => a.distance - b.distance);
        // Rerank results via Cohere if enabled and pick the top 8 results
        if (this.cohere && bot.useCohere) {
            const start = performance.now();
            const reranked: RerankRequestDocumentsItem[] = context.map((doc) => {
                return { text: doc.text };
            });
            const response = await this.cohere.rerank({
                model: `rerank-multilingual-v2.0`,
                topN: RAG_MAX_DOCUMENTS,
                query: query,
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
        }

        // Create new user message, composed of user message and RAG context
        const contextContent = context.map(
            (doc) => "---context " + doc.docUri.trim() + "\n" + doc.docTitle.trim() + "\n" + `""""""\n` + doc.text.trim() + `\n""""""`
        );
        return contextContent;
    }

    async complete(sessionId: string, question: string, chunkcb: (chunk: string, type: "text" | "debug") => void) {
        const session = await this.database.getChat(sessionId);
        if (!session) throw new Error("Session does not exist");

        const bot = await this.database.getBot(session.botId);
        if (!bot) throw new Error("Bot does not exist");

        // Check debug flag in message
        session.debug = session.debug || question.includes("---debug");
        question = question.replaceAll("---debug", "").trim();

        // Expand query for RAG
        const ragQuery = await this.expandQuery(question, session.rawMessages);

        // Create context from RAG sources
        let context = await this.createContext(ragQuery.expansion, session.sourceIds, bot);

        // Combine system messages (system + welcome), history, rag context, and question
        // Stay within token window size by
        // - fill 50% of (max tokens - system messages tokens - question tokens) with rag context
        // - filling up the remainder with history
        // - filling up the remainder with additional rag context
        let systemTokens = 0;
        for (let i = 0; i < 2; i++) {
            const msg = session.rawMessages[i];
            systemTokens += tiktokenEncoding.encode(msg.content).length;
        }
        const questionTokens = tiktokenEncoding.encode(question).length;
        let tokenBudget = bot.chatMaxTokens - systemTokens - questionTokens;
        let halfTokenBudget = tokenBudget / 2;
        let culledContext: string[] = [];
        while (context.length > 0) {
            const ctx = context.splice(0, 1)[0];
            const ctxTokens = tiktokenEncoding.encode(ctx).length;
            halfTokenBudget -= ctxTokens;
            if (halfTokenBudget < 0) {
                context = [ctx, ...context];
                break;
            }
            culledContext.push(ctx);
        }

        halfTokenBudget = tokenBudget / 2;
        let culledMessages: ChatMessage[] = [];
        for (let i = session.rawMessages.length - 1; i > 1; i--) {
            const msg = session.rawMessages[i];
            const msgTokens = tiktokenEncoding.encode(msg.content).length;
            halfTokenBudget -= msgTokens;
            if (halfTokenBudget < 0) {
                break;
            }
            culledMessages.push(msg);
        }
        culledMessages.push(session.rawMessages[1]);
        culledMessages.push(session.rawMessages[0]);
        culledMessages.reverse();

        while (context.length > 0) {
            const ctx = context.splice(0, 1)[0];
            const ctxTokens = tiktokenEncoding.encode(ctx).length;
            halfTokenBudget -= ctxTokens;
            if (halfTokenBudget < 0) {
                context = [ctx, ...context];
                break;
            }
            culledContext.push(ctx);
        }

        const messageContent = `${culledContext.join("\n\n")}\n\n---question\n${question}`;
        culledMessages.push({
            role: "user",
            content: messageContent,
        });
        session.messages.push({
            role: "user",
            content: messageContent,
        });
        session.rawMessages.push({ role: "user", content: question });
        // Submit completion request to OpenAI, consisting of (summarized) history, new user message + RAG context
        let response = "";
        const submittedMessages = [...culledMessages];

        // Stream response. If a command is detected, stop calling the chunk callback
        // so frontend never sees commands.
        const start = performance.now();
        let tries = 2;
        let answer = "";
        while (tries > 0) {
            const stream = await this.openai.chat.completions.create({
                model: bot.chatModel,
                messages: submittedMessages,
                temperature: 0,
                stream: true,
            });
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

        // Check if we should show debug output
        if (session.debug) {
            let submitted = "";
            submittedMessages.forEach((msg) => (submitted += typeof msg.content == "string" ? msg.content : ""));

            const debug: CompletionDebug = {
                query: question,
                ragQuery: ragQuery.expansion,
                ragHistory: ragQuery.history,
                submittedMessages: submittedMessages.map((msg) => {
                    return { role: msg.role, content: typeof msg.content == "string" ? msg.content : "" };
                }),
                response,
                tokensIn: tiktokenEncoding.encode(submitted).length,
                tokensOut: tiktokenEncoding.encode(response).length,
            };

            chunkcb(JSON.stringify(debug, null, 2), "debug");
        }

        // Record history, use summary of GPT reply instead of full reply
        const summary = response.split("---summary")[1] ?? answer.substring(0, Math.min(200, answer.length - 1)) + " ...";
        session.messages.push({ role: "assistant", content: response.split("---")[0].trim() });
        session.rawMessages.push({ role: "assistant", content: summary });
        session.lastModified = new Date().getTime();
        this.database.setChat(session);
        console.log("Completion took: " + ((performance.now() - start) / 1000).toFixed(3) + " secs");
    }

    async answer(botId: string, question: string, sourceIds?: string[]): Promise<{ answer: string; debug: CompletionDebug }> {
        const bot = await this.database.getBot(botId);
        if (!bot) throw new Error("Could not find bot " + botId);

        const messages = this.createInitialMessages(bot);
        sourceIds = sourceIds ?? bot.sources;
        if (sourceIds.length == 0) {
            return {
                answer: "I'm sorry I can not help with that",
                debug: {
                    query: question,
                    ragHistory: "",
                    ragQuery: question,
                    response: "I'm sorry I can not help with that",
                    submittedMessages: [],
                    tokensIn: 0,
                    tokensOut: 0,
                },
            };
        }
        let systemTokens = 0;
        for (const msg of messages) {
            systemTokens += tiktokenEncoding.encode(msg.content).length;
        }
        const questionTokens = tiktokenEncoding.encode(question).length;
        let tokenBudget = bot.answerMaxTokens - systemTokens - questionTokens;

        const context = await this.createContext(question, sourceIds, bot);
        const culledContext: string[] = [];
        for (const ctx of context) {
            const ctxTokens = tiktokenEncoding.encode(ctx).length;
            tokenBudget -= ctxTokens;
            if (tokenBudget < 0) {
                break;
            }
            culledContext.push(ctx);
        }

        const content = `${culledContext.join("\n\n")}\n\n---question\n${question}`;
        messages.push({ role: "user", content });

        const start = performance.now();
        const response = await this.openai.chat.completions.create({ model: bot.answerModel, messages, temperature: 0, stream: false });
        console.log("Answer took: " + ((performance.now() - start) / 1000).toFixed(3) + " secs");

        const answer = response.choices[0].message.content ?? "";
        return {
            answer: answer.split("---")[0],
            debug: {
                query: question,
                ragHistory: "",
                ragQuery: question,
                response: answer,
                submittedMessages: messages,
                tokensIn: response.usage?.prompt_tokens ?? 0,
                tokensOut: response.usage?.completion_tokens ?? 0,
            },
        };
    }
}
