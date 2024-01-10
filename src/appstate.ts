import { Collection, Source } from "./common/api";
import { State } from "./utils/state";

interface AppStateObjects {
    collection: Collection;
    source: Source;
}

export const appState = new State<AppStateObjects>();
