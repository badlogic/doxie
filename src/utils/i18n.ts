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
