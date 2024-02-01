import { Bot, Source } from "./common/api";
import { State } from "./utils/state";

interface AppStateObjects {
    bot: Bot;
    source: Source;
}

export const appState = new State<AppStateObjects>();
