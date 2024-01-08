import { BskyAgent } from "@atproto/api";
import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import * as fs from "fs";

(async () => {
    if (process.argv.length != 4) {
        console.log("Usage: node bskyarchive <bsky-handle> <output>");
        process.exit(-1);
    }
    const handle = process.argv[2];
    const file = process.argv[3];
    console.log("Fetching all posts for " + handle + ", saving to " + file);
    const client = new BskyAgent({ service: "https://api.bsky.app" });
    let cursor: string | undefined;
    const posts: FeedViewPost[] = [];
    let error = false;

    while (true) {
        const result = await client.getAuthorFeed({ actor: handle, cursor, limit: 100, filter: "posts_with_replies" });

        if (!result.success) {
            console.log("Couldn't fetch posts");
            const error = true;
            break;
        }

        if (result.data.feed.length == 0) break;
        posts.push(...result.data.feed);
        cursor = result.data.cursor;
        console.log(`Fetched ${posts.length} posts`);
    }

    if (!error) {
        fs.writeFileSync(file, JSON.stringify(posts, null, 2), "utf-8");
    }
})();
