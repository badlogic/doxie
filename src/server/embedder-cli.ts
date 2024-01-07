import * as fs from "fs";
import { Embedder } from "./embedder";
import { EmbedderDocument } from "../common/api";

(async () => {
    if (require.main === module) {
        if (!process.env.OPENAI_KEY && !process.env.DOXIE_OPENAI_KEY) {
            console.log("Please set OPENAI_KEY or DOXIE_OPENAI_KEY env to a valid OpenAI key");
            process.exit(-1);
        }

        const openaiKey: string = (process.env.OPENAI_KEY ?? process.env.DOXIE_OPENAI_KEY) as string;
        const embedder = new Embedder(openaiKey);

        if (process.argv.length != 4) {
            console.log("Usage: node embedder <embeddingsinput.josn> <embeddings.bin>");
            process.exit(-1);
        }

        const input = process.argv[2];
        const output = process.argv[3];
        const docs = JSON.parse(fs.readFileSync(input, "utf-8")) as EmbedderDocument[];
        await embedder.embedDocuments(docs, false);
        console.log("Embedding complete, saving to " + output);
        await embedder.writeDocuments(output, docs);
        console.log("Done");
    }
})();
