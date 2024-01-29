import { formatDate, getTimeDifference } from "./utils";

export interface Messages {
    "Whoops, that page doesn't exist": string;
    "Couldn't load mesage": string;
    "Invalid stream": string;
    "Sorry, an unknown error occured": string;
    "End of list": string;
    "Admin token": string;
    "Sign in": string;
    "Loading ...": string;
    "Invalid admin token": string;
    New: string;
    Sources: string;
    Name: string;
    Description: string;
    "System prompt": string;
    Save: string;
    "Could not load collection": string;
    "Could not load collections": string;
    "Could not save collection": string;
    "Collection with this name already exists": string;
    "Could not delete collection ": (name: string) => string;
    Source: string;
    Collection: string;
    "Could not load source": string;
    "Are you sure you want to delete collection": (name: string) => string;
    "Source with this name already exists": string;
    "Are you sure you want to delete source": (name: string) => string;
    "Could not delete source ": (name: string) => string;
    Entries: string;
    Questions: string;
    Answer: string;
    "Related URLs": string;
    "New Entry": string;
    Add: string;
    Collections: string;
    "Waiting for processing": string;
    Processing: string;
    "Processing failed": (time: number) => string;
    "Processing succeeded": (finishedAt: number, startedAt: number) => string;
    "Processing stopped by user": (time: number) => string;
    Process: string;
    Stop: string;
    Logs: string;
    "sitemap.xml URL": string;
    "Included patterns": string;
    "Excluded patterns": string;
    Test: string;
    URLs: string;
    "Could not load job": string;
    Docs: string;
    Chat: string;
    "Could not load source documents": string;
    tokens: string;
    "Search query ...": string;
    Top: string;
    "Title CSS selector": string;
    "Content CSS selectors": string;
    "Chat with your documents, websites, ...": string;
    "Chat with ": string;
    Export: string;
    Import: "Import";
    "User questions": string;
    "Chatbot name": string;
    "Chatbot footer (HTML)": string;
    "Chatbot welcome message": string;
    "Chatbot icon (128x128)": string;
    "Could not upload icon": string;
    "Chatbot CSS": string;
    "Could not export collection": string;
    "Could not import collection": string;
    "Markdown ZIP file": string;
    "Click or drag and drop .zip file containing .md files": string;
    "Could not upload .zip": string;
    markdownZipFormat: string;
    Replay: string;
    "Flarum dump API URL": string;
    "Flarum forum URL": string;
    "Staff user names": string;
}

const english: Messages = {
    "Whoops, that page doesn't exist": "Whoops, that page doesn't exist",
    "Couldn't load mesage": "Couldn't load mesage",
    "Invalid stream": "Invalid stream",
    "Sorry, an unknown error occured": "Sorry, an unknown error occured",
    "End of list": "End of list",
    "Admin token": "Admin token",
    "Sign in": "Sign in",
    "Loading ...": "Loading ...",
    "Invalid admin token": "Invalid admin token",
    New: "New",
    Sources: "Sources",
    Name: "Name",
    Description: "Description",
    "System prompt": "System prompt",
    Save: "Save",
    "Could not load collection": "Could not load collection",
    "Could not load collections": "Could not load collections",
    "Could not save collection": "Could not save collection",
    "Collection with this name already exists": "Collection with this name already exists",
    "Could not delete collection ": (name: string) => "Could not delete collection " + name,
    Source: "Source",
    Collection: "Collection",
    "Could not load source": "Could not load source",
    "Are you sure you want to delete collection": (name: string) => "Are you sure you want to delete collection " + name + "?",
    "Source with this name already exists": "Source with this name already exists",
    "Are you sure you want to delete source": (name: string) => "Are you sure you want to delete source " + name + "?",
    "Could not delete source ": (name: string) => "Could not delete source " + name,
    Entries: "Entries",
    Questions: "Questions",
    Answer: "Answer",
    "Related URLs": "Related URLs",
    "New Entry": "New Entry",
    Add: "Add",
    Collections: "Collections",
    "Waiting for processing": "Waiting for processing",
    Processing: "Processing",
    "Processing failed": (time: number) => "Failed " + getTimeDifference(new Date(time)) + " ago",
    "Processing succeeded": (finishedAt: number, startedAt: number) =>
        "Succeeded " + getTimeDifference(new Date(finishedAt)) + " ago, took " + getTimeDifference(new Date(startedAt), new Date(finishedAt)),
    "Processing stopped by user": (time: number) => "Stopped " + getTimeDifference(new Date(time)) + " ago",
    Process: "Process",
    Stop: "Stop",
    Logs: "Logs",
    "sitemap.xml URL": "sitemap.xml URL",
    "Included patterns": "Included patterns",
    "Excluded patterns": "Excluded patterns",
    Test: "Test",
    URLs: "URLs",
    "Could not load job": "Could not load job",
    Docs: "Docs",
    Chat: "Chat",
    "Could not load source documents": "Could not load source documents",
    tokens: "tokens",
    "Search query ...": "Search query ...",
    Top: "Top",
    "Title CSS selector": "Title CSS selector",
    "Content CSS selectors": "Content CSS selectors",
    "Chat with your documents, websites, ...": "Chat with your documents, websites, ...",
    "Chat with ": "Chat with ",
    Export: "Export",
    Import: "Import",
    "User questions": "User questions",
    "Chatbot name": "Chatbot name",
    "Chatbot footer (HTML)": "Chatbot footer (HTML)",
    "Chatbot welcome message": "Chatbot welcome message",
    "Chatbot icon (128x128)": "Chatbot icon (128x128)",
    "Could not upload icon": "Could not upload icon",
    "Chatbot CSS": "Chatbot CSS",
    "Could not export collection": "Could not export collection",
    "Could not import collection": "Could not import collection",
    "Markdown ZIP file": "Markdown ZIP file",
    "Click or drag and drop .zip file containing .md files": "Click or drag and drop .zip file containing .md files",
    "Could not upload .zip": "Could not upload .zip",
    markdownZipFormat: `<div>.md file Format<div><pre class="hljs p-4 rounded-md">url

[title]
[[description]]
... actual content ...<code></code></pre>`,
    Replay: "Replay",
    "Flarum dump API URL": "Flarum dump API URL",
    "Flarum forum URL": "Flarum forum URL",
    "Staff user names": "Staff user names",
};

export type LanguageCode = "en";

const translations: Record<LanguageCode, Messages> = {
    en: english,
};

export function i18n<T extends keyof Messages>(key: T): Messages[T] {
    const userLocale = navigator.language || (navigator as any).userLanguage;
    const languageCode = userLocale ? (userLocale.split("-")[0] as LanguageCode) : "en";
    const implementation = translations[languageCode];
    const message = implementation ? implementation[key] : translations["en"][key];
    if (!message) {
        console.error("Unknown i18n string " + key);
        return key as any as Messages[T];
    }
    return message;
}
