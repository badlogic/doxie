import { ProcessingJob } from "../common/api";
import { Database } from "./database";

export class Jobs {
    constructor(readonly database: Database) {}

    async startJob(sourceId: string): Promise<ProcessingJob | undefined> {
        const job = await this.getJob(sourceId);
        if (job) {
            if (job.state == "waiting" || job.state == "running") return job;
            job.log = "";
            job.createdAt = new Date().getTime();
            job.startedAt = -1;
            job.finishedAt = -1;
            job.state = "waiting";
            return await this.database.setJob(job);
        } else {
            const job: ProcessingJob = {
                sourceId,
                log: "",
                createdAt: new Date().getTime(),
                startedAt: -1,
                finishedAt: -1,
                state: "waiting",
            };
            return await this.database.setJob(job);
        }
    }

    async stopJob(sourceId: string): Promise<ProcessingJob | undefined> {
        const job = await this.getJob(sourceId);
        if (job) {
            if (job.state == "waiting" || job.state == "running") {
                job.state = "stopped";
                job.finishedAt = new Date().getTime();
                return await this.database.setJob(job);
            }
        }
    }

    async getJob(sourceId: string): Promise<ProcessingJob | undefined> {
        return (await this.database.getJobBySource(sourceId)) ?? undefined;
    }
}
