import * as fs from "fs";
import * as path from "path";
import { EmbedderDocument } from "../../common/api";

function readMarkdownFiles(directory: string, cb: (file: string, content: string) => void) {
    const files = fs.readdirSync(directory);
    files.forEach((file) => {
        const filePath = path.join(directory, file);
        const stat = fs.statSync(filePath);

        if (stat.isFile() && path.extname(file) === ".md") {
            const data = fs.readFileSync(filePath, "utf8");
            cb(file, data);
        }

        if (stat.isDirectory()) {
            readMarkdownFiles(filePath, cb);
        }
    });
}

(async () => {
    if (process.argv.length != 4) {
        console.log("Usage: node spine <input-dir> <output-file>");
        process.exit(-1);
    }
    const inputDir = process.argv[2];
    const outputFile = process.argv[3];
    const docs: EmbedderDocument[] = [];
    readMarkdownFiles(inputDir, (file, content) => {
        const lines = content.replaceAll("\r", "").split("\n");
        const uri = lines.shift()!;
        if (uri.endsWith("-ko") || uri.endsWith("-ja") || uri.endsWith("-zh") || uri.endsWith("-it") || uri.endsWith("-hr")) return;
        lines.shift();
        const title = lines.shift()!.replace("[", "").replace("]", "");
        content = lines.join("\n");
        docs.push({ uri, text: content, title, segments: [] });
    });
    console.log("Read " + docs.length + " documents");
    fs.writeFileSync(outputFile, JSON.stringify(docs, null, 2), "utf-8");
    console.log("Wrote " + outputFile);
    let raw = "";
    for (const doc of docs) {
        raw += ">>>>\n" + doc.title + "\n" + doc.uri + "\n" + doc.text + "\n\n";
    }
    fs.writeFileSync(outputFile + ".raw", raw, "utf-8");
})();
