import * as fs from "fs";
import * as path from "path";
import htmlToMarkdown from "@wcj/html-to-markdown";

const baseDir = "/Users/badlogic/Downloads/html/";
const baseUrl = "https://www.winccoa.com/documentation/WinCCOA/latest/en_US/";

async function readFiles(dir, callback) {
    fs.readdirSync(dir).forEach(async (file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            readFiles(filePath, callback);
        } else {
            await callback(filePath);
        }
    });
}

const outDir = "./saved/";
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir);
readFiles(baseDir, async (file) => {
    if (file.endsWith(".html")) {
        console.log("Processing " + file);
        const pathElements = file.split("/");
        pathElements.pop();
        const path = pathElements.join("/").replace(baseDir, outDir);
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path, { recursive: true });
        }
        const content = fs.readFileSync(file, "utf-8");
        let markdown = await htmlToMarkdown({ html: content });
        markdown = file.replace(baseDir, baseUrl) + "\n" + markdown;
        const filename = file.split("/").pop().replace(".html", ".md");
        const out = path + "/" + filename;
        fs.writeFileSync(out, markdown, "utf-8");
    }
});
