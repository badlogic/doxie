import { html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseElement } from "../app.js";
import { Store } from "../utils/store.js";
import { pageContainerStyle, pageContentStyle } from "../utils/styles.js";
import { i18n } from "../utils/i18n.js";
import { Api, Collection } from "../common/api.js";
import { map } from "lit/directives/map.js";

@customElement("main-page")
export class MainPage extends BaseElement {
    @state()
    isLoading = true;

    @state()
    collections?: Collection[];

    @state()
    error?: string;

    connectedCallback(): void {
        super.connectedCallback();
        this.load();
    }

    async load() {
        try {
            const collections = await Api.getCollections("noauth");
            if (!collections.success) {
                this.error = i18n("Could not load collections");
                return;
            }
            this.collections = collections.data;
        } catch (e) {
            this.error = i18n("Could not load collections");
        } finally {
            this.isLoading = false;
        }
    }

    render() {
        if (this.isLoading) {
            return html`<div class="${pageContainerStyle}">
                <div class="${pageContentStyle} gap-2 p-4">
                    ${Store.getAdminToken() ? html`<a href="/admin" class="ml-auto underline">Admin</a>` : nothing}
                    <h1 class="text-center animate-fade">Doxie</h1>
                    <text-typer class="text-center text-xs mb-4" .text=${i18n("Chat with your documents, websites, ...")}></text-typer>
                    <span class="text-center">${i18n("Loading ...")}</span>
                    <loading-spinner></loading-spinner>
                </div>
            </div>`;
        }

        if (!this.collections) {
            this.error = i18n("Could not load collections");
        }

        if (this.error) {
            return html`<div class="${pageContainerStyle}">
                <div class="${pageContentStyle} gap-2 p-4">
                    ${Store.getAdminToken() ? html`<a href="/admin" class="ml-auto underline">Admin</a>` : nothing}
                    <h1 class="text-center animate-fade">Doxie</h1>
                    <text-typer class="text-center text-xs mb-4" .text=${i18n("Chat with your documents, websites, ...")}></text-typer>
                    <span class="text-center">${i18n("Loading ...")}</span>
                    <loading-spinner></loading-spinner>
                </div>
            </div>`;
        }

        return html`<div class="${pageContainerStyle}">
            <div class="${pageContentStyle} gap-2 p-4">
                ${Store.getAdminToken() ? html`<a href="/admin" class="ml-auto underline">Admin</a>` : nothing}
                <div class="w-full flex flex-col items-center justify-center">
                    <h1 class="text-center animate-fade">Doxie</h1>
                    <text-typer class="text-center text-xs mb-12" .text=${i18n("Chat with your documents, websites, ...")}></text-typer>
                    ${map(
                        this.collections,
                        (col) => html`<a href="/chat/${col._id}" class="mb-4 p-2 hover:text-primary">${i18n("Chat with ") + col.name}</a>`
                    )}
                </div>
            </div>
        </div>`;
    }
}
