import { error } from "../utils/utils.js";
import { ErrorReason } from "./errors.js";

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

export interface JsonValue {
    [key: string]: any;
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
    static async tokenize(text: string) {
        return apiPost<number[]>("tokenize", { text });
    }

    static async embed(texts: string[]) {
        return apiPost<number[][]>("embed", { texts });
    }

    static async vectorQuery(query: string) {
        return apiPost<any>("vectorquery", { query });
    }

    static async createSession() {
        return apiPost<{ sessionId: string }>("createSession", {});
    }

    static async complete(
        sessionId: string,
        message: string,
        chunkCb: (chunk: string, done: boolean) => void
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
                    console.log(value.length);
                    buffer = mergeUint8Arrays(buffer, value);
                }
                const stringBytes = buffer.slice(0, length);
                buffer = buffer.slice(length);
                return decoder.decode(stringBytes);
            }

            while (true) {
                try {
                    const length = await readLength();
                    if (length === null) {
                        chunkCb("", true);
                        break;
                    }

                    const string = await readString(length);
                    if (string === null) {
                        chunkCb("", true);
                        break;
                    }
                    console.log(string);
                    chunkCb(string, false);
                } catch (e) {
                    return { success: false, error: "Could not get completion" };
                }
            }

            return { success: true, data: undefined };
        } catch (e) {
            return { success: false, error: "Could not get completion" };
        }
    }
}
