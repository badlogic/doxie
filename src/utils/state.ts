export type StateEvent = "updated" | "deleted";

const ANY_ID = Symbol("any id");
const SINGLETON = Symbol("singleton");

export class State<T extends Record<keyof T, any>> {
    private objects: Map<keyof T, Map<string | symbol, any>> = new Map();
    private listeners: Map<keyof T, Map<string | symbol, ((event: StateEvent, id: string | symbol, data?: any) => void)[]>> = new Map();

    subscribe<K extends keyof T>(
        objectType: K,
        listener: (event: StateEvent, id: string | symbol, data?: T[K]) => void,
        id: string | symbol = ANY_ID
    ): () => void {
        if (!this.listeners.has(objectType)) {
            this.listeners.set(objectType, new Map());
        }

        const objectTypeListeners = this.listeners.get(objectType)!;
        if (!objectTypeListeners.has(id)) {
            objectTypeListeners.set(id, []);
        }

        objectTypeListeners.get(id)!.push(listener as (event: StateEvent, id: string | symbol, data?: any) => void);
        return () => {
            const currentListeners = objectTypeListeners.get(id) || [];
            objectTypeListeners.set(
                id,
                currentListeners.filter((l) => l !== listener)
            );
        };
    }

    update<K extends keyof T>(objectType: K, data: T[K], id: string | symbol = SINGLETON): void {
        if (!this.objects.has(objectType)) {
            this.objects.set(objectType, new Map());
        }
        this.objects.get(objectType)!.set(id, data);

        this.notifyListeners(objectType, "updated", id, data);
    }

    delete<K extends keyof T>(objectType: K, id: string | symbol = SINGLETON): void {
        this.objects.get(objectType)?.delete(id);
        this.notifyListeners(objectType, "deleted", id);
    }

    get<K extends keyof T>(objectType: K, id: string | symbol): T[K] | undefined {
        return this.objects.get(objectType)?.get(id) as T[K] | undefined;
    }

    getAll<K extends keyof T>(objectType: K): Map<string | symbol, T[K]> | undefined {
        return this.objects.get(objectType) as Map<string | symbol, T[K]> | undefined;
    }

    private notifyListeners<K extends keyof T>(objectType: K, event: StateEvent, id: string | symbol, data?: any) {
        const objectTypeListeners = this.listeners.get(objectType);
        if (!objectTypeListeners) return;

        // Notify listeners interested in this specific id
        objectTypeListeners.get(id)?.forEach((listener) => listener(event, id, data));

        // Notify listeners interested in all updates/deletions for this objectType
        objectTypeListeners.get(ANY_ID)?.forEach((listener) => listener(event, id, data));
    }

    poll(fetcher: () => Promise<boolean>, interval = 5000) {
        const poller = async () => {
            if (!(await fetcher())) return;
            setTimeout(poller, interval);
        };
        poller();
    }
}
