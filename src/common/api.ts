import { error } from "../utils/utils.js";
import { ErrorReason } from "./errors.js";

export type Source = FlarumSource | FaqSource | SitemapSource;

export type Logger = (message: string) => Promise<void>;

export interface BaseSource {
    _id?: string;
    collectionId: string;
    name: string;
    description: string;
}

export interface FlarumSource extends BaseSource {
    type: "flarum";
    apiUrl: string;
    staff: string[];
}

export interface FaqSourceEntry {
    id: string;
    questions: string;
    answer: string;
    relatedUrls: string[];
}

export interface FaqSource extends BaseSource {
    type: "faq";
    faqs: FaqSourceEntry[];
}

export interface SitemapSource extends BaseSource {
    type: "sitemap";
    url: string;
    excluded: string[];
    included: string[];
    titlePath: string;
    contentPaths: string[];
}

export interface Collection {
    _id?: string;
    name: string;
    description: string;
    systemPrompt: string;
}

export interface ProcessingJob {
    _id?: string;
    sourceId: string;
    createdAt: number;
    startedAt: number;
    finishedAt: number;
    log: string;
    state: "waiting" | "running" | "succeeded" | "failed" | "stopped";
}

export interface EmbedderDocumentSegment {
    text: string;
    tokenCount: number;
    embedding: number[];
    index?: number;
    doc?: EmbedderDocument;
}

export interface EmbedderDocument {
    uri: string;
    title: string;
    text: string;
    embedding?: number[];
    segments: EmbedderDocumentSegment[];
}

export interface VectorMetadata {
    sourceId: string;
    docUri: string;
    docTitle: string;
    index: number;
    tokenCount: number;
}

export interface VectorDocument extends VectorMetadata {
    text: string;
}

export interface JsonValue {
    [key: string]: any;
}

export interface CompletionDebug {
    query: string;
    ragHistory: string;
    ragQuery: string;
    submittedMessages: { role: string; content: string }[];
    response: string;
    tokensIn: number;
    tokensOut: number;
}

export interface ChatMessage {
    role: "system" | "assistant" | "user";
    content: string;
}

export interface ChatSession {
    _id?: string;
    collectionId: string;
    sourceId?: string;
    createdAt: number;
    lastModified: number;
    messages: ChatMessage[];
    rawMessages: ChatMessage[];
    debug: boolean;
    ip: string;
}

export type ApiResponse<T, E extends ErrorReason = ErrorReason> = ApiResponseSuccess<T> | ApiResponseError<E>;

interface ApiResponseSuccess<T> {
    success: true;
    data: T;
}

export interface ApiResponseError<E extends ErrorReason> {
    success: false;
    error: E | "Invalid parameters" | "Unknown server error";
    validationErrors?: any;
}

function apiBaseUrl() {
    if (typeof location === "undefined") return "http://localhost:3333/api/";
    return location.href.includes("localhost") || location.href.includes("192.168.1") ? `http://${location.hostname}:3333/api/` : "/api/";
}

export async function apiGet<T, E extends ErrorReason = ErrorReason>(
    endpoint: string,
    token?: string
): Promise<ApiResponse<T, E | "Unknown server error">> {
    try {
        const headers = token ? { headers: { Authorization: token } } : undefined;
        const result = await fetch(apiBaseUrl() + endpoint, headers);
        return (await result.json()) as ApiResponse<T, E | "Unknown server error">;
    } catch (e) {
        error(`GET request /api/${endpoint} failed`, e);
        return { success: false, error: "Unknown server error" };
    }
}

export async function apiDelete<T, E extends ErrorReason = ErrorReason>(
    endpoint: string,
    token?: string
): Promise<ApiResponse<T, E | "Unknown server error">> {
    try {
        let headers: HeadersInit = {};
        if (token) headers = { ...headers, Authorization: token };
        const result = await fetch(apiBaseUrl() + endpoint, { method: "DELETE", headers });
        return (await result.json()) as ApiResponse<T, E | "Unknown server error">;
    } catch (e) {
        error(`DELETE request /api/${endpoint} failed`, e);
        return { success: false, error: "Unknown server error" };
    }
}

export async function apiPost<T, E extends ErrorReason = ErrorReason>(
    endpoint: string,
    params: URLSearchParams | FormData | any,
    token?: string
): Promise<ApiResponse<T, E | "Unknown server error">> {
    let headers: HeadersInit = {};
    let body: string | FormData;

    if (params instanceof URLSearchParams) {
        headers = { "Content-Type": "application/x-www-form-urlencoded" };
        body = params.toString();
    } else if (params instanceof FormData) {
        body = params;
    } else {
        body = JSON.stringify(params);
        headers = { ...headers, "Content-Type": "application/json" };
    }

    if (token) headers = { ...headers, Authorization: token };

    try {
        const result = await fetch(apiBaseUrl() + endpoint, {
            method: "POST",
            headers: headers,
            body: body,
        });
        return (await result.json()) as ApiResponse<T, E | "Unknown server error">;
    } catch (e) {
        error(`POST request /api/${endpoint} failed`, e);
        return { success: false, error: "Unknown server error" };
    }
}

export class Api {
    static async createSession(collectionId: string, sourceId?: string) {
        return apiPost<{ sessionId: string }>("createSession", { collectionId, sourceId });
    }

    static async complete(
        sessionId: string,
        message: string,
        chunkCb: (chunk: string, type: "text" | "debug", done: boolean) => void
    ): Promise<ApiResponse<void, "Could not get completion">> {
        try {
            const response = await fetch("/api/complete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: sessionId,
                },
                body: JSON.stringify({ message }),
            });
            if (!response.ok) return { success: false, error: "Could not get completion" };
            if (!response.body) return { success: false, error: "Unknown server error" };
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = new Uint8Array();

            function mergeUint8Arrays(array1: Uint8Array, array2: Uint8Array): Uint8Array {
                const mergedArray = new Uint8Array(array1.length + array2.length);
                mergedArray.set(array1);
                mergedArray.set(array2, array1.length);
                return mergedArray;
            }

            async function readByte(): Promise<number | null> {
                while (buffer.length < 1) {
                    const { done, value } = await reader.read();
                    if (done) return null;
                    buffer = mergeUint8Arrays(buffer, value);
                }
                const byte = new DataView(buffer.buffer).getUint8(0);
                buffer = buffer.slice(1);
                return byte;
            }

            async function readLength(): Promise<number | null> {
                while (buffer.length < 4) {
                    const { done, value } = await reader.read();
                    if (done) return null;
                    buffer = mergeUint8Arrays(buffer, value);
                }
                const length = new DataView(buffer.buffer).getUint32(0, true);
                buffer = buffer.slice(4);
                return length;
            }

            async function readString(length: number): Promise<string | null> {
                while (buffer.length < length) {
                    const { done, value } = await reader.read();
                    if (done) return null;
                    buffer = mergeUint8Arrays(buffer, value);
                }
                const stringBytes = buffer.slice(0, length);
                buffer = buffer.slice(length);
                return decoder.decode(stringBytes);
            }

            while (true) {
                try {
                    const typeByte = await readByte();
                    const type = typeByte == 0 || typeByte == null || typeByte == undefined ? "text" : "debug";
                    const length = await readLength();
                    if (length === null) {
                        chunkCb("", "text", true);
                        break;
                    }

                    const string = await readString(length);
                    if (string === null) {
                        chunkCb("", "text", true);
                        break;
                    }
                    chunkCb(string, type, false);
                } catch (e) {
                    return { success: false, error: "Could not get completion" };
                }
            }

            return { success: true, data: undefined };
        } catch (e) {
            console.log(e);
            return { success: false, error: "Could not get completion" };
        }
    }

    static async getCollections(adminToken: string) {
        return apiGet<Collection[]>("collections", adminToken);
    }

    static async getCollection(adminToken: string, id: string) {
        return apiGet<Collection>("collections/" + encodeURIComponent(id), adminToken);
    }

    static async setCollection(adminToken: string, collection: Collection) {
        return apiPost<Collection, "Duplicate collection name">("collections", collection, adminToken);
    }

    static async deleteCollection(adminToken: string, id: string) {
        return apiDelete<void>("collections/" + encodeURIComponent(id), adminToken);
    }

    static async getSources(adminToken: string, collectionId: string) {
        return apiGet<Source[]>("collections/" + encodeURIComponent(collectionId) + "/sources", adminToken);
    }

    static async getSource(adminToken: string, id: string) {
        return apiGet<Source>("sources/" + encodeURIComponent(id), adminToken);
    }

    static async setSource(adminToken: string, source: Source) {
        return apiPost<Source, "Duplicate source name">("sources", source, adminToken);
    }

    static async deleteSource(adminToken: string, id: string) {
        return apiDelete<void>("sources/" + encodeURIComponent(id), adminToken);
    }

    static async getJob(adminToken: string, sourceId: string) {
        return apiGet<ProcessingJob | undefined>("sources/" + encodeURIComponent(sourceId) + "/job", adminToken);
    }

    static async processSource(adminToken: string, sourceId: string) {
        return apiGet<ProcessingJob>("sources/" + encodeURIComponent(sourceId) + "/process", adminToken);
    }

    static async stopProcessingSource(adminToken: string, sourceId: string) {
        return apiGet<ProcessingJob | undefined>("sources/" + encodeURIComponent(sourceId) + "/stopprocessing", adminToken);
    }

    static async getDocuments(adminToken: string, collectionId: string, sourceId: string, offset: number, limit: number) {
        return apiGet<VectorDocument[]>(
            "documents/" +
                encodeURIComponent(collectionId) +
                "/" +
                encodeURIComponent(sourceId) +
                `?offset=${encodeURIComponent(offset)}&limit=${encodeURIComponent(limit)}`,
            adminToken
        );
    }

    static async getChats(adminToken: string, collectionId: string, offset: number, limit: number) {
        return apiGet<ChatSession[]>(
            "chats/" + encodeURIComponent(collectionId) + `?offset=${encodeURIComponent(offset)}&limit=${encodeURIComponent(limit)}`,
            adminToken
        );
    }

    static async queryDocuments(adminToken: string, collectionId: string, sourceId: string, query: string, k: number = 5) {
        return apiGet<VectorDocument[]>(
            "documents/" +
                encodeURIComponent(collectionId) +
                "/" +
                encodeURIComponent(sourceId) +
                `/query?query=${encodeURIComponent(query)}&k=${encodeURIComponent(k)}`,
            adminToken
        );
    }

    static async html(url: string) {
        try {
            const response = await fetch(apiBaseUrl() + "html?url=" + encodeURIComponent(url));
            if (!response.ok) return undefined;
            return await response.text();
        } catch (e) {
            console.error("Couldn't fetch html", e);
            return undefined;
        }
    }
}
