import { Document, MongoClient, Collection as MongoCollection, ObjectId } from "mongodb";
import { Collection, Source } from "../common/api";

export class Database {
    static collections?: MongoCollection<Document>;
    static sources?: MongoCollection<Document>;
    static documents?: MongoCollection<Document>;

    static async waitForMongo() {
        const user = "doxie";
        const password = process.env.DOXIE_DB_PASSWORD;
        const start = performance.now();
        let connected = false;
        while (performance.now() - start < 10 * 1000) {
            try {
                const client = new MongoClient(`mongodb://${user}:${password}@mongodb:27017`);
                await client.connect();
                const db = await client.db("doxie");
                this.collections = db.collection("collections");
                this.sources = db.collection("sources");
                this.documents = db.collection("documents");
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
}
