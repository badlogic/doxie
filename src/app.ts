import { LitElement, PropertyValueMap, html } from "lit";
import { customElement } from "lit/decorators.js";
import { i18n } from "./utils/i18n.js";
import { setupLiveReload } from "./utils/live-reload.js";
import { renderError } from "./utils/ui-components.js";
import { router } from "./utils/routing.js";
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

        router.setRootRoute("/");
        router.setNotFoundRoot("/404");
        router.replace(location.pathname);
    }
}
