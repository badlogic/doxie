import bodyParser from "body-parser";
import * as chokidar from "chokidar";
import compression from "compression";
import cors from "cors";
import express from "express";
import * as fs from "fs";
import * as http from "http";
import multer from "multer";
import WebSocket, { WebSocketServer } from "ws";
import { Pool } from "pg";
import { sleep } from "../utils/utils.js";
const upload = multer({ storage: multer.memoryStorage() });

const port = process.env.PORT ?? 3333;
const dbName = process.env.DATABASE;
if (!dbName) {
    console.error("Environment variable DATABASE missing");
    process.exit(-1);
}
const dbUser = process.env.DATABASE_USER;
if (!dbUser) {
    console.error("Environment variable DATABASE_USER missing");
    process.exit(-1);
}
const dbPassword = process.env.DATABASE_PASSWORD;
if (!dbPassword) {
    console.error("Environment variable DATABASE_PASSWORD missing");
    process.exit(-1);
}

const pool = new Pool({
    host: "db",
    database: dbName,
    user: dbUser,
    password: dbPassword,
    port: 5432,
});

(async () => {
    const result = await connectWithRetry(5, 3000);
    if (result instanceof Error) {
        process.exit(-1);
    }

    if (!fs.existsSync("docker/data")) {
        fs.mkdirSync("docker/data");
    }

    const app = express();
    app.set("json spaces", 2);
    app.use(cors());
    app.use(compression());
    app.use(bodyParser.urlencoded({ extended: true }));

    app.get("/api/hello", (req, res) => {
        res.json({ message: "Hello world" });
    });

    const server = http.createServer(app);
    server.listen(port, async () => {
        console.log(`App listening on port ${port}`);
    });

    setupLiveReload(server);
})();

async function connectWithRetry(maxRetries = 5, interval = 2000) {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            const client = await pool.connect();
            try {
                const result = await client.query("SELECT NOW()");
                console.log("Query result:", result.rows);
                return undefined; // Successful connection, exit the function
            } finally {
                client.release();
            }
        } catch (err) {
            console.error("Connection attempt failed:", err);
            retries++;
            if (retries === maxRetries) {
                return new Error("Failed to connect to the database after retries");
            }
            await sleep(interval);
        }
    }
}

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
