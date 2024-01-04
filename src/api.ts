import { error } from "./utils/utils.js";

export interface JsonValue {
    [key: string]: any;
}

function apiBaseUrl() {
    if (typeof location === "undefined") return "http://localhost:3333/api/";
    return location.href.includes("localhost") || location.href.includes("192.168.1") ? `http://${location.hostname}:3333/api/` : "/api/";
}

export async function apiGet<T>(endpoint: string) {
    try {
        const result = await fetch(apiBaseUrl() + endpoint);
        if (!result.ok) throw new Error();
        return (await result.json()) as T;
    } catch (e) {
        return error(`Request /api/${endpoint} failed`, e);
    }
}

export async function apiGetBlob(endpoint: string): Promise<Blob | Error> {
    try {
        const result = await fetch(apiBaseUrl() + endpoint);
        if (!result.ok) throw new Error();
        return await result.blob();
    } catch (e) {
        return error(`Request /api/${endpoint} failed`, e);
    }
}

export async function apiGetText(endpoint: string): Promise<string | Error> {
    try {
        const result = await fetch(apiBaseUrl() + endpoint);
        if (!result.ok) throw new Error();
        return await result.text();
    } catch (e) {
        return error(`Request /api/${endpoint} failed`, e);
    }
}

export async function apiPost<T>(endpoint: string, params: URLSearchParams | FormData) {
    let headers: HeadersInit = {};
    let body: string | FormData;

    if (params instanceof URLSearchParams) {
        headers = { "Content-Type": "application/x-www-form-urlencoded" };
        body = params.toString();
    } else {
        body = params;
    }
    try {
        const result = await fetch(apiBaseUrl() + endpoint, {
            method: "POST",
            headers: headers,
            body: body,
        });
        if (!result.ok) throw new Error();
        return (await result.json()) as T;
    } catch (e) {
        return error(`Request /api/${endpoint} failed`, e);
    }
}

export function toUrlBody(params: JsonValue) {
    const urlParams = new URLSearchParams();
    for (const key in params) {
        const value = params[key];
        const type = typeof value;
        if (type == "string" || type == "number" || type == "boolean") {
            urlParams.append(key, value.toString());
        } else if (typeof value == "object") {
            urlParams.append(key, JSON.stringify(value));
        } else {
            throw new Error("Unsupported value type: " + typeof value);
        }
    }
    return urlParams;
}

export class Api {
    static async hello() {
        return apiGet<{ message: string }>("hello");
    }
}
