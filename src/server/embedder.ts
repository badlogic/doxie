import { encode } from "gpt-tokenizer";
import OpenAI from "openai";
import * as fs from "fs";
import { BufferedOutputStream, BufferedInputStream, MemoryBuffer } from "./binarystream";
import { EmbedderDocument, EmbedderDocumentSegment, Logger } from "../common/api";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

// A little less than what's allowed, as the tokenizer might not be accurate
const maxTokens = 7000;

export interface EmbedderBatch {
    tokenCount: number;
    segments: { doc: EmbedderDocument; segment: EmbedderDocumentSegment }[];
}

export class Embedder {
    readonly openaiApi: OpenAI;

    constructor(readonly openaiKey: string, readonly log: Logger) {
        this.openaiApi = new OpenAI({
            apiKey: openaiKey,
        });
    }

    tokenize(text: string) {
        const tokens = encode(text);
        return tokens;
    }

    async embed(texts: string[]) {
        const embedding = await this.openaiApi.embeddings.create({ input: texts, model: "text-embedding-ada-002" });
        const result = embedding.data.map((embedding) => embedding.embedding);
        return result;
    }

    async embedDocuments(docs: EmbedderDocument[]) {
        await this.log(`Splitting ${docs.length} docs into segments`);
        let i = 0;
        let totalTokens = 0;
        for (const doc of docs) {
            await this.splitIntoSegments(doc);
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
            });
            await Promise.all(promises);
        }
    }

    private async splitIntoSegments(doc: EmbedderDocument) {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 512,
            chunkOverlap: 0,
        });

        const segments: { text: string; tokenCount: number; embedding: number[] }[] = [];
        const textSplits = await splitter.splitText(doc.text);
        for (const split of textSplits) {
            const tokenCount = this.tokenize(split).length;
            segments.push({ text: split, tokenCount, embedding: [] });
        }
        doc.segments = segments;
    }

    async writeDocuments(file: string, docs: EmbedderDocument[]): Promise<void> {
        const bs = new BufferedOutputStream(file);
        await bs.open();

        await bs.writeInt32(docs.length);
        let i = 0;
        for (const doc of docs) {
            await bs.writeString(doc.uri);
            await bs.writeString(doc.title);
            await bs.writeInt32(doc.segments.length);
            for (const segment of doc.segments) {
                await bs.writeString(segment.text);
                await bs.writeInt32(segment.tokenCount);
                await bs.writeInt32(segment.embedding.length);
                await bs.writeDoubleArray(segment.embedding);
            }
            await this.log(`Wrote ${++i}/${docs.length} document embeddings`);
        }

        await bs.close();
    }

    async readDocuments(file: string): Promise<EmbedderDocument[]> {
        const bs = new BufferedInputStream(file);
        await bs.open();

        const numDocs = await bs.readInt32();
        const docs: EmbedderDocument[] = [];
        for (let i = 0; i < numDocs; i++) {
            const uri = await bs.readString();
            const title = await bs.readString();
            const numSegments = await bs.readInt32();
            const segments: EmbedderDocumentSegment[] = [];
            for (let j = 0; j < numSegments; j++) {
                const text = await bs.readString();
                const tokenCount = await bs.readInt32();
                const numDimensions = await bs.readInt32();
                const embedding: number[] = await bs.readDoubleArray(numDimensions);
                segments.push({ text, tokenCount, embedding, index: j });
            }
            const doc: EmbedderDocument = { uri, text: "", title, segments };
            for (const segment of doc.segments) {
                segment.doc = doc;
            }
            const docVec: number[] = new Array<number>(doc.segments[0].embedding.length);
            docVec.fill(0);
            for (const segment of doc.segments) {
                const segVec = segment.embedding;
                for (let i = 0; i < docVec.length; i++) {
                    docVec[i] += segVec[i];
                }
            }
            for (let i = 0; i < docVec.length; i++) {
                docVec[i] /= doc.segments.length;
            }
            doc.embedding = docVec;
            docs.push(doc);
            if (i % 100 == 0) await this.log(`Read ${docs.length}/${numDocs} document embeddings`);
        }
        await bs.close();
        return docs;
    }

    async readDocumentsInMemory(file: string) {
        const fileBuffer = fs.readFileSync(file);
        const mb = new MemoryBuffer(fileBuffer);

        const numDocs = await mb.readInt32();
        const docs = [];

        for (let i = 0; i < numDocs; i++) {
            const uri = await mb.readString();
            const title = await mb.readString();
            const numSegments = await mb.readInt32();
            const segments = [];

            for (let j = 0; j < numSegments; j++) {
                const text = await mb.readString();
                const tokenCount = await mb.readInt32();
                const numDimensions = await mb.readInt32();
                const embedding = await mb.readDoubleArray(numDimensions);
                segments.push({ text, tokenCount, embedding, index: j });
            }

            const doc: EmbedderDocument = { uri, text: "", title, segments };
            for (const segment of doc.segments) {
                segment.doc = doc;
            }

            const docVec = new Array(doc.segments[0].embedding.length).fill(0);
            for (const segment of doc.segments) {
                const segVec = segment.embedding;
                for (let k = 0; k < docVec.length; k++) {
                    docVec[k] += segVec[k];
                }
            }
            for (let k = 0; k < docVec.length; k++) {
                docVec[k] /= doc.segments.length;
            }
            doc.embedding = docVec;
            docs.push(doc);

            if (i % 100 == 0) await this.log(`Read ${docs.length}/${numDocs} document embeddings`);
        }
        return docs;
    }
}
