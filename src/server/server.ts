import * as chokidar from "chokidar";
import compression from "compression";
import cors from "cors";
import express, { Request, Response } from "express";
import { body, header, param, validationResult } from "express-validator";
import * as fs from "fs";
import * as http from "http";
import multer from "multer";
import WebSocket, { WebSocketServer } from "ws";
import { Collection, ProcessingJob, Source } from "../common/api";
import { ErrorReason } from "../common/errors";
import { ChatSessions } from "./chatsessions";
import { Database, VectorStore } from "./database";
import { Embedder } from "./embedder";
import { Rag } from "./rag";
import { Jobs } from "./jobs";

const upload = multer({ storage: multer.memoryStorage() });

const port = process.env.PORT ?? 3333;
const openaiKey = process.env.DOXIE_OPENAI_KEY;
if (!openaiKey) {
    console.error("Please specify the DOXIE_OPENAI_KEY env var");
    process.exit(-1);
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
    if (!fs.existsSync("docker/data")) {
        fs.mkdirSync("docker/data");
    }

    await Promise.all([Rag.waitForChroma(), Database.waitForMongo()]);
    const embedder = new Embedder(openaiKey, async (message: string) => console.log(message));
    const rag = new Rag(embedder);
    const database = new Database();
    const vectors = new VectorStore(openaiKey);
    const sessions = new ChatSessions(openaiKey, database, vectors);
    const jobs = new Jobs(database);

    // const berufsLexikonFile = "docker/data/berufslexikon.embeddings.bin";
    // const spineFile = "docker/data/spine.embeddings.bin";
    // const berufsLexikon = await rag.loadCollection("berufslexikon", berufsLexikonFile);
    // const spine = await rag.loadCollection("spine", spineFile);
    // const sessions = new ChatSessions(openaiKey, [berufsLexikon, spine]);

    const app = express();
    app.set("json spaces", 2);
    app.use(cors());
    app.use(compression());
    app.use(express.json());
    app.set("trust proxy", true);

    app.get("/api/collections", [header("authorization").notEmpty().isString()], async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
        try {
            const token = req.headers.authorization!;
            if (token != adminToken) throw new Error("Inavlid admin token");
            apiSuccess<Collection[]>(res, await database.getCollections());
        } catch (e) {
            logError(req.path, "Could not get collections", e);
            apiError(res, "Could get collections");
        }
    });

    app.get(
        "/api/collections/:id",
        [header("authorization").notEmpty().isString(), param("id").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                if (token != adminToken) throw new Error("Inavlid admin token");
                const id = req.params.id as string;
                apiSuccess<Collection>(res, await database.getCollection(id));
            } catch (e) {
                const error = "Could not get collection " + req.query.id;
                logError(req.path, error, e);
                apiError(res, error);
            }
        }
    );

    app.delete(
        "/api/collections/:id",
        [header("authorization").notEmpty().isString(), param("id").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                if (token != adminToken) throw new Error("Inavlid admin token");
                const id = req.params.id as string;
                await database.deleteCollection(id);
                apiSuccess(res);
            } catch (e) {
                const error = "Could not delete collection " + req.query.id;
                logError(req.path, error, e);
                apiError(res, error);
            }
        }
    );

    app.post("/api/collections", [header("authorization").notEmpty().isString()], async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
        try {
            const token = req.headers.authorization!;
            if (token != adminToken) throw new Error("Inavlid admin token");
            const collection = req.body as Collection;
            apiSuccess<Collection>(res, await database.setCollection(collection));
        } catch (e) {
            const error = "Could not update collection " + req.body._id;
            logError(req.path, error, e);
            apiError(res, error);
        }
    });

    app.get(
        "/api/collections/:id/sources",
        [header("authorization").notEmpty().isString(), param("id").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                if (token != adminToken) throw new Error("Inavlid admin token");
                apiSuccess<Source[]>(res, await database.getSources(req.params.id));
            } catch (e) {
                const error = "Could not get sources of collection " + req.params.id;
                logError(req.path, error, e);
                apiError(res, error);
            }
        }
    );

    app.get(
        "/api/sources/:id",
        [header("authorization").notEmpty().isString(), param("id").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                if (token != adminToken) throw new Error("Inavlid admin token");
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
                if (token != adminToken) throw new Error("Inavlid admin token");
                const id = req.params.id as string;
                await database.deleteSource(id);
                apiSuccess(res);
            } catch (e) {
                const error = "Could not delete collection " + req.query.id;
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
            if (token != adminToken) throw new Error("Inavlid admin token");
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
            if (token != adminToken) throw new Error("Inavlid admin token");
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
            if (token != adminToken) throw new Error("Inavlid admin token");
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
                if (token != adminToken) throw new Error("Inavlid admin token");
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
        "/api/documents/:collectionId/:sourceId",
        [header("authorization").notEmpty().isString(), param("collectionId").notEmpty().isString(), param("sourceId").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                if (token != adminToken) throw new Error("Inavlid admin token");
                const collectionId = req.params.collectionId as string;
                const sourceId = req.params.sourceId as string;
                const offset = parseInt((req.query.offset as string) ?? "0");
                const limit = parseInt((req.query.limit as string) ?? "25");
                const response = await vectors.getDocuments(collectionId, sourceId, offset, limit);
                apiSuccess(res, response);
            } catch (e) {
                const error = "Could not get documents of source " + req.params.sourceId;
                logError(req.path, error, e);
                apiError(res, error);
            }
        }
    );

    app.get(
        "/api/documents/:collectionId/:sourceId/query",
        [header("authorization").notEmpty().isString(), param("collectionId").notEmpty().isString(), param("sourceId").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const token = req.headers.authorization!;
                if (token != adminToken) throw new Error("Inavlid admin token");
                const collectionId = req.params.collectionId as string;
                const sourceId = req.params.sourceId as string;
                const query = req.query.query as string;
                const k = parseInt(req.query.k as string);
                const response = await vectors.query(collectionId, sourceId, query, k);
                apiSuccess(res, response);
            } catch (e) {
                const error = "Could not get documents of source " + req.params.sourceId;
                logError(req.path, error, e);
                apiError(res, error);
            }
        }
    );

    app.post("/api/createSession", [body("collection").notEmpty().isString()], async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
        try {
            const collection = req.body.collection;
            const sessionId = await sessions.createSession(req.ip ?? "", collection);
            apiSuccess(res, { sessionId });
        } catch (e) {
            logError(req.path, "Couldn't create session", e);
            apiError(res, "Unknown server error");
        }
    });

    app.post(
        "/api/complete",
        [header("authorization").notEmpty().isString(), body("message").notEmpty().isString(), body("collectionId").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const sessionId = req.headers.authorization!;
                const collection = req.body.collectionId;
                const source = req.body.sourceId;
                const message = req.body.message;
                await sessions.complete(sessionId, collection, source, message, (content, type) => {
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
                apiError(res, "Unknown server error");
            }
        }
    );

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
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(`File changed: ${path}`);
            }
        });
    });
    console.log("Initialized live-reload");
}
