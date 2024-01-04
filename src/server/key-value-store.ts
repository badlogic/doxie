import fs from "fs/promises";
import fsSync from "fs";

export interface JsonValue {
    [key: string]: any;
}

export class KeyValueStore {
    private collections: Map<string, Map<string, JsonValue>>;
    private logFilePath: string;
    private writeQueue: Promise<any>;

    constructor(logFilePath: string) {
        this.collections = new Map();
        this.logFilePath = logFilePath;
        this.writeQueue = Promise.resolve();
    }

    async initializeStore() {
        if (!fsSync.existsSync(this.logFilePath)) {
            return;
        }
        try {
            const logContent = await fs.readFile(this.logFilePath, "utf-8");
            const lines = logContent.split("\n").filter((line) => line);
            lines.forEach((line) => {
                const { operation, collection, key, value } = JSON.parse(line);
                this.processLogEntry(operation, collection, key, value);
            });
            await this.optimizeLog();
        } catch (error) {
            console.error("Error initializing KeyValueStore:", error);
        }
    }

    private processLogEntry(operation: string, collection: string, key: string, value?: JsonValue) {
        let coll = this.collections.get(collection);
        if (!coll) {
            coll = new Map();
            this.collections.set(collection, coll);
        }

        if (operation === "put" && value) {
            coll.set(key, value);
        } else if (operation === "delete") {
            coll.delete(key);
        }
    }

    private enqueueLogOperation(operation: string, collection: string, key: string, value?: JsonValue) {
        this.writeQueue = this.writeQueue.then(
            async () => await fs.appendFile(this.logFilePath, JSON.stringify({ operation, collection, key, value }) + "\n", "utf-8")
        );
    }

    private async optimizeLog() {
        const optimizedContent = Array.from(this.collections.entries())
            .flatMap(([collection, collMap]) =>
                Array.from(collMap.entries()).map(([key, value]) => JSON.stringify({ operation: "put", collection, key, value }))
            )
            .join("\n");
        await fs.writeFile(this.logFilePath, optimizedContent + "\n", "utf-8");
    }

    put<T extends JsonValue>(collection: string, key: string, value: T) {
        this.processLogEntry("put", collection, key, value);
        this.enqueueLogOperation("put", collection, key, value);
    }

    get<T>(collection: string, key: string): T {
        const c = this.collections.get(collection);
        if (!c) throw new Error("Collection " + collection + " does not exist");
        const v = c.get(key);
        if (!v) throw new Error("Value for key " + key + " in collection " + collection + " does not exist");
        return v as T;
    }

    delete(collection: string, key: string) {
        this.processLogEntry("delete", collection, key);
        this.enqueueLogOperation("delete", collection, key);
    }

    has(collection: string, key: string): boolean {
        return this.collections.get(collection)?.has(key) ?? false;
    }
}
