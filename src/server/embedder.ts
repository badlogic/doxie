import { encode } from "gpt-tokenizer";
import OpenAI from "openai";
import * as fs from "fs";
import { BufferedOutputStream, BufferedInputStream, MemoryBuffer } from "./binarystream";
import { EmbedderDocument, EmbedderDocumentSegment } from "../common/api";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

// A little less than what's allowed, as the tokenizer might not be accurate
const maxTokens = 7000;
const maxSegmentTokens = 256;

function cosineSimilarity(a: Float32Array, b: Float32Array) {
    let score = 0;
    const len = a.length;
    for (let ii = 0; ii < len; ii++) {
        score += a[ii] * b[ii];
    }
    return score;
}

export interface EmbedderBatch {
    tokenCount: number;
    segments: { doc: EmbedderDocument; segment: EmbedderDocumentSegment }[];
}

export class Embedder {
    readonly openaiApi: OpenAI;

    constructor(readonly openaiKey: string) {
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

    async embedDocuments(docs: EmbedderDocument[], useParagraphs: boolean = false) {
        console.log("Splitting docs into segments");
        let i = 0;
        let totalTokens = 0;
        for (const doc of docs) {
            await this.splitIntoSegments(doc, useParagraphs);
            for (const segment of doc.segments) {
                totalTokens += segment.tokenCount;
            }
            i++;
            if (i % 50 == 0) console.log(`Split ${i}/${docs.length}, cost: $ ${(0.0001 * (totalTokens / 1000)).toFixed(2)}`);
        }

        let processedTokens = 0;
        const segments = docs.flatMap((doc) =>
            doc.segments.map((segment) => {
                return { doc, segment };
            })
        );
        const total = segments.length;
        let processed = 0;
        console.log(`Split into ${segments.length} segments, ${totalTokens} tokens, cost: $ ${(0.0001 * (totalTokens / 1000)).toFixed(2)}`);

        console.log("Starting embedding");
        console.log("Assembling batches");
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
                    console.log(`Generating embeddings for ${batch.segments.length} segments`);
                    const embeddings: number[][] = await this.embed(batch.segments.map((segment) => segment.segment.text));
                    for (let i = 0; i < embeddings.length; i++) {
                        batch.segments[i].segment.embedding = embeddings[i];
                    }
                }
                processed += batch.segments.length;
                processedTokens += batch.tokenCount;
                console.log(`Processed ${processed}/${total} segments, ${processedTokens}/${totalTokens} tokens`);
            });
            await Promise.all(promises);
        }
    }

    private async splitIntoSegments(doc: EmbedderDocument, useParagraphs: boolean) {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 512,
            chunkOverlap: 100,
        });

        const segments: { text: string; tokenCount: number; embedding: number[] }[] = [];
        const textSplits = await splitter.splitText(doc.text);
        for (const split of textSplits) {
            const tokenCount = this.tokenize(split).length;
            segments.push({ text: split, tokenCount, embedding: [] });
        }
        doc.segments = segments;

        /*const paragraphs = useParagraphs ? doc.text.split(/\n{2,}/) : [doc.text];
        let segments: { text: string; tokenCount: number; embedding: number[] }[] = [];

        for (const paragraph of paragraphs) {
            let currentSegment = "";
            let currentTokenCount = 0;
            const words = paragraph.split(" ");

            for (const word of words) {
                const wordTokenCount = this.tokenize(word).length;

                if (currentTokenCount + wordTokenCount <= maxSegmentTokens) {
                    currentSegment += (currentSegment.length > 0 ? " " : "") + word;
                    currentTokenCount += wordTokenCount;
                } else {
                    if (currentSegment.length > 0) {
                        segments.push({ text: currentSegment, tokenCount: currentTokenCount, embedding: [] });
                    }
                    currentSegment = word;
                    currentTokenCount = wordTokenCount;
                }
            }

            if (currentSegment.length > 0) {
                segments.push({ text: currentSegment, tokenCount: currentTokenCount, embedding: [] });
            }
        }
        doc.segments = segments;*/
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
            console.log(`Wrote ${++i}/${docs.length} document embeddings`);
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
            if (i % 100 == 0) console.log(`Read ${docs.length}/${numDocs} document embeddings`);
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

            if (i % 100 == 0) console.log(`Read ${docs.length}/${numDocs} document embeddings`);
        }
        return docs;
    }

    async query(docs: EmbedderDocument[], query: string | Float32Array) {
        const queryVec = query instanceof Float32Array ? query : new Float32Array((await this.embed([query]))[0]);
        const start = performance.now();

        const docSims = new Array<{ score: number; doc: EmbedderDocument }>(docs.length);
        for (let i = 0; i < docs.length; i++) {
            const doc = docs[i];
            const docVec = doc.embedding! instanceof Float32Array ? doc.embedding : new Float32Array(doc.embedding!);
            docSims[i] = { score: cosineSimilarity(queryVec, docVec), doc };
        }
        docSims.sort((a, b) => b.score - a.score);

        /*
        const segments = docs.flatMap((doc) => doc.segments);
        const segmentSimilarities = new Array<{ score: number; segment: EmbedderDocumentSegment }>(segments.length);
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const segmentEmbedding = segment.embedding;
            let score = cosineSimilarity(segmentEmbedding as Float32Array, queryVec);
            segmentSimilarities[i] = { score, segment };
        }
        segmentSimilarities.sort((a, b) => b.score - a.score);
        console.log("Queried " + segments.length + " segments in " + ((performance.now() - start) / 1000).toFixed(3) + " secs");
        const resultSegments = new Map<string, EmbedderDocumentSegment[]>();
        for (let i = 0; i < 10; i++) {
            const sim = segmentSimilarities[i];
            const docSims = resultSegments.get(sim.segment.doc!.uri) ?? [];
            resultSegments.set(sim.segment.doc!.uri, docSims);
            docSims.push(sim.segment);
        }

        const resultDocs: EmbedderDocument[] = [];
        for (const docUri of resultSegments.keys()) {
            const docSim = resultSegments.get(docUri)!;
            const docCopy = { ...docSim[0].doc! };
            for (let i = 0; i < docCopy.segments.length; i++) {
                const segment = docCopy.segments[i];
                docCopy.segments[i] = { text: segment.text, tokenCount: segment.tokenCount, embedding: [] };
            }
            resultDocs.push(docCopy);
        }*/
        return docSims.slice(0, 10).map((docSim) => {
            const docCopy = { ...docSim.doc };
            delete (docCopy as any).embedding;
            for (let i = 0; i < docCopy.segments.length; i++) {
                const segment = docCopy.segments[i];
                docCopy.segments[i] = { text: segment.text, tokenCount: segment.tokenCount, embedding: [] };
            }
            return { score: docSim.score, doc: docCopy };
        });
    }
}
