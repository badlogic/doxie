import { Document, MongoClient, Collection as MongoCollection, ObjectId } from "mongodb";
import { Collection, ProcessingJob, Source, VectorDocument, VectorMetadata } from "../common/api";
import { ChromaClient, IncludeEnum } from "chromadb";
import { Embedder } from "./embedder";

export class Database {
    static client?: MongoClient;
    static collections?: MongoCollection<Document>;
    static sources?: MongoCollection<Document>;
    static documents?: MongoCollection<Document>;
    static jobs?: MongoCollection<Document>;

    static async waitForMongo() {
        const user = "doxie";
        const password = process.env.DOXIE_DB_PASSWORD;
        const start = performance.now();
        let connected = false;
        while (performance.now() - start < 10 * 1000) {
            try {
                this.client = new MongoClient(`mongodb://${user}:${password}@mongodb:27017`);
                await this.client.connect();
                const db = await this.client.db("doxie");
                this.collections = db.collection("collections");
                this.sources = db.collection("sources");
                this.documents = db.collection("documents");
                this.jobs = db.collection("jobs");
                connected = true;
                break;
            } catch (e) {
                // nop
            }
        }
        if (!connected) {
            console.error("Could not connect to MongoDB");
            process.exit(-1);
        }
        console.log("Connected to MongoDB");
    }

    async getCollections(): Promise<Collection[]> {
        const collections = Database.collections;
        if (!collections) throw new Error("Not connected");
        const cursor = await collections.find<Collection>({});
        const result: Collection[] = [];
        for await (const doc of cursor) {
            result.push(doc);
        }
        return result;
    }

    async getCollection(id: string): Promise<Collection> {
        const collections = Database.collections;
        if (!collections) throw new Error("Not connected");
        const result = await collections.findOne<Collection>({ _id: new ObjectId(id) });
        if (!result) throw new Error("Collection with id " + id + " does not exist");
        result._id = (result as any)._id?.toHexString();
        return result;
    }

    async deleteCollection(id: string): Promise<void> {
        const collections = Database.collections;
        if (!collections) throw new Error("Not connected");
        const result = await collections.deleteOne({ _id: new ObjectId(id) });
        if (!result) throw new Error("Collection with id " + id + " does not exist");
    }

    async setCollection(collection: Collection): Promise<Collection> {
        const collections = Database.collections;
        if (!collections) throw new Error("Not connected");

        if (collection._id && ObjectId.isValid(collection._id)) {
            (collection as any)._id = new ObjectId(collection._id);
        }

        if (!collection._id) {
            const result = await collections.insertOne(collection as any);
            collection._id = result.insertedId.toHexString();
        } else {
            await collections.updateOne({ _id: new ObjectId(collection._id) }, { $set: collection });
        }

        return collection;
    }

    async getSources(collectionId: string): Promise<Source[]> {
        const sources = Database.sources;
        if (!sources) throw new Error("Not connected");
        const result = await sources.find<Source>({ collectionId }).toArray();
        return result;
    }

    async getSource(id: string): Promise<Source> {
        const sources = Database.sources;
        if (!sources) throw new Error("Not connected");
        const result = await sources.findOne<Source>({ _id: new ObjectId(id) });
        if (!result) throw new Error("Source with id " + id + " does not exist");
        result._id = (result as any)._id?.toHexString();
        return result;
    }

    async deleteSource(id: string): Promise<void> {
        const sources = Database.sources;
        if (!sources) throw new Error("Not connected");
        const result = await sources.deleteOne({ _id: new ObjectId(id) });
        if (!result.deletedCount) throw new Error("Source with id " + id + " does not exist");
    }

    async setSource(source: Source): Promise<Source> {
        const sources = Database.sources;
        if (!sources) throw new Error("Not connected");

        if (source._id && ObjectId.isValid(source._id)) {
            (source as any)._id = new ObjectId(source._id);
        }

        if (!source._id) {
            const result = await sources.insertOne(source as any);
            source._id = result.insertedId.toHexString();
        } else {
            await sources.updateOne({ _id: new ObjectId(source._id) }, { $set: source });
        }

        return source;
    }

    async getJobBySource(sourceId: string): Promise<ProcessingJob | null> {
        const jobs = Database.jobs;
        if (!jobs) throw new Error("Not connected");
        const result = await jobs.findOne<ProcessingJob>({ sourceId });
        return result;
    }

    async getJob(id: string): Promise<ProcessingJob> {
        const jobs = Database.jobs;
        if (!jobs) throw new Error("Not connected");
        const result = await jobs.findOne<ProcessingJob>({ _id: new ObjectId(id) });
        if (!result) throw new Error("Job with id " + id + " does not exist");
        result._id = (result as any)._id?.toHexString();
        return result;
    }

    async deleteJob(id: string): Promise<void> {
        const sources = Database.jobs;
        if (!sources) throw new Error("Not connected");
        const result = await sources.deleteOne({ _id: new ObjectId(id) });
        if (!result.deletedCount) throw new Error("Job with id " + id + " does not exist");
    }

    async setJob(job: ProcessingJob): Promise<ProcessingJob> {
        const jobs = Database.jobs;
        if (!jobs) throw new Error("Not connected");

        if (job._id && ObjectId.isValid(job._id)) {
            (job as any)._id = new ObjectId(job._id);
        }

        if (!job._id) {
            const result = await jobs.insertOne(job as any);
            job._id = result.insertedId.toHexString();
        } else {
            await jobs.updateOne({ _id: new ObjectId(job._id) }, { $set: job });
        }

        return job;
    }
}

export class VectorStore {
    chroma: ChromaClient;
    embedder: Embedder;
    constructor(openaiKey: string, url = "http://chroma:8000") {
        this.chroma = new ChromaClient({ path: url });
        this.embedder = new Embedder(openaiKey, async (message: string) => console.log(message));
    }

    async getDocuments(collectionId: string, sourceId: string, offset: number, limit: number) {
        const collection = await this.chroma.getCollection({ name: collectionId });
        const response = await collection.get({ where: { sourceId }, offset, limit, include: ["metadatas", "documents"] as IncludeEnum[] });
        const vectorDocs: VectorDocument[] = [];
        for (let i = 0; i < response.ids.length; i++) {
            const vectorDoc: VectorDocument = { ...(response.metadatas[i] as unknown as VectorMetadata), text: response.documents[i]! };
            vectorDocs.push(vectorDoc);
        }
        return vectorDocs;
    }

    async query(collectionId: string, sourceId: string | undefined, query: string, k: number = 10) {
        const start = performance.now();
        const queryVector = (await this.embedder.embed([query]))[0];
        console.log("Embedding query took: " + ((performance.now() - start) / 1000).toFixed(3) + " secs");
        const collection = await this.chroma.getCollection({ name: collectionId });
        const queryConfig: any = {
            queryEmbeddings: [queryVector],
            nResults: k,
            include: ["metadatas", "documents"] as IncludeEnum[],
        };
        if (sourceId) {
            queryConfig.where = { sourceId };
        }
        const response = await collection.query(queryConfig);
        const vectorDocs: VectorDocument[] = [];
        for (let i = 0; i < response.ids[0].length; i++) {
            const vectorDoc: VectorDocument = { ...(response.metadatas[0][i] as unknown as VectorMetadata), text: response.documents[0][i]! };
            vectorDocs.push(vectorDoc);
        }
        console.log("Querying took: " + ((performance.now() - start) / 1000).toFixed(3) + " secs");
        return vectorDocs;
    }
}
