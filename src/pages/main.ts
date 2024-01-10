import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { BaseElement } from "../app.js";
import { Store } from "../utils/store.js";
import { pageContainerStyle, pageContentStyle } from "../utils/styles.js";

@customElement("main-page")
export class MainPage extends BaseElement {
    render() {
        return html`<div class="${pageContainerStyle}">
            <div class="${pageContentStyle} gap-2 p-4">
                ${Store.getAdminToken() ? html`<a href="/admin" class="ml-auto underline">Admin</a>` : nothing}
                <h1 class="text-center">Doxie</h1>
                <a href="/chat/berufslexikon">Chat with AMS Berufslexikon</a>
                <a href="/chat/spine">Chat with Spine Documentation & Blog</a>
            </div>
        </div>`;
    }
}
