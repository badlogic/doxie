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
            "/chat",
            () => html`<chat-page></chat-page>`,
            () => "Chat"
        );
        router.addRoute(
            "/chat/:collection",
            () => html`<chat-page></chat-page>`,
            () => "Chat"
        );
        router.addRoute(
            "/admin",
            () => html`<admin-page></admin-page>`,
            () => "Admin"
        );

        router.addRoute(
            "/collections/:id",
            () => html`<collection-page></collection-page>`,
            () => "Collection"
        );

        router.addRoute(
            "/sources/:id",
            () => html`<source-page></source-page>`,
            () => "Source"
        );

        router.addRoute(
            "/sources/:id/:type",
            () => html`<source-page></source-page>`,
            () => "Source"
        );

        router.setRootRoute("/");
        router.setNotFoundRoot("/404");
        router.replace(location.pathname);
    }
}
