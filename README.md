# Doxie

Doxie is a self-hosted retrieval-augmented chat system for turning your documentation, forums, and FAQs into conversational assistants. It bundles a configurable admin UI, ingestion pipeline, and chat front-end so you can publish purpose-built bots against curated knowledge bases.

## Highlights

-   **Admin-first bot management** – Create, import/export, and tune bots from the web UI, including prompts, token limits, branding, and welcome/footer copy ([src/pages/admin.ts](src/pages/admin.ts), [src/pages/bot.ts](src/pages/bot.ts)).
-   **Pluggable data ingestion** – Capture FAQs, sitemaps, Markdown archives, and Flarum forum dumps, then process them into embeddings with a background worker ([src/server/processor.ts](src/server/processor.ts)).
-   **Streaming chat with RAG** – Each reply expands the user query, runs vector search, optionally reranks with Cohere, and streams the final answer plus debug artefacts to the client ([src/server/chatsessions.ts](src/server/chatsessions.ts)).
-   **Document inspection & ad-hoc Q&A** – Browse embedded segments, issue direct similarity queries, or ask one-off questions with full debug visibility ([src/pages/documents.ts](src/pages/documents.ts), [src/pages/answer.ts](src/pages/answer.ts)).
-   **Batteries-included dev loop** – esbuild bundles the site, server, and worker; Tailwind powers styling; live reload keeps the SPA in sync during development ([esbuild.server.mjs](esbuild.server.mjs), [src/server/server.ts](src/server/server.ts)).

## Architecture

| Component | Location | Notes |
| --- | --- | --- |
| Web client | `src/app.ts`, `src/pages/` | Single-page app built with Lit + Tailwind, served from `html/`. |
| API server | `src/server/server.ts` | Express app handling chat, admin APIs, uploads, and streaming responses. |
| Processor worker | `src/server/processor.ts` | Picks up Mongo-backed jobs, fetches sources, chunks text, and writes embeddings. |
| Vector store | `jnn/` | Custom Java nearest-neighbour service exposed via HTTP (`/create`, `/add`, `/query`, …). |
| Database | `src/server/database.ts` | MongoDB stores bots, sources, documents, jobs, and chat sessions. |
| Docker stack | `docker/` | Nginx serves static files, Node services run server/processor, JNN and Mongo run sidecar. |

## Knowledge sources & ingestion

Sources are versioned records inside MongoDB (`sources` collection). The processor consumes `ProcessingJob`s, fetches data, chunks it with the OpenAI tokenizer, embeds via `text-embedding-3-small`, and rewrites the destination JNN collection each run. Processing progress and logs are streamed back to the admin UI through `source-panel` ([src/pages/source.ts](src/pages/source.ts)).

### Supported source types

-   **FAQ** – Curate question/answer pairs directly in the UI. Each entry is validated to stay under ~500 tokens for single-pass embedding.
-   **Sitemap** – Provide a `sitemap.xml`, inclusion/exclusion glob patterns, and XPath expressions for title and content extraction. HTML is normalized to strip scripts and tables before embedding.
-   **Markdown ZIP** – Upload a `.zip` containing Markdown files. Each file expects the source URL on the first line, a blank line, then the title in Markdown syntax. Headings drive hierarchical chunking.
-   **Flarum dump** – Point to a JSON export of forum discussions. Only English posts (or filtered staff handles) are embedded; oversized posts are split recursively.

After saving a source, use the “Process” action to enqueue a job. Job states transition through `waiting → running → succeeded|failed|stopped`, and logs remain available alongside quick links to inspect documents or open a chat against a chosen bot. Re-processing a source replaces the entire vector collection to keep embeddings in sync.

## Bots & chat experience

Bots aggregate one or more sources and capture the end-user persona: system prompt, chat/answer models, token ceilings, optional Cohere reranking flag, welcome message, footer markup, and custom CSS ([src/common/api.ts](src/common/api.ts)). Public visitors land on `/` to pick any bot and start chatting; admins can jump straight into `/chat/:id`, `/answer/:id`, replay saved sessions, and toggle debug markers with the `---debug` command.

Every user turn expands to five alternate queries, embeds the selection, queries up to 25 segments per source, reranks (if enabled), and streams the answer over chunked HTTP with an accompanying summary and debug payload. Completed conversations are persisted in the `chats` collection for later review.

## Typical admin workflow

1. Provision the required environment variables (see below) and start the stack (Docker or local Node).
2. Visit `/admin`, paste the configured admin token, and sign in. The token is cached in local storage via `Store` utilities.
3. Create or import a source, configure its parameters, and trigger processing. Watch logs for progress/errors.
4. Inspect the resulting documents or run similarity queries to spot-check the embedding quality.
5. Create or edit a bot, select the sources it should use, tweak prompts and presentation, then save.
6. Share `/chat/<botId>` publicly, or keep `/answer/<botId>` and `/admin` gated behind the admin token.

## Environment & configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `DOXIE_OPENAI_KEY` | ✔ | Used by the server and processor for embeddings, query expansion, and completions. |
| `DOXIE_ADMIN_TOKEN` | ✔ | Shared secret for admin-only API requests and UI access. |
| `DOXIE_DB_PASSWORD` | ✔ | Password for the MongoDB `doxie` user; reused by server and processor containers. |
| `DOXIE_COHERE_KEY` | optional | Enables Cohere reranking of retrieved passages when `useCohere` is enabled on a bot. |
| `PORT` | optional | Overrides the Node HTTP port (defaults: server `3333`, processor `3334`, JNN `3335`). |

Populate these variables in a `.env` consumed by Docker Compose (`docker/docker-compose.*.yml`) or export them in your shell before running the Node services. Uploaded assets live in `html/files/`, while processor artefacts and logs are written to `docker/data/`.

`configure.mjs` can rewrite configuration placeholders (domain, host, etc.) across deployment scripts based on the `app` block in `package.json`. Run it once after cloning when targeting a new environment.

## Tooling & scripts

-   `npm run build:*` bundles the site (`build/site.js`), server (`build/server.js`), processor (`build/processor.js`), and Tailwind CSS.
-   `docker/control.sh` orchestrates the dev/prod Compose stacks (`start`, `startdev`, `stop`, `logs`, etc.).
-   `publish.sh` wraps deployment to the configured host, and `stats.sh` fetches access logs for local analysis.
-   `cli/` contains ad-hoc helpers (e.g. converting HTML exports to Markdown) used while preparing sources.
-   `jnn/server.sh` rebuilds and reloads the Java vector store on source file changes when developing locally.

## API surface

-   Public endpoints: list bots (`GET /api/bots` with `Authorization: noauth`), fetch bot summaries, start chat sessions, stream completions, and issue question answering requests.
-   Admin endpoints (require `Authorization: <DOXIE_ADMIN_TOKEN>`): CRUD bots and sources, manage processing jobs, inspect documents, list chats, upload assets, and delete sessions.
-   Utility endpoints: `/api/search` for raw vector lookups across sources, `/api/html` for remote HTML fetches during source testing, plus `/api/upload` for storing binary assets.

## License

Doxie is distributed under the [MIT License](LICENSE).

### Development

```
npm run dev
```

In VS Code run the `dev` launch configurations, which will attach the debugger to the server, spawn a browser window, and also attach to that for frontend debugging.

### Deployment

1. Deploy backend & frontend: `./publish.sh server`
1. Deploy just the frontend: `./publish.sh`
