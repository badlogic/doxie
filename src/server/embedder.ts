import * as fs from "fs";
import { getEncoding } from "js-tiktoken";
import OpenAI from "openai";
import { EmbedderDocument, EmbedderDocumentSegment, Logger } from "../common/api";
import { BufferedInputStream, BufferedOutputStream, MemoryBuffer } from "./binarystream";

// A little less than what's allowed, as the tokenizer might not be accurate
const maxTokens = 7000;

const embeddingModel = "text-embedding-3-small";

export interface EmbedderBatch {
    tokenCount: number;
    segments: { doc: EmbedderDocument; segment: EmbedderDocumentSegment }[];
}

export class Embedder {
    readonly openaiApi: OpenAI;
    static readonly tiktoken = getEncoding("cl100k_base");

    constructor(readonly openaiKey: string, readonly log: Logger) {
        this.openaiApi = new OpenAI({
            apiKey: openaiKey,
        });
    }

    static tokenize(text: string) {
        const tokens = this.tiktoken.encode(text);
        return tokens;
    }

    async embed(texts: string[]) {
        const embedding = await this.openaiApi.embeddings.create({ input: texts, model: embeddingModel });
        const result = embedding.data.map((embedding) => embedding.embedding);
        return result;
    }

    async embedDocuments(
        docs: EmbedderDocument[],
        shouldStop: () => Promise<boolean> = async () => false,
        splitter: (doc: EmbedderDocument) => Promise<void>
    ) {
        await this.log(`Splitting ${docs.length} docs into segments`);
        let i = 0;
        let totalTokens = 0;
        for (const doc of docs) {
            await splitter(doc);
            for (const segment of doc.segments) {
                totalTokens += segment.tokenCount;
            }
            i++;
            if (i % 50 == 0) await this.log(`Split ${i}/${docs.length}, cost: $ ${(0.0001 * (totalTokens / 1000)).toFixed(3)}`);
        }

        let processedTokens = 0;
        const segments = docs.flatMap((doc) =>
            doc.segments.map((segment) => {
                return { doc, segment };
            })
        );
        const total = segments.length;
        let processed = 0;
        await this.log(`Split into ${segments.length} segments, ${totalTokens} tokens, cost: $ ${(0.0001 * (totalTokens / 1000)).toFixed(3)}`);

        await this.log("Starting embedding");
        await this.log("Assembling batches");
        const batches: EmbedderBatch[] = [];
        while (true) {
            const batch: EmbedderBatch = { tokenCount: 0, segments: [] };
            batch.tokenCount = 0;
            while (segments.length > 0) {
                const nextSegment = segments[segments.length - 1];
                if (batch.tokenCount + nextSegment.segment.tokenCount > maxTokens) break;
                batch.tokenCount += nextSegment.segment.tokenCount;
                batch.segments.push(nextSegment);
                segments.pop();
            }
            if (batch.segments.length == 0) break;
            batches.push(batch);
        }

        while (batches.length > 0) {
            const subbatch = batches.splice(0, 25);
            const promises = subbatch.map(async (batch) => {
                // Huh, only empty docs
                if (batch.tokenCount == 0) {
                    for (const segment of batch.segments) {
                        segment.segment.embedding = new Array<number>(1536).fill(0);
                    }
                } else {
                    await this.log(`Generating embeddings for ${batch.segments.length} segments`);
                    const embeddings: number[][] = await this.embed(batch.segments.map((segment) => segment.segment.text));
                    for (let i = 0; i < embeddings.length; i++) {
                        batch.segments[i].segment.embedding = embeddings[i];
                    }
                }
                processed += batch.segments.length;
                processedTokens += batch.tokenCount;
                await this.log(`Embedded ${processed}/${total} segments, ${processedTokens}/${totalTokens} tokens`);
                if (await shouldStop()) throw new Error("Job stopped by user");
            });
            await Promise.all(promises);
        }
    }
}
