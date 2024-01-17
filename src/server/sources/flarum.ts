import * as fs from "fs";
import { EmbedderDocument } from "../../common/api";
import { response } from "express";
import api from "gpt-tokenizer/esm/encoding/cl100k_base";

export interface FlarumPost {
    type: "posts";
    id: string;
    attributes: {
        createdAt: string;
        contentType: string;
        contentHtml: string;
        content: string;
        detectedLang: string; // en, ja, etc.
    };
    relationships: {
        discussion: {
            data: {
                id: string;
            };
        };
    };
}

export interface FlarumDiscussion {
    type: "discussions";
    id: string;
    attributes: {
        createdAt: string;
        title: string;
        slug: string;
        detectedLang: string;
    };
    included?: (FlarumPost | any)[];
}

export interface FlarumResponse<T> {
    links?: {
        first: string;
        next?: string;
    };
    data?: (T | any)[];
}

async function fetchObjects<T>(apiUrl: string, type: "discussions" | "posts" | "users", outputFile: string): Promise<T[]> {
    const objects: T[] = [];
    let next = apiUrl + `${type}?page%5Blimit%5D=50`;
    while (true) {
        const response = await fetch(next);
        if (!response.ok) {
            console.log(`Couldn't fetch ${type} page ${next}`);
            process.exit(-1);
        }
        const data = (await response.json()) as FlarumResponse<FlarumDiscussion>;

        if (data.data) {
            for (const obj of data.data) {
                if (obj.type == type) {
                    const typedObject = obj as T;
                    objects.push(typedObject);
                }
            }
        }
        console.log("Fetched page " + next + ", " + objects.length + " " + type);
        if (!data.links?.next) {
            console.log("Fetched all pages");
            break;
        }
        next = data.links?.next;
    }
    fs.writeFileSync(outputFile + `.${type}.json`, JSON.stringify(objects, null, 2), "utf-8");
    return objects;
}

(async () => {
    if (process.argv.length < 5) {
        console.log("Usage: node flarum <api-url> <output-file> <usernames>+");
        process.exit(-1);
    }
    let apiUrl = process.argv[2];
    const outputFile = process.argv[3];
    if (!apiUrl.endsWith("/")) apiUrl += "/";

    const discussionIds = new Set<string>();

    for (let i = 4; i < process.argv.length; i++) {
        const username = process.argv[i];
        console.log("Fetching discussions by " + username);
    }

    // Fetch all discussions and posts
    // const promises = await Promise.all([fetchObjects(apiUrl, "discussions", outputFile), fetchObjects(apiUrl, "posts", outputFile)]);
})();
