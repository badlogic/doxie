import * as fs from "fs";
import { Database } from "./database";
import { Rag } from "./rag";
import { BaseSource, EmbedderDocument, FaqSource, FlarumSource, Logger, ProcessingJob, SitemapSource, VectorMetadata } from "../common/api";
import { Collection as MongoCollection, ObjectId, Document } from "mongodb";
import { assertNever, sleep } from "../utils/utils";
import { Embedder } from "./embedder";
import { ChromaClient, Metadata } from "chromadb";

abstract class BaseProcessor<T extends BaseSource> {
    constructor(readonly processor: Processor, readonly source: T, readonly log: Logger) {}

    abstract process(): Promise<EmbedderDocument[]>;
}

class FaqProccessor extends BaseProcessor<FaqSource> {
    async process(): Promise<EmbedderDocument[]> {
        const documents: EmbedderDocument[] = [];
        await this.log("Processing " + this.source.faqs.length + " FAQ entries");
        for (const entry of this.source.faqs) {
            documents.push({
                uri: "faq://" + this.source._id + "/" + entry.id,
                text: entry.questions + "\n\n" + entry.answer,
                title: this.source.name + " " + entry.id,
                segments: [],
            });
        }
        const embedder = new Embedder(this.processor.openaiKey, this.log);
        await embedder.embedDocuments(documents);
        return documents;
    }
}

class FlarumProccessor extends BaseProcessor<FlarumSource> {
    process(): Promise<EmbedderDocument[]> {
        throw new Error("Method not implemented.");
    }
}

class SitemapProccessor extends BaseProcessor<SitemapSource> {
    process(): Promise<EmbedderDocument[]> {
        throw new Error("Method not implemented.");
    }
}

class Processor {
    embedder: Embedder;
    chroma: ChromaClient;

    constructor(private jobs: MongoCollection<Document>, readonly database: Database, readonly openaiKey: string) {
        this.embedder = new Embedder(openaiKey, async (message: string) => console.log(message));
        this.chroma = new ChromaClient({ path: "http://chroma:8000" });
    }

    async getNextJob(): Promise<ProcessingJob | undefined> {
        let job = (await this.jobs.findOneAndUpdate(
            { state: "waiting" },
            { $set: { state: "running", startedAt: Date.now() } },
            { sort: { createdAt: 1 }, returnDocument: "after" }
        )) as ProcessingJob | null;
        if (!job) return undefined;
        job._id = (job as any)._id.toHexString();
        return job;
    }

    async updateJobLog(jobId: string, log: string): Promise<void> {
        await this.jobs.updateOne({ _id: new ObjectId(jobId) }, { $set: { log } });
    }

    async checkJobStatus(jobId: string): Promise<ProcessingJob["state"]> {
        const job = (await this.jobs.findOne({ _id: new ObjectId(jobId) }, { projection: { state: 1 } })) as ProcessingJob | null;
        return job?.state ?? "stopped";
    }

    async finishJob(jobId: string, success: boolean): Promise<void> {
        const newState = success ? "succeeded" : "failed";
        await this.jobs.updateOne({ _id: new ObjectId(jobId) }, { $set: { state: newState, finishedAt: Date.now() } });
    }

    async log(job: ProcessingJob, message: string) {
        job.log += message + "\n";
        console.log(message);
        await this.updateJobLog(job._id!, job.log);
    }

    // Method to process the job
    async process(): Promise<void> {
        while (true) {
            try {
                const job = await this.getNextJob();
                if (job) {
                    try {
                        console.log("Got job " + JSON.stringify(job, null, 2));

                        const source = await this.database.getSource(job.sourceId);
                        console.log("Fetched source");

                        const docs: EmbedderDocument[] = [];
                        const logger: Logger = async (message: string) => await this.log(job, message);
                        switch (source.type) {
                            case "faq": {
                                docs.push(...(await new FaqProccessor(this, source, logger).process()));
                                break;
                            }
                            case "flarum": {
                                docs.push(...(await new FlarumProccessor(this, source, logger).process()));
                                break;
                            }
                            case "sitemap": {
                                docs.push(...(await new SitemapProccessor(this, source, logger).process()));
                                break;
                            }
                            default:
                                assertNever(source);
                        }

                        const collection = await this.chroma.getOrCreateCollection({
                            name: source.collectionId,
                            embeddingFunction: { generate: (texts) => this.embedder.embed(texts) },
                        });
                        await collection.delete({ where: { sourceId: source._id! } });
                        const ids = docs.flatMap((doc) => doc.segments.map((seg, index) => doc.uri + "|" + index));
                        const embeddings = docs.flatMap((doc) => doc.segments.map((seg) => seg.embedding));
                        const metadatas = docs.flatMap((doc) =>
                            doc.segments.map((seg, index) => {
                                const metadata: VectorMetadata = {
                                    sourceId: source._id!,
                                    docUri: doc.uri,
                                    docTitle: doc.title,
                                    index,
                                    tokenCount: seg.tokenCount,
                                };
                                return metadata as unknown as Metadata;
                            })
                        );
                        const vectorDocs = docs.flatMap((doc) =>
                            doc.segments.map((seg) => {
                                return seg.text;
                            })
                        );
                        let numProcessed = 0;
                        const total = ids.length;
                        while (ids.length > 0) {
                            const batchSize = 2000;
                            const batchIds = ids.splice(0, batchSize);
                            const batchEmbeddings = embeddings.splice(0, batchSize);
                            const batchMetadatas = metadatas.splice(0, batchSize);
                            const batchDocuments = vectorDocs.splice(0, batchSize);
                            await collection.upsert({
                                ids: batchIds,
                                embeddings: batchEmbeddings,
                                metadatas: batchMetadatas,
                                documents: batchDocuments,
                            });
                            numProcessed += batchIds.length;
                            logger(`Wrote ${numProcessed}/${total} segments to vector collection ${source.collectionId}`);
                        }

                        await this.finishJob(job._id!, true);
                    } catch (e) {
                        let message = "";
                        if (e instanceof Error) {
                            message = e.stack ?? e.message;
                        } else {
                            message = "Error: " + JSON.stringify(e);
                        }
                        try {
                            await this.log(job, message);
                        } catch (e) {}
                        await this.finishJob(job._id!, false);
                    }
                }
            } catch (e) {
                console.error("Error fetching next job", e);
            } finally {
                await sleep(1000);
            }
        }
    }
}

const port = process.env.PORT ?? 3334;
const openaiKey = process.env.DOXIE_OPENAI_KEY;
if (!openaiKey) {
    console.error("Please specify the DOXIE_OPENAI_KEY env var");
    process.exit(-1);
}
const adminToken = process.env.DOXIE_ADMIN_TOKEN;
if (!adminToken) {
    console.error("Please specify the DOXIE_ADMIN_TOKEN env var");
    process.exit(-1);
}
const dbPassword = process.env.DOXIE_DB_PASSWORD;
if (!dbPassword) {
    console.error("Please specify the DOXIE_DB_PASSWORD env var");
    process.exit(-1);
}

(async () => {
    if (!fs.existsSync("docker/data")) {
        fs.mkdirSync("docker/data");
    }

    await Promise.all([Rag.waitForChroma(), Database.waitForMongo()]);
    await Database.jobs!.updateMany({ state: "running" }, { $set: { state: "stopped", finishedAt: Date.now() } });
    const db = new Database();
    const jobs = Database.jobs!;
    const processor = new Processor(jobs, db, openaiKey);
    processor.process();
})();
