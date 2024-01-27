import * as fs from "fs";
import * as path from "path";
import htmlToMarkdown from "@wcj/html-to-markdown";
import { getEncoding } from "js-tiktoken";

const tokenizer = getEncoding("cl100k_base");
const discussions = JSON.parse(fs.readFileSync("forum.json", "utf-8"));
let numTokens = 0;
let numChars = 0;
let numPosts = 0;
for (const discussion of discussions) {
    if (!discussion.posts) {
        console.log("Discussion has no posts: " + discussion.discussionId);
        continue;
    }
    for (const post of discussion.posts) {
        const markdown = await htmlToMarkdown({ html: post.content });
        numTokens += tokenizer.encode(markdown).length;
        numPosts++;
        numChars += new TextEncoder().encode(post.content).length;
        if (numPosts % 100 == 0) console.log("Processed " + numPosts + " posts");
    }
}
console.log("Done, " + numTokens + " tokens, " + numChars + " bytes of UTF-8 text");
