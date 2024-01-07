import * as fs from "fs";
import cheerio from "cheerio";
import { EmbedderDocument } from "../common/api";

export interface SolrRow {
    id: string; // "2189",
    url: string; // "/berufe/2189-WerbetexterIn/",
    title: string; // "WerbetexterIn",
    bereiche: string; // "<a href=\"/suche/?s%5B0%5D=286\">Marketing, Werbung, Public Relations</a>",
    filterkategorien: number; // 0,
    lexikon: string[]; // ["schule"],
    lexikonspan: string[]; // ["schule"],
    apprentices_total: number | null; // null,
    apprentices_female: number | null; // null,
    apprentices_male: number | null; // null
    le_only: boolean; // false
}

export interface SolrResult {
    recordsFiltered: number;
    data: SolrRow[];
}

export interface JobData {
    id: string;
    uri: string;
    title: string;
    jobFields: string[]; // jobFields[0] ? jobFields[0].replace("Berufsbereiche: ", "").split(", ") : [],
    educationType: string; // educationType.replace("Ausbildungsform: ", ""),
    salaryRange?: { min: number; max: number }; // salaryRange.length === 2 ? { min: salaryRange[0], max: salaryRange[1] } : null,
    description: string;
    berufekvs: string;
    anforderungen: string;
    beschaeftigung: string;
    aussichten: string;
    ausbildung: string;
    weiterbildung: string;
    aufstieg: string;
}

function cleanStrings(jsonObj: any): any {
    for (let key in jsonObj) {
        if (typeof jsonObj[key] === "string") {
            // Replace multiple spaces with a single space, except newlines
            jsonObj[key] = jsonObj[key]
                .replace(/[^\S\r\n]+/g, " ")
                // Remove space after newlines
                .replace(/(\r?\n|\r) +/g, "\n")
                // Replace more than two consecutive newlines with two newlines
                .replace(/(\r?\n|\r){3,}/g, "\n\n")
                // Trim leading and trailing whitespace
                .trim();
        } else if (typeof jsonObj[key] === "object" && jsonObj[key] !== null) {
            jsonObj[key] = cleanStrings(jsonObj[key]);
        }
    }
    return jsonObj;
}

function extractJobData(html: string, uri: string): JobData {
    const $ = cheerio.load(html);

    const getTextContent = (selector: string): string => {
        const element = $(selector);
        return element.length ? element.text().trim() : "";
    };

    const title = getTextContent("#pageContent h1");
    const jobFieldsText = getTextContent(".beruf-header-bereiche");
    const jobFields = jobFieldsText.split("\n").map((s) => s.trim()) || [];
    const educationType = jobFields.length > 1 ? jobFields[1].replace("Ausbildungsform: ", "") : "";
    const salaryRangeText = getTextContent(".gehalt-zahl");
    const salaryRange = salaryRangeText
        .replace(/[\s\*,]/g, "")
        .split("bis")
        .map((range) => parseInt(range.replace("€", "").replace(".", "").replace("-", "")));
    const description = getTextContent("#description-full") || getTextContent("#description-short") || getTextContent("#description");
    const berufekvs = getTextContent("#berufekvs");
    const anforderungen = getTextContent("#anforderungen");
    const beschaeftigung = getTextContent("#beschaeftigung");
    const aussichten = getTextContent("#aussichten");
    const offenestellen = getTextContent("#offenestellen");
    const ausbildung = getTextContent("#ausbildung");
    const weiterbildung = getTextContent("#weiterbildung");
    const aufstieg = getTextContent("#aufstieg");

    return cleanStrings({
        id: "",
        title,
        uri,
        jobFields: jobFields[0] ? jobFields[0].replace("Berufsbereiche: ", "").split(", ") : [],
        educationType,
        salaryRange: salaryRange.length === 2 ? { min: salaryRange[0], max: salaryRange[1] } : undefined,
        description,
        berufekvs,
        anforderungen,
        beschaeftigung,
        aussichten,
        offenestellen,
        ausbildung,
        weiterbildung,
        aufstieg,
    });
}

(async () => {
    if (process.argv.length != 3) {
        console.log("Usage: node berufslexikon <output-prefix>");
        process.exit(-1);
    }
    const baseFile = process.argv[2];

    const urlsFile = baseFile + ".urls.json";
    const jobUrls: SolrRow[] = [];
    if (!fs.existsSync(urlsFile)) {
        console.log("Fetching all job urls, saving to " + urlsFile);
        let start = 0;

        let error = false;
        while (true) {
            try {
                const result = await fetch("https://www.berufslexikon.at/searchjsonsolr/?json=true&rows=25&start=" + start);
                if (!result.ok) break;
                start += 25;
                const json = (await result.json()) as SolrResult;
                jobUrls.push(...json.data);
                console.log(`Fetched ${jobUrls.length}/${json.recordsFiltered} jobs `);
            } catch (e) {
                console.error("Couldn't fetch jobs", e);
            }
        }

        if (!error) {
            fs.writeFileSync(urlsFile, JSON.stringify(jobUrls, null, 2), "utf-8");
        }
    } else {
        console.log("Found jobs url .json file");
        jobUrls.push(...(JSON.parse(fs.readFileSync(urlsFile, "utf-8")) as SolrRow[]));
    }

    const htmlDir = baseFile + ".html";
    fs.mkdirSync(htmlDir, { recursive: true });
    const stack = [...jobUrls];
    console.log("Fetching job HTML pages, saving to " + htmlDir);
    while (stack.length > 0) {
        const batch = stack.splice(0, 25).filter((job) => !fs.existsSync(htmlDir + "/" + job.id + ".html"));
        const promises = batch.map((job) => fetch("https://www.berufslexikon.at" + job.url));
        const results = await Promise.all(promises);
        const htmlPromises = results.map((result) => result.text());
        const html = await Promise.all(htmlPromises);
        for (let i = 0; i < batch.length; i++) {
            fs.writeFileSync(htmlDir + "/" + batch[i].id + ".html", html[i], "utf-8");
        }
        console.log(`Fetched ${jobUrls.length - stack.length}/${jobUrls.length} job html pages`);
    }

    const extractedFile = baseFile + ".extracted.json";
    console.log("Extracting data from HTML pages, saving to " + extractedFile);
    const extractedJobs: JobData[] = [];
    if (!fs.existsSync(extractedFile)) {
        let noData = 0;
        let processed = 0;
        for (const jobUrl of jobUrls) {
            const html = fs.readFileSync(htmlDir + "/" + jobUrl.id + ".html", "utf-8");
            const data = extractJobData(html, `https://www.berufslexikon.at${jobUrl.url}`);
            data.id = jobUrl.id;
            if (data.description.length == 0) {
                noData++;
                console.log(`No data: https://www.berufslexikon.at${jobUrl.url} ./${baseFile}.html/${jobUrl.id}.html`);
            } else {
                extractedJobs.push(data);
            }
            processed++;
            if (processed % 100 == 0) console.log(`Processed ${processed}/${jobUrls.length}`);
        }
        console.log(`Jobs without data: ${noData}/${jobUrls.length}`);
        fs.writeFileSync(extractedFile, JSON.stringify(extractedJobs, null, 2), "utf-8");
    } else {
        console.log("Found extracted jobs .json file");
        extractedJobs.push(...(JSON.parse(fs.readFileSync(extractedFile, "utf-8")) as JobData[]));
    }

    const embedderInputFile = baseFile + ".embedderinput.json";
    console.log("Converting extracted jobs to embedder format, saving to " + embedderInputFile);
    if (!fs.existsSync(embedderInputFile)) {
        const docs: EmbedderDocument[] = [];
        for (const job of extractedJobs) {
            const text =
                "===Titel===\n" +
                job.title +
                "\n\n" +
                (job.salaryRange ? "===Gehalt===\n € " + job.salaryRange.min + " - " + job.salaryRange.max + " EUR\n\n" : "") +
                "===Beschreibung===\n" +
                job.description +
                "\n\n" +
                (job.anforderungen.length > 0 ? "===Anforderungen===\n" + job.anforderungen + "\n\n" : "") +
                (job.aussichten.length > 0 ? "===Aussichten===\n" + job.aussichten + "\n\n" : "") +
                (job.ausbildung.length > 0 ? "===Ausbildung===\n" + job.ausbildung + "\n\n" : "") +
                (job.weiterbildung.length > 0 ? "===Weiterbildung===\n" + job.weiterbildung + +"\n\n" : "") +
                (job.aufstieg.length > 0 ? "===Aufstieg===\n" + job.aufstieg : "");
            const doc: EmbedderDocument = {
                uri: job.uri,
                title: "AMS Berufslexikon - " + job.title,
                text,
                segments: [],
            };
            docs.push(doc);
        }
        fs.writeFileSync(embedderInputFile, JSON.stringify(docs, null, 2), "utf-8");
    }
})();
