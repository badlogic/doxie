# Doxie

Doxie is an experiment in LLM-based information retrieval. Or in plain words: Doxie uses ChatGPT to answer questions based on the content of one or more websites, documents, or whatever other text content you want to feed it. It exposes a simple, ChatGPT like interface.

Doxie implements the most basic RAG loop imaginable, with simple context management. Have a look at these source files:

-   Srapping and preparing data from a specific source [src/server/berufslexikon.ts](src/server/berufslexikon.ts)
-   Embedding data
    -   [src/server/embedder.ts](src/server/embedder.ts) chunking, embedding
    -   [src/server/embedder-cli.ts](src/server/embedder.ts) takes the output of the scrapper and converts it into a `xxx.embeddings.bin` file to be loaded into the vector database
-   Vector database, loads a file generated by `embedder-cli.ts` into a collection and lets you query it [src/server/rag.ts](src/server/rag.ts)
-   Chat session management, keeps track of chat sessions, expands queries for RAG, and submits user queries + RAG context to GPT 3.5-turbo to get hopefully meaningful answers with source citations. [src/server/chatsessions.ts]

To run Doxie you need the following software installed on your system:

-   [NodeJs +20](https://nodejs.org/en)
-   [Docker](https://www.docker.com/)

Doxie currently does not have a proper ingestion pipeline, and is hard coded for the test use case. This will probably, maybe amended in the coming days/weeks, depending on my mood.

If you want to play around with Doxie on some real-world data, run the `./download-testdata.sh` script in the root folder. It will download a data set with embeddings generated from [AMS Berufslexikon](https://www.berufslexikon.at/) to `./docker/data/berufslexikon.embeddings.bin`. You can then follow the instructions in the `Development` section below.

### Development

```
npm run dev
```

In VS Code run the `dev` launch configurations, which will attach the debugger to the server, spawn a browser window, and also attach to that for frontend debugging.

### Deployment

1. Deploy backend & frontend: `./publish.sh server`
1. Deploy just the frontend: `./publish.sh`
