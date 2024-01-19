export function formatBytes(bytes: number, decimals: number = 2, specifier = true) {
    if (bytes === 0) return specifier ? "0 Bytes" : "0";

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];

    let i = Math.floor(Math.log(bytes) / Math.log(k));
    i = i >= sizes.length ? sizes.length - 1 : i; // Ensure 'i' is within bounds

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + (specifier ? " " + sizes[i] : "");
}

export function formatNumber(num: number | undefined): string {
    if (num == undefined) return "0";
    if (num < 1000) return num.toString();
    if (num < 1000000) return (num / 1000).toFixed(1) + "K";
    return (num / 1000000).toFixed(1) + "M";
}

export function formatDate(inputDateTime: Date, forceYear = false): string {
    const hours = inputDateTime.getHours();
    const minutes = inputDateTime.getMinutes();
    const seconds = inputDateTime.getSeconds();

    const paddedHours = String(hours).padStart(2, "0");
    const paddedMinutes = String(minutes).padStart(2, "0");
    const paddedSeconds = String(seconds).padStart(2, "0");

    const year = inputDateTime.getFullYear();
    const month = new String(inputDateTime.getMonth() + 1).padStart(2, "0");
    const day = new String(inputDateTime.getDate()).padStart(2, "0");

    const currDate = new Date();
    const printYear =
        currDate.getFullYear() != inputDateTime.getFullYear() ||
        currDate.getMonth() != inputDateTime.getMonth() ||
        currDate.getDay() != inputDateTime.getDay() ||
        forceYear;

    return paddedHours + ":" + paddedMinutes + ":" + paddedSeconds + (printYear ? ` ${year}-${month}-${day}` : "");
}

export function getYearMonthDayString(date: Date): string {
    const year = date.getFullYear();
    const month = new String(date.getMonth() + 1).padStart(2, "0");
    const day = new String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function getTimeDifference(utcTimestamp: number | Date, now: number | Date = Date.now()): string {
    const startTime = typeof utcTimestamp == "number" ? utcTimestamp : utcTimestamp.getTime();
    const endTime = typeof now == "number" ? now : now.getTime();
    const timeDifference = endTime - startTime;

    const seconds = Math.floor(timeDifference / 1000);
    if (seconds < 60) {
        return Math.max(seconds, 0) + "s";
    }

    const minutes = Math.floor(timeDifference / (1000 * 60));
    if (minutes < 60) {
        return minutes + "m";
    }

    const hours = Math.floor(timeDifference / (1000 * 60 * 60));
    if (hours < 24) {
        return hours + "h";
    }

    const days = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
    if (days < 30) {
        return days + "d";
    }

    const months = Math.floor(timeDifference / (1000 * 60 * 60 * 24 * 30));
    if (months < 12) {
        return months + "mo";
    }

    const years = Math.floor(timeDifference / (1000 * 60 * 60 * 24 * 365));
    return years + "y";
}

export function assertNever(x: never) {
    throw new Error("Unexpected object: " + x);
}

export function error(message: string, exception?: any) {
    if (exception instanceof Error && exception.message.length == 0) exception = undefined;
    console.error(formatDate(new Date()) + " - " + message, exception);
    return new Error(message);
}

let debugLogId = 0;
export function debugLog(message: string, obj?: any) {
    console.log(`${(debugLogId++).toString().padStart(10, "0")} -- ${message}`);
    if (obj) console.log(obj);
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isVideoFile(fileName: string): boolean {
    const videoExtensions = [".mp4", ".mkv", ".avi", ".flv", ".mov", ".wmv", ".webm"];
    return videoExtensions.some((ext) => fileName.toLowerCase().endsWith(ext));
}

export function getYear(utc: number) {
    return new Date(utc * 1000).getFullYear();
}

export function unescapeHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.documentElement.textContent || "";
}

export function escapeHtml(html: string): string {
    return html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
