import { CohereClient } from "cohere-ai";
import { RerankRequestDocumentsItem } from "cohere-ai/api";
import { encode } from "gpt-tokenizer";
import { getEncoding } from "js-tiktoken";
import OpenAI from "openai";
import { ChatMessage, ChatSession, CompletionDebug, VectorDocument } from "../common/api";
import { Database, VectorStore } from "./database";

const tiktokenEncoding = getEncoding("cl100k_base");
const chatModel = "gpt-3.5-turbo";
const queryExpansionModel = "gpt-3.5-turbo";

export class ChatSessions {
    readonly openai: OpenAI;
    readonly cohere?: CohereClient;

    constructor(openaiKey: string, readonly database: Database, readonly vectors: VectorStore, cohereKey?: string) {
        this.openai = new OpenAI({ apiKey: openaiKey });
        if (cohereKey) {
            this.cohere = new CohereClient({ token: cohereKey });
        }
    }

    async createSession(ip: string, collectionId: string, sourceId?: string) {
        const contextInstructions = `
You are given a context and a user question in this format:

\`\`\`
###context-0
... context text ...
###context-1
... context text ...
...
###question
... user question ...
\`\`\`

Follow these steps to answer:
- Read the query, which is delimited by ###question
- Read the context sections
- Take the conversation history into account.
- For each context section you have used, output ###context-<id-of-section>.
- If the user changes topic, print ###topicdrift. The initial topic is unknown, so do not print ###topicdrift in your first response
- IMPORTANT: Never output the text of a context section in your answer! THIS IS VERY IMPORTANT!
- IMPORTANT: After you print your answer, print ###summary, followed by a single sentence summarizing your answer!
- IMPORTANT: Answer in the language of the query!

You MUST give your answer in this format:

\`\`\`
... your answer ...
###context-1
###context-4
###summary
... your single sentence summary ...
###topicdrift
\`\`\`

Remember: NEVER forget to output the single sentence summary!
        `;

        const session: ChatSession = {
            collectionId,
            sourceId,
            createdAt: new Date().getTime(),
            lastModified: new Date().getTime(),
            debug: false,
            ip,
            messages: [],
            rawMessages: [],
        };
        // new ChatSession(ip);
        const systemPrompt = (await this.database.getCollection(collectionId)).systemPrompt;
        if (!systemPrompt) throw new Error("Couldn't find system prompt for collection " + collectionId);
        session.messages.push({ role: "system", content: systemPrompt + "\n\n" + contextInstructions });
        session.rawMessages.push({ role: "system", content: systemPrompt + "\n\n" + contextInstructions });
        await this.database.setChat(session);
        return session._id!;
    }

    async expandQuery(query: string, context: string) {
        const systemMessage = `
You are a query expansion system. You are given a user query and a optional conversation history in this format:
\`\`\`
###history
###user
... user message ...
###assistant
... assistant message ...
###user
...user message ...
###assistant
... assistant message ...
...
###raw query
... the raw user query to expand ...
\`\`\`

Follow these steps:

1. Read the raw user query and the optional history. If the history is empty or is not related to the raw user query, ignore it. This forms your context.
2. Based on the context, create 5 unique and relevant query variations. Do not use names or nouns that are not in the context.
3. Output each query variation on its own line, without any additional formatting or labels.
`.trim();
        let start = performance.now();
        const response = await this.openai.chat.completions.create({
            model: queryExpansionModel,
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: (context.trim().length == 0 ? "" : "\n\n###history" + context.trim()) + "\n\n###raw query\n" + query },
            ],
        });
        console.log("Expanding query took: " + ((performance.now() - start) / 1000).toFixed(3) + " secs");
        return response.choices[0].message.content;
    }

    async complete(sessionId: string, message: string, chunkcb: (chunk: string, type: "text" | "debug") => void) {
        const session = await this.database.getChat(sessionId);
        if (!session) throw new Error("Session does not exist");
        message = message.trim();

        // Check debug flag in message
        session.debug = session.debug || message.includes("###debug");
        message = message.replaceAll("###debug", "");

        // RAG, use history as part of rag query to establish more context
        const historyMessages: ChatMessage[] = [];
        for (const rawMessage of session.rawMessages) {
            if (rawMessage.role == "system") continue;
            if ((rawMessage.content as string).includes("###topicdrift")) {
                historyMessages.length = 0;
            }
            historyMessages.push(rawMessage);
        }
        let ragHistory =
            "###history\n" +
            historyMessages
                .filter((msg) => msg.role != "system")
                .map((msg) =>
                    msg.content.trim().length == 0 ? "" : "###" + msg.role + "\n" + msg.content?.toString().replaceAll("###topicdrift", "").trim()
                )
                .join("\n\n");
        let ragQuery = message + "\n" + ((await this.expandQuery(message, ragHistory)) ?? "");

        // Query vector db with expanded query
        const context = await this.vectors.query(session.collectionId, session.sourceId, ragQuery, 25);

        // Rerank results via cohere if enabled
        if (this.cohere) {
            const reranked: RerankRequestDocumentsItem[] = context.map((doc) => {
                return { text: doc.text };
            });
            const response = await this.cohere.rerank({
                model: `rerank-multilingual-v2.0`,
                topN: 5,
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
        }

        // Create new user message, composed of user message and RAG context
        const contextContent = context.map((doc, index) => "###context-" + index + "\n" + doc.docTitle + "\n" + doc.text).join("\n\n");
        const messageContent = `${contextContent}\n\n###question\n${message}`;
        session.messages.push({
            role: "user",
            content: messageContent,
        });
        session.rawMessages.push({ role: "user", content: message });

        // Submit completion request to OpenAI, consisting of (summarized) history, new user message + RAG context
        let response = "";
        const submittedMessages = [session.rawMessages[0], ...historyMessages];
        submittedMessages.push(session.messages[session.messages.length - 1]);
        const stream = await this.openai.chat.completions.create({ model: chatModel, messages: submittedMessages, stream: true });

        // Stream response. If a command is detected, stop calling the chunk callback
        // so frontend never sees commands.
        let first = true;
        let commandCharFound = false;
        for await (const completion of stream) {
            if (first) {
                completion.choices[0].delta.content = completion.choices[0].delta.content?.trimStart();
                first = false;
            }
            if (completion.choices[0].delta.content?.includes("###")) {
                commandCharFound = true;
            }
            if (!commandCharFound) chunkcb(completion.choices[0].delta.content ?? "", "text");
            response += completion.choices[0].delta.content ?? "";
        }

        // If one or more of the contexts was used, print links
        const usedContext = response.includes("###context-");
        if (usedContext) {
            const extractIDs = (text: string): number[] => {
                const regex = /###context-(\d+)/g;
                let match;
                const ids: number[] = [];

                while ((match = regex.exec(text)) !== null) {
                    ids.push(parseInt(match[1]));
                }

                return ids;
            };
            const ids = extractIDs(response);

            if (ids.length > 0 && ids.length != 10) {
                const seenDocs = new Set<string>();
                let links = "";
                for (const id of ids) {
                    const doc = context[id];
                    if (!doc) continue;
                    if (seenDocs.has(doc.docUri)) continue;
                    seenDocs.add(doc.docUri);
                    if (doc.docUri.startsWith("http")) {
                        links += `* [${doc.docTitle}](${doc.docUri})\n`;
                    }
                }
                if (links.trim().length > 0) {
                    chunkcb("\n\n**Links**\n" + links, "text");
                }
            }
        }

        // Check if there was topic drift
        const topicDrift = response.includes("###topicdrift");

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
        session.messages.push({ role: "assistant", content: response });
        session.rawMessages.push({ role: "assistant", content: (response.split("###summary")[1] ?? "\n") + (topicDrift ? "###topicdrift" : "") });
        session.lastModified = new Date().getTime();
        this.database.setChat(session);
    }
}
