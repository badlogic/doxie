import * as chokidar from "chokidar";
import compression from "compression";
import cors from "cors";
import express, { Request, Response } from "express";
import { body, header, validationResult } from "express-validator";
import * as fs from "fs";
import * as http from "http";
import multer from "multer";
import WebSocket, { WebSocketServer } from "ws";
import { EmbedderDocument, EmbedderDocumentSegment } from "../common/api";
import { ErrorReason } from "../common/errors";
import { Embedder } from "./embedder";
import { ChatSessions } from "./chatsessions";
import { ChromaClient, IEmbeddingFunction } from "chromadb";
import { Rag } from "./rag";

const upload = multer({ storage: multer.memoryStorage() });

const port = process.env.PORT ?? 3333;
const openaiKey = process.env.OPENAI_KEY;
if (!openaiKey) {
    console.error("Please specify the OPENAI_KEY env var");
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

    await Rag.waitForChroma();
    const embedder = new Embedder(openaiKey);
    const rag = new Rag(embedder);
    const berufsLexikonFile = "docker/data/berufslexikon.embeddings.bin";
    const berufsLexikon = await rag.loadCollection("berufslexikon", berufsLexikonFile);
    const spineFile = "docker/data/spine.embeddings.bin";
    const spine = await rag.loadCollection("spine", spineFile);
    const sessions = new ChatSessions(openaiKey, [berufsLexikon, spine]);

    const app = express();
    app.set("json spaces", 2);
    app.use(cors());
    app.use(compression());
    app.use(express.json());
    app.set("trust proxy", true);

    app.post("/api/createSession", [body("collection").notEmpty().isString()], async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
        try {
            const collection = req.body.collection;
            const sessionId = sessions.createSession(req.ip ?? "", collection);
            apiSuccess(res, { sessionId });
        } catch (e) {
            logError(req.path, "Couldn't create session", e);
            apiError(res, "Unknown server error");
        }
    });

    app.post(
        "/api/complete",
        [header("authorization").notEmpty().isString(), body("message").notEmpty().isString(), body("collection").notEmpty().isString()],
        async (req: Request, res: Response) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return apiError(res, "Invalid parameters", errors.array());
            try {
                const sessionId = req.headers.authorization!;
                const collection = req.body.collection;
                const message = req.body.message;
                await sessions.complete(sessionId, collection, message, (content, type) => {
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
