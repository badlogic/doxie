import * as chokidar from "chokidar";
import compression from "compression";
import cors from "cors";
import express, { Request, Response } from "express";
import { body, header, param, validationResult } from "express-validator";
import * as fs from "fs";
import path from "path";
import * as http from "http";
import multer from "multer";
import WebSocket, { WebSocketServer } from "ws";
import { Bot, ProcessingJob, Source, VectorDocument } from "../common/api";
import { ErrorReason } from "../common/errors";
import { ChatSessions } from "./chatsessions";
import { Database, VectorStore } from "./database";
import { Embedder } from "./embedder";
import { Rag } from "./rag";
import { Jobs } from "./jobs";
import { v4 as uuid } from "uuid";

const port = process.env.PORT ?? 3333;
const openaiKey = process.env.DOXIE_OPENAI_KEY;
if (!openaiKey) {
    console.error("Please specify the DOXIE_OPENAI_KEY env var");
    process.exit(-1);
}
const cohereKey = process.env.DOXIE_COHERE_KEY;
if (!cohereKey) {
    console.error("DOXIE_COHERE_KEY env var not set, will not use Cohere for reranking RAG results");
}
const adminToken = process.env.DOXIE_ADMIN_TOKEN;
if (!adminToken) {
    console.error("Please specify the DOXIE_ADMIN_TOKEN env var");
    process.exit(-1);
}
const dbPassword = process.env.DOXIE_DB_PASSWORD;
if (!dbPassword) {
    console.error("Please specify the DOXIE_DB_PASSWORD env var");
    process.exit(-1);
}

function apiSuccess<T>(res: Response, data?: T) {
    return res.json({ success: true, data });
}

function apiError<E extends ErrorReason = ErrorReason>(res: Response, error: string, validationErrors?: any) {
    return res.status(400).json({ success: false, error, validationErrors });
}

function logError(endpoint: string, message: string, e: any) {
    console.error(`${endpoint}: ${message}`, e);
}

(async () => {
    if (!fs.existsSync("html/files")) {
        fs.mkdirSync("html/files");
    }

    await Promise.all([Rag.waitForChroma(), Database.waitForMongo()]);
    const embedder = new Embedder(openaiKey, async (message: string) => console.log(message));
    const rag = new Rag(embedder);
    const database = new Database();
    const vectors = new VectorStore(openaiKey);
    const sessions = new ChatSessions(openaiKey, database, vectors, cohereKey);
    const jobs = new Jobs(database);

    const app = express();
    app.set("json spaces", 2);
    app.use(cors());
    app.use(compression());
    app.use(express.json());
    app.set("trust proxy", true);

    const storage = multer.diskStorage({
        destination: "html/files", // Set destination to html/files
        filename: (req, file, cb) => {
            const fileExtension = path.extname(file.originalname);
            cb(null, uuid() + fileExtension); // Set filename to UUID
        },
    });
    const upload = multer({ storage: storage });

    app.post("/api/upload", [upload.single("file"), header("authorization").notEmpty().isString()], async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
        try {
            const token = req.headers.authorization!;
            if (token != adminToken) throw new Error("Invalid admin token");
            if (!req.file) throw new Error("No file uploaded");
            apiSuccess(res, req.file.filename);
        } catch (e) {
            logError(req.path, "Could not upload file", e);
            apiError(res, "Could not upload file");
        }
    });

    app.get("/api/bots", [header("authorization").notEmpty().isString()], async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
        try {
            const token = req.headers.authorization!;
            if (token == "noauth") {
                apiSuccess<Bot[]>(
                    res,
                    (await database.getBots()).map((bot) => {
                        return { ...bot, systemPrompt: "" };
                    })
                );
                return;
            }

            if (token != adminToken) throw new Error("Invalid admin token");
            apiSuccess<Bot[]>(res, await database.getBots());
        } catch (e) {
            logError(req.path, "Could not get bots", e);
            apiError(res, "Could not get bots");
        }
    });

    app.get(
        "/api/bots/:id",
        [header("authorization").notEmpty().isString(), param("id").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                const id = req.params.id as string;
                if (token == "noauth") {
                    const bot = await database.getBot(id);
                    bot.systemPrompt = "";
                    apiSuccess<Bot>(res, bot);
                    return;
                }
                if (token != adminToken) throw new Error("Invalid admin token");
                apiSuccess<Bot>(res, await database.getBot(id));
            } catch (e) {
                const error = "Could not get bot " + req.query.id;
                logError(req.path, error, e);
                apiError(res, error);
            }
        }
    );

    app.delete(
        "/api/bots/:id",
        [header("authorization").notEmpty().isString(), param("id").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                if (token != adminToken) throw new Error("Invalid admin token");
                const id = req.params.id as string;
                await database.deleteBot(id);
                apiSuccess(res);
            } catch (e) {
                const error = "Could not delete bot " + req.query.id;
                logError(req.path, error, e);
                apiError(res, error);
            }
        }
    );

    app.post("/api/bots", [header("authorization").notEmpty().isString()], async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
        try {
            const token = req.headers.authorization!;
            if (token != adminToken) throw new Error("Invalid admin token");
            const bot = req.body as Bot;
            apiSuccess<Bot>(res, await database.setBot(bot));
        } catch (e) {
            const error = "Could not update bot " + req.body._id;
            logError(req.path, error, e);
            apiError(res, error);
        }
    });

    app.get("/api/sources", [header("authorization").notEmpty().isString()], async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
        try {
            const token = req.headers.authorization!;
            if (token != adminToken) throw new Error("Invalid admin token");
            apiSuccess<Source[]>(res, await database.getSources());
        } catch (e) {
            const error = "Could not get sources";
            logError(req.path, error, e);
            apiError(res, error);
        }
    });

    app.get(
        "/api/sources/:id",
        [header("authorization").notEmpty().isString(), param("id").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                if (token != adminToken) throw new Error("Invalid admin token");
                const id = req.params.id as string;
                apiSuccess<Source>(res, await database.getSource(id));
            } catch (e) {
                const error = "Could not get source " + req.params.id;
                logError(req.path, error, e);
                apiError(res, error);
            }
        }
    );

    app.delete(
        "/api/sources/:id",
        [header("authorization").notEmpty().isString(), param("id").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                if (token != adminToken) throw new Error("Invalid admin token");
                const id = req.params.id as string;
                await database.deleteSource(id);
                apiSuccess(res);
            } catch (e) {
                const error = "Could not delete source " + req.query.id;
                logError(req.path, error, e);
                apiError(res, error);
            }
        }
    );

    app.post("/api/sources", [header("authorization").notEmpty().isString()], async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
        try {
            const token = req.headers.authorization!;
            if (token != adminToken) throw new Error("Invalid admin token");
            const source = req.body as Source;
            apiSuccess<Source>(res, await database.setSource(source));
        } catch (e) {
            const error = "Could not update source " + req.body._id;
            logError(req.path, error, e);
            apiError(res, error);
        }
    });

    app.get("/api/sources/:id/job", [header("authorization").notEmpty().isString()], async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
        try {
            const token = req.headers.authorization!;
            if (token != adminToken) throw new Error("Invalid admin token");
            const sourceId = req.params.id as string;
            const job = await jobs.getJob(sourceId);
            apiSuccess(res, job);
        } catch (e) {
            const error = "Could not get job for source " + req.body._id;
            logError(req.path, error, e);
            apiError(res, error);
        }
    });

    app.get("/api/sources/:id/process", [header("authorization").notEmpty().isString()], async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
        try {
            const token = req.headers.authorization!;
            if (token != adminToken) throw new Error("Invalid admin token");
            const sourceId = req.params.id as string;
            const job = await jobs.startJob(sourceId);
            apiSuccess(res, job);
        } catch (e) {
            const error = "Could not process source " + req.body._id;
            logError(req.path, error, e);
            apiError(res, error);
        }
    });

    app.get(
        "/api/sources/:id/stopprocessing",
        [header("authorization").notEmpty().isString(), param("id").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                if (token != adminToken) throw new Error("Invalid admin token");
                const sourceId = req.params.id as string;
                const job = await jobs.stopJob(sourceId);
                apiSuccess(res, job);
            } catch (e) {
                const error = "Could not stop processing source " + req.body._id;
                logError(req.path, error, e);
                apiError(res, error);
            }
        }
    );

    app.get(
        "/api/documents/:sourceId",
        [header("authorization").notEmpty().isString(), param("sourceId").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                if (token != adminToken) throw new Error("Invalid admin token");
                const sourceId = req.params.sourceId as string;
                const offset = parseInt((req.query.offset as string) ?? "0");
                const limit = parseInt((req.query.limit as string) ?? "25");
                const response = await vectors.getDocuments(sourceId, offset, limit);
                apiSuccess(res, response);
            } catch (e) {
                const error = "Could not get documents of source " + req.params.sourceId;
                logError(req.path, error, e);
                apiError(res, error);
            }
        }
    );

    app.post("/api/documents/:sourceId/query", [param("sourceId").notEmpty().isString()], async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
        try {
            const sourceId = req.params.sourceId as string;
            const body = req.body;
            const query = body.query as string;
            const k = parseInt(body.k as string);
            const queryVector = (await vectors.embedder.embed([query]))[0];
            const response = await vectors.query(sourceId, queryVector, k);
            apiSuccess(res, response);
        } catch (e) {
            const error = "Could not get documents of source " + req.params.sourceId;
            logError(req.path, error, e);
            apiError(res, error);
        }
    });

    app.get(
        "/api/chats/:botId",
        [header("authorization").notEmpty().isString(), param("botId").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                if (token != adminToken) throw new Error("Invalid admin token");
                const botId = req.params.botId as string;
                const offset = parseInt((req.query.offset as string) ?? "0");
                const limit = parseInt((req.query.limit as string) ?? "25");
                const response = await database.getChats(botId, offset, limit);
                apiSuccess(res, response);
            } catch (e) {
                const error = "Could not get chats of bot " + req.params.botId;
                logError(req.path, error, e);
                apiError(res, error);
            }
        }
    );

    app.get(
        "/api/chatsession/:sessionId",
        [header("authorization").notEmpty().isString(), param("sessionId").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                if (token != adminToken) throw new Error("Invalid admin token");
                const sessionId = req.params.sessionId as string;
                const response = await database.getChat(sessionId);
                apiSuccess(res, response);
            } catch (e) {
                const error = "Could not get chat " + req.params.sessionId;
                logError(req.path, error, e);
                apiError(res, error);
            }
        }
    );

    app.post("/api/createSession", [body("botId").notEmpty().isString()], async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
        try {
            const botId = req.body.botId;
            const sourceIds = req.body.sourceIds;
            const sessionId = await sessions.createSession(req.ip ?? "", botId, sourceIds);
            apiSuccess(res, { sessionId });
        } catch (e) {
            logError(req.path, "Couldn't create session", e);
            apiError(res, "Unknown server error");
        }
    });

    app.post(
        "/api/deleteSession",
        [header("authorization").notEmpty().isString(), body("sessionId").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                if (token != adminToken) throw new Error("Invalid admin token");
                const sessionId = req.body.sessionId as string;
                const response = await database.deleteChat(sessionId);
                apiSuccess(res, response);
            } catch (e) {
                const error = "Could not delete chat " + req.body.sessionId;
                logError(req.path, error, e);
                apiError(res, error);
            }
        }
    );

    app.post(
        "/api/complete",
        [header("authorization").notEmpty().isString(), body("message").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const sessionId = req.headers.authorization!;
                const message = req.body.message;
                await sessions.complete(sessionId, message, (content, type) => {
                    const encoder = new TextEncoder();
                    if (content) {
                        const bytes = encoder.encode(content);
                        const typeUint8 = new Uint8Array(1);
                        typeUint8[0] = type == "text" ? 0 : 1;
                        const numBytes = new Uint32Array(1);
                        numBytes[0] = bytes.length;
                        const numBytesUint8 = new Uint8Array(numBytes.buffer);
                        res.write(typeUint8);
                        res.write(numBytesUint8);
                        res.write(bytes);
                        res.flush();
                    }
                });
                res.end();
            } catch (e) {
                logError(req.path, "Couldn't complete message", e);
                apiError(res, "Unknown server error" + (e as Error).message + (e as Error).stack);
            }
        }
    );

    app.post("/api/answer", [body("botId").notEmpty().isString()], async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
        try {
            const botId = req.body.botId;
            const question = req.body.question;
            const sourceIds = req.body.sourceIds;
            console.log("Answering question " + question + " via bot " + botId + ", sources: " + sourceIds);
            const answer = await sessions.answer(botId, question, sourceIds);
            apiSuccess(res, answer);
            console.log("Answer: " + answer.answer);
        } catch (e) {
            logError(req.path, "Couldn't create answer", e);
            apiError(res, "Couldn't create answer");
        }
    });

    app.get("/api/search", async (req, res) => {
        try {
            if (!req.query.query || typeof req.query.query != "string") throw Error("No query given");
            if (!req.query.sourceId) throw new Error("No source id(s) given");
            const start = performance.now();
            const sources = Array.isArray(req.query.sourceId) ? (req.query.sourceId as string[]) : [req.query.sourceId as string];
            const query = req.query.query;
            const queryVector = (await vectors.embedder.embed([query]))[0];
            const k = req.query.k ? parseInt(req.query.k as string) : 50;
            const seenUrls = new Map<string, VectorDocument>();
            const resultUrls: string[] = [];
            for (const source of sources) {
                const result = await vectors.query(source, queryVector, k, ["metadatas", "documents", "distances"]);
                for (const res of result) {
                    if (seenUrls.has(res.docUri)) {
                        if (seenUrls.get(res.docUri)!.index > res.index) {
                            seenUrls.set(res.docUri, res);
                        }
                        continue;
                    }
                    resultUrls.push(res.docUri);
                    seenUrls.set(res.docUri, res);
                }
            }
            const results = resultUrls.map((url) => seenUrls.get(url)!).sort((a, b) => a.distance - b.distance);
            res.send({ sources, query, took: (performance.now() - start) / 1000, numResults: results.length, results });
        } catch (e) {
            res.status(400).json(e);
        }
    });

    app.get("/api/html", async (req, res) => {
        try {
            const url = req.query.url as string;
            const response = await fetch(url);
            if (!response.ok) {
                res.status(400).json({ error: "Couldn't fetch " + url });
                return;
            }
            res.send(await response.text());
        } catch (e) {
            res.status(400).json(e);
        }
    });

    const server = http.createServer(app);
    server.listen(port, async () => {
        console.log(`App listening on port ${port}`);
    });

    setupLiveReload(server);
})();

function setupLiveReload(server: http.Server) {
    const wss = new WebSocketServer({ server });
    const clients: Set<WebSocket> = new Set();
    wss.on("connection", (ws: WebSocket) => {
        clients.add(ws);
        ws.on("close", () => {
            clients.delete(ws);
        });
    });

    chokidar.watch("html/", { ignored: /(^|[\/\\])\../, ignoreInitial: true }).on("all", (event, path) => {
        if (path.startsWith("html/files/")) return;
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(`File changed: ${path}`);
            }
        });
    });
    console.log("Initialized live-reload");
}
