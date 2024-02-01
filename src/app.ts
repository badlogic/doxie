import { LitElement, PropertyValueMap, html } from "lit";
import { customElement } from "lit/decorators.js";
import { i18n } from "./utils/i18n.js";
import { setupLiveReload } from "./utils/live-reload.js";
import { renderError } from "./utils/ui-components.js";
import { router } from "./utils/routing.js";
export * from "./elements/index.js";
export * from "./pages/index.js";
export * from "./utils/ui-components.js";

setupLiveReload();

@customElement("app-main")
export class App extends LitElement {
    constructor() {
        super();
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);

        router.addIgnoredPath("/files/:name");

        router.addRoute(
            "/",
            () => html`<main-page></main-page>`,
            () => "app"
        );
        router.addRoute(
            "/404",
            () => renderError(i18n("Whoops, that page doesn't exist")),
            () => "404"
        );
        router.addRoute(
            "/settings",
            () => html`<settings-page></settings-page>`,
            () => "Settings"
        );
        router.addRoute(
            "/chat/:bot",
            () => html`<chat-page></chat-page>`,
            () => "Chat"
        );
        router.addRoute(
            "/chat/:bot/:source",
            () => html`<chat-page></chat-page>`,
            () => "Chat"
        );
        router.addRoute(
            "/replay/:chatsession",
            () => html`<chat-page></chat-page>`,
            () => "Chat Replay"
        );
        router.addRoute(
            "/admin",
            () => html`<admin-page></admin-page>`,
            () => "Admin"
        );

        router.addRoute(
            "/bots/:id",
            () => html`<bot-page></bot-page>`,
            () => i18n("Bot")
        );

        router.addRoute(
            "/sources/:id",
            () => html`<source-page></source-page>`,
            () => i18n("Source")
        );

        router.addRoute(
            "/sources/new/:type",
            () => html`<source-page></source-page>`,
            () => i18n("Source")
        );

        router.addRoute(
            "/documents/:id",
            () => html`<documents-page></documents-page>`,
            () => i18n("Docs")
        );

        router.setRootRoute("/");
        router.setNotFoundRoot("/404");
        router.replace(location.pathname);
    }
}
