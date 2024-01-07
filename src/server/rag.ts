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
        console.log("Connecting to Chroma");
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

    async loadCollection(name: string, file?: string, useDocEmbeddings = false) {
        if (this.collections.has(name)) return this.collections.get(name)!;
        const docs = file ? await this.embedder.readDocumentsInMemory(file) : [];
        const docsByUri = new Map<string, EmbedderDocument>();
        let numEmbeddings = 0;
        docs.forEach((doc) => {
            docsByUri.set(doc.uri, doc);
            if (useDocEmbeddings) {
                numEmbeddings++;
            } else {
                for (const seg of doc.segments) {
                    numEmbeddings++;
                }
            }
        });
        let collection = await this.chroma.getOrCreateCollection({ name, embeddingFunction: { generate: (texts) => this.embedder.embed(texts) } });
        const count = await collection.count();
        if (file && count != numEmbeddings) {
            await this.chroma.deleteCollection({ name });
            collection = await this.chroma.getOrCreateCollection({ name, embeddingFunction: { generate: (texts) => this.embedder.embed(texts) } });
            const ids = useDocEmbeddings
                ? docs.map((doc) => doc.uri)
                : docs.flatMap((doc) => doc.segments.map((seg, index) => doc.uri + "|" + index));
            const embeddings = useDocEmbeddings ? docs.map((doc) => doc.embedding!) : docs.flatMap((doc) => doc.segments.map((seg) => seg.embedding));
            let numProcessed = 0;
            const total = ids.length;
            while (ids.length > 0) {
                const batchSize = 2000;
                const batchIds = ids.splice(0, batchSize);
                const batchEmbeddings = embeddings.splice(0, batchSize);
                await collection.upsert({ ids: batchIds, embeddings: batchEmbeddings });
                numProcessed += batchIds.length;
                console.log(`Wrote ${numProcessed}/${total} segments to collection ${name}`);
            }
        }
        console.log(`Collection ${name} contains ${await collection.count()} items`);
        const ragCollection = new RagCollection(this.embedder.openaiApi, collection, docsByUri, useDocEmbeddings);
        this.collections.set(name, ragCollection);
        return ragCollection;
    }
}
