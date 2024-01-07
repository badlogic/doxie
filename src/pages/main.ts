import { LitElement, PropertyValueMap, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { Api } from "../common/api.js";
import { BaseElement, renderError } from "../app.js";
import { i18n } from "../utils/i18n.js";
import { router } from "../utils/routing.js";
import { pageContainerStyle, pageContentStyle } from "../utils/styles.js";
import { EmbedderDocument } from "../common/api.js";
import { map } from "lit/directives/map.js";

@customElement("main-page")
export class MainPage extends BaseElement {
    render() {
        return html`<div class="${pageContainerStyle}">
            <div class="${pageContentStyle} gap-2 p-4">
                <h1 class="mt-8 text-center">Doxie</h1>
                <a href="/embeddings">Embeddings</a>
                <a href="/chat">Chat</a>
            </div>
        </div>`;
    }
}
