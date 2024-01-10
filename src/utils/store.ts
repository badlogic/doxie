export type Theme = "dark" | "light";

export type Settings = {
    theme: Theme;
    adminToken?: string;
};

export type StoreKey = "user" | "settings";

export class Store {
    static memory = new Map<string, any>();

    static {
        let settings: Settings | undefined = Store.get<Settings>("settings");
        settings = settings ?? ({} as Settings);

        settings.theme = settings.theme ?? "dark";

        Store.set<Settings>("settings", settings);
    }

    private static get<T>(key: StoreKey): T | undefined {
        try {
            let memResult = this.memory.get(key);
            if (memResult) return memResult as T;
            memResult = localStorage.getItem(key) ? (JSON.parse(localStorage.getItem(key)!) as T) : undefined;
            this.memory.set(key, memResult);
            return memResult;
        } catch (e) {
            localStorage.removeItem(key);
            return undefined;
        }
    }

    private static set<T>(key: StoreKey, value: T | undefined) {
        if (value == undefined) {
            localStorage.removeItem(key);
            this.memory.delete(key);
        } else {
            localStorage.setItem(key, JSON.stringify(value));
            this.memory.set(key, value);
        }
        return value;
    }

    static getTheme() {
        return Store.get<Settings>("settings")?.theme;
    }

    static setTheme(theme: Theme) {
        Store.set("settings", { ...Store.get<Settings>("settings"), theme });

        return theme;
    }

    static getAdminToken() {
        return Store.get<Settings>("settings")?.adminToken;
    }

    static setAdminToken(adminToken?: string) {
        Store.set("settings", { ...Store.get<Settings>("settings"), adminToken });
    }
}

const theme = Store.getTheme();
if (theme == "dark") document.documentElement.classList.add("dark");
else document.documentElement.classList.remove("dark");
