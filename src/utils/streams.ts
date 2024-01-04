import { error } from "./utils";

export type StreamPage<T> = { cursor?: string; items: T[] };

export type StreamProvider<T> = (cursor?: string, limit?: number, notify?: boolean) => Promise<Error | StreamPage<T>>;

export abstract class Stream<T> {
    pages: StreamPage<T>[] = [];
    itemsMap = new Map<string, T>();
    closed = false;
    timeoutId: any = undefined;

    constructor(readonly provider: StreamProvider<T>, public readonly pollNew = false, readonly pollInterval = 5000) {}

    isPolling = false;
    async poll() {
        if (this.isPolling) return;
        this.isPolling = true;

        try {
            // FIXME this will fail miserable if the client hasn't polled in say 24h, gets woken up
            // and starts polling from the top of the new posts. Could be hundreds of posts. Need to
            // employ the smart strategy of binary searching so we only pull in
            const newItems: T[] = [];
            let cursor: string | undefined;
            let startTimestamp = this.pages.length > 0 ? this.getItemDate(this.pages[0].items[0]).getTime() : new Date().getTime();
            while (true) {
                let fetchedItems = await this.provider(cursor, 20, false);
                if (fetchedItems instanceof Error) {
                    for (const listener of this.newItemslisteners) {
                        listener(fetchedItems);
                    }
                    throw fetchedItems;
                }

                const finalItems = fetchedItems.items.filter((item) => {
                    const key = this.getItemKey(item);
                    const dateMatch = this.getItemDate(item).getTime() > startTimestamp;
                    return !this.itemsMap.has(key) && dateMatch;
                });
                if (finalItems.length == 0) break;
                newItems.push(...finalItems);
                for (const item of finalItems) {
                    this.itemsMap.set(this.getItemKey(item), item);
                }
                cursor = fetchedItems.cursor;
            }

            if (newItems.length > 0) {
                const dependencies = await this.loadDependencies(newItems);
                if (dependencies instanceof Error) {
                    for (const listener of this.newItemslisteners) {
                        listener(dependencies);
                    }
                    return;
                }
                const newPage = { cursor, items: newItems };
                for (const listener of this.newItemslisteners) {
                    listener(newPage);
                }
                this.pages.unshift(newPage);
            }
        } catch (e) {
            error("Couldn't poll newer items", e);
        } finally {
            this.isPolling = false;
            if (!this.closed) {
                this.timeoutId = setTimeout(() => this.poll(), this.pollInterval);
            }
        }
    }

    abstract getItemKey(item: T): string;
    abstract getItemDate(item: T): Date;
    async loadDependencies(newItems: T[]): Promise<Error | void> {}

    newItemslisteners: ((newPage: Error | StreamPage<T>) => void)[] = [];
    addNewItemsListener(listener: (newPage: Error | StreamPage<T>) => void): void {
        this.newItemslisteners.push(listener);
        if (this.pollNew) {
            this.timeoutId = setTimeout(() => this.poll(), this.pollInterval);
        }
    }

    async next(): Promise<Error | StreamPage<T>> {
        try {
            if (this.closed) return { items: [] };
            const lastCursor = this.pages.length == 0 ? undefined : this.pages[this.pages.length - 1].cursor;
            const response = await this.provider(lastCursor);
            if (response instanceof Error) throw response;
            for (const item of response.items) {
                this.itemsMap.set(this.getItemKey(item), item);
            }
            if (!response.cursor && response.items.length > 0) this.close();
            const page = { cursor: response.cursor, items: response.items };
            if (page.items.length > 0) this.pages.push(page);
            return page;
        } catch (e) {
            return error("Could not load items", e);
        }
    }

    close(): void {
        this.closed = true;
        clearTimeout(this.timeoutId);
    }
}

export function memoryStreamProvider<T>(items: T[]): StreamProvider<T> {
    return async (cursor?: string, limit: number = 20, notify?: boolean) => {
        let index = !cursor ? 0 : Number.parseInt(cursor);
        if (index >= items.length) return { items: [] };
        const page = { cursor: (index + limit).toString(), items: items.slice(index, index + limit) } as StreamPage<T>;
        return page;
    };
}
