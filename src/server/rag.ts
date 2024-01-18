import { ChromaClient, Collection } from "chromadb";
import { EmbedderDocument, EmbedderDocumentSegment } from "../common/api";
import { Embedder } from "./embedder";
import OpenAI from "openai";

export class RagCollection {
    constructor(
        readonly openai: OpenAI,
        readonly collection: Collection,
        readonly docsByUri: Map<string, EmbedderDocument>,
        readonly useDocEmbedding: boolean
    ) {}

    async query(query: string, k = 5) {
        const results = await this.collection.query({ queryTexts: query, nResults: k });
        if ((results as any)["error"] != undefined) throw new Error("Could not query rag collection");
        const segments: EmbedderDocumentSegment[] = [];
        for (const id of results.ids[0]) {
            if (this.useDocEmbedding) {
                const doc = this.docsByUri.get(id);
                if (!doc) continue;
                segments.push(...doc.segments);
                break;
            } else {
                const docUri = id.split("|")[0];
                const segmentIndex = parseInt(id.split("|")[1]);
                const doc = this.docsByUri.get(docUri);
                if (!doc) continue;
                const segment = doc.segments[segmentIndex];
                if (!segment) continue;
                segments.push(segment);
            }
        }

        return segments;
    }
}

export class Rag {
    chroma: ChromaClient;
    collections = new Map<string, RagCollection>();

    static async waitForChroma() {
        const chroma = new ChromaClient({ path: "http://chroma:8000" });
        const start = performance.now();
        let connectedToChroma = false;
        while (performance.now() - start < 10 * 1000) {
            try {
                const version = await chroma.version();
                connectedToChroma = true;
                break;
            } catch (e) {
                // nop
            }
        }
        if (!connectedToChroma) {
            console.error("Could not connect to Chroma");
            process.exit(-1);
        }
        console.log("Connected to Chroma");
    }

    constructor(readonly embedder: Embedder, chromaUrl: string = "http://chroma:8000") {
        this.chroma = new ChromaClient({ path: chromaUrl });
    }
}
