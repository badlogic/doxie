import * as fs from "fs";
import { Database } from "./database";
import { Rag } from "./rag";
import { ProcessingJob } from "../common/api";
import { Collection as MongoCollection, ObjectId, Document } from "mongodb";
import { sleep } from "../utils/utils";

class Processor {
    constructor(private jobs: MongoCollection<Document>) {}

    async getNextJob(): Promise<ProcessingJob | undefined> {
        let job = (await this.jobs.findOneAndUpdate(
            { state: "waiting" },
            { $set: { state: "running", startedAt: Date.now() } },
            { sort: { createdAt: 1 }, returnDocument: "after" }
        )) as ProcessingJob | null;
        if (!job) return undefined;
        job._id = (job as any)._id.toHexString();
        return job;
    }

    async updateJobLog(jobId: string, log: string): Promise<void> {
        await this.jobs.updateOne({ _id: new ObjectId(jobId) }, { $set: { log } });
    }

    async checkJobStatus(jobId: string): Promise<ProcessingJob["state"]> {
        const job = (await this.jobs.findOne({ _id: new ObjectId(jobId) }, { projection: { state: 1 } })) as ProcessingJob | null;
        return job?.state ?? "stopped";
    }

    async finishJob(jobId: string, success: boolean): Promise<void> {
        const newState = success ? "succeeded" : "failed";
        await this.jobs.updateOne({ _id: new ObjectId(jobId) }, { $set: { state: newState, finishedAt: Date.now() } });
    }

    async log(job: ProcessingJob, message: string) {
        job.log += message + "\n";
        console.log(message);
        await this.updateJobLog(job._id!, job.log);
    }

    // Method to process the job
    async process(): Promise<void> {
        while (true) {
            try {
                const job = await this.getNextJob();
                if (job) {
                    try {
                        console.log("Got job " + JSON.stringify(job, null, 2));
                        for (let i = 0; i < 30; i++) {
                            await this.log(job, "Doing stuff " + i);
                            const status = await this.checkJobStatus(job._id!);
                            if (status == "stopped") {
                                throw new Error("Job stopped by user");
                            }
                            await sleep(1000);
                        }
                        await this.finishJob(job._id!, true);
                    } catch (e) {
                        let message = "";
                        if (e instanceof Error) {
                            message = e.stack ?? e.message;
                        } else {
                            message = "Error: " + JSON.stringify(e);
                        }
                        try {
                            await this.log(job, message);
                        } catch (e) {}
                        await this.finishJob(job._id!, false);
                    }
                }
            } catch (e) {
                console.error("Error fetching next job", e);
            } finally {
                await sleep(1000);
            }
        }
    }
}

const port = process.env.PORT ?? 3334;
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

(async () => {
    if (!fs.existsSync("docker/data")) {
        fs.mkdirSync("docker/data");
    }

    await Promise.all([Rag.waitForChroma(), Database.waitForMongo()]);
    await Database.jobs!.updateMany({ state: "running" }, { $set: { state: "stopped", finishedAt: Date.now() } });
    const db = new Database();
    const jobs = Database.jobs!;
    const processor = new Processor(jobs);
    processor.process();
})();
