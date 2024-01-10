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

    async expandQuery(query: string, context: string) {
        const systemMessage = `you are a query expansion system. you are used to expand queries with sentences or phrases to increase the precision and recall in an information retrieval system that uses the OpenAI Ada model for text embeddings.

Your input is the raw natural language query followed by the (optional) conversation history between the user and an information retrieval assistant:
"
was mache ich als programmierer?

###history
user: wie werde ich programmierer?
assistant: Um Programmierer zu werden, sollten Sie eine Ausbildung im Bereich Informatik, Technische Informatik oder Wirtschaftsinformatik absolvieren. Universitäten und Fachhochschulen bieten Studiengänge mit Schwerpunkten in verschiedenen Anwendungsgebieten wie medizinische Assistenz-Systeme, E-Health, Automotive, Prozessleittechnik oder Mechatronik an.
user: was kann ich verdienen?
assistant: Das Einkommen für ProgrammiererInnen kann je nach Qualifikation, Erfahrung und dem konkreten Aufgabenbereich variieren. Ein formaler Abschluss im IT-Bereich sowie Spezialisierungen in Datensicherheit und anderen relevanten Bereichen können sich positiv auf das Gehalt auswirken. Zudem ist lebenslanges Lernen aufgrund des ständigen technologischen Fortschritts unerlässlich.
"

The user may change topic with respect to the history, in which case you ignore the history and generate an expansion just for the user query itself.

You output sentences and phrases based on the query and taking into account the history, which will be combined with the user query and used to retrieve relevant documents. Example output:

"
Tätigkeiten als Programmierer
Aufgaben eines Programmierers
Berufsbild Programmierer
"`;

        const response = await this.openai.chat.completions.create({
            model: "gpt-3.5-turbo-1106",
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: query + (context.trim().length == 0 ? "" : "\n\n###history" + context.trim()) },
            ],
        });
        return response.choices[0].message.content;
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
