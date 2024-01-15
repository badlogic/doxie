import OpenAI from "openai";
import { ChatCompletionChunk, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { v4 as uuid } from "uuid";
import { RagCollection } from "./rag";
import { getEncoding, encodingForModel } from "js-tiktoken";
import { ChatMessage, ChatSession, CompletionDebug, VectorDocument } from "../common/api";
import { encode } from "gpt-tokenizer";
import { Database, VectorStore } from "./database";
import { CohereClient } from "cohere-ai";
import { RerankRequestDocumentsItem } from "cohere-ai/api";

const tiktokenEncoding = getEncoding("cl100k_base");
const logFile = "docker/data/log.txt";

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
A user question starts with the actual question. Next you find one or more sections delimited with ###context-<id-of-section>. Each section
has additional context that may or may not be relevant to the user question. A user question is formated like this:

"
<user question>
###context-0
<context title>
<context text>
###context-1
<context title>
<context text>
...
"

To create your answer, follow these steps:
- Read the query, which is delimited by ###question
- Read the context sections
- Read the previous questions and take them into account if relevant
- IMPORTANT: Answer in the language of the query. Use any relevant from the context sections.
- For each context section you have used, output ###context-<id-of-section>
- IMPORTANT! After you print your answer, print ###summary, followed by a single sentence summarizing your answer.
- If the user changes topic, print ###topicdrift.
- The initial topic is unknown, so do not print ###topicdrift in your first response

Your replies should be formated like this:
"
<your answer>
###context-1
###context-4
###summary
<your single sentence summary>
###topicdrift
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
        const systemMessage = `you are a query expansion system. you are used to expand queries with sentences or phrases to increase the precision and recall in an information retrieval system that uses the OpenAI Ada model for text embeddings.

Your input is the raw natural language query followed by the (optional) conversation history between the user and an information retrieval assistant:
"
was mache ich als programmierer?

###history
user: wie werde ich programmierer?
assistant: Um Programmierer zu werden, sollten Sie eine Ausbildung im Bereich Informatik, Technische Informatik oder Wirtschaftsinformatik absolvieren. Universitäten und Fachhochschulen bieten Studiengänge mit Schwerpunkten in verschiedenen Anwendungsgebieten wie medizinische Assistenz-Systeme, E-Health, Automotive, Prozessleittechnik oder Mechatronik an.
user: was kann ich verdienen?
assistant: Das Einkommen für ProgrammiererInnen kann je nach Qualifikation, Erfahrung und dem konkreten Aufgabenbereich variieren. Ein formaler Abschluss im IT-Bereich sowie Spezialisierungen in Datensicherheit und anderen relevanten Bereichen können sich positiv auf das Gehalt auswirken. Zudem ist lebenslanges Lernen aufgrund des ständigen technologischen Fortschritts unerlässlich.
"

The user may change topic with respect to the history, in which case you ignore the history and generate an expansion just for the user query itself.

You output sentences and phrases based on the query and taking into account the history, which will be combined with the user query and used to retrieve relevant documents. Example output:

"
Tätigkeiten als Programmierer
Aufgaben eines Programmierers
Berufsbild Programmierer
"`;

        const response = await this.openai.chat.completions.create({
            model: "gpt-3.5-turbo-1106",
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: query + (context.trim().length == 0 ? "" : "\n\n###history" + context.trim()) },
            ],
        });
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
        let ragHistory = historyMessages
            .filter((msg) => msg.role != "system")
            .map((msg) => msg.role + ": " + msg.content?.toString().replaceAll("###topicdrift", ""))
            .join("\n\n");
        let ragQuery = message + " " + ((await this.expandQuery(message, ragHistory)) ?? "");

        // Query vector db with expanded query
        const context = await this.vectors.query(session.collectionId, session.sourceId, ragQuery, 25);

        // Rerank results via cohere if enabled
        if (this.cohere) {
            const reranked: RerankRequestDocumentsItem[] = context.map((doc) => {
                return { text: doc.text };
            });
            const response = await this.cohere.rerank({
                model: `rerank-multilingual-v2.0`,
                topN: 10,
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
        const messageContent = `###question\n${message}\n\n${contextContent}`;
        session.messages.push({
            role: "user",
            content: messageContent,
        });
        session.rawMessages.push({ role: "user", content: message });

        // Submit completion request to OpenAI, consisting of (summarized) history, new user message + RAG context
        let response = "";
        const submittedMessages = [session.rawMessages[0], ...historyMessages];
        submittedMessages.push(session.messages[session.messages.length - 1]);
        const stream = await this.openai.chat.completions.create({ model: "gpt-3.5-turbo-1106", messages: submittedMessages, stream: true });

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
        session.rawMessages.push({ role: "assistant", content: (response.split("###summary")[1] ?? response) + (topicDrift ? "###topicdrift" : "") });
        session.lastModified = new Date().getTime();
        this.database.setChat(session);
    }
}
