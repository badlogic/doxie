import { LitElement, PropertyValueMap, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { Api } from "../common/api.js";
import { BaseElement, renderError } from "../app.js";
import { i18n } from "../utils/i18n.js";
import { router } from "../utils/routing.js";
import { pageContainerStyle, pageContentStyle } from "../utils/styles.js";
import { EmbedderDocument } from "../common/api.js";
import { map } from "lit/directives/map.js";

@customElement("embeddings-page")
export class EmbeddingsPage extends BaseElement {
    @property()
    isLoading = false;

    @property()
    tokens?: number[];
    query = "";

    @property()
    queryResult?: { score: number; doc: EmbedderDocument }[];

    @property()
    error?: string;

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.tokenize();
    }

    render() {
        return html`<div class="${pageContainerStyle}">
            <div class="${pageContentStyle} gap-2 p-4">
                <h1>Playground</h1>
                ${this.error ? renderError(this.error) : nothing}
                <div class="flex flex-col gap-1">
                    <textarea
                        id="text"
                        class="textfield w-full min-h-24 rounded-r-none"
                        @input=${() => this.tokenize()}
                        placehoder="Enter your query"
                    ></textarea>
                </div>
                <div class="flex items-center">
                    ${this.tokens
                        ? html`<div class="text-xs text-muted-fg self-start">${this.tokens.length} tokens, ${this.query.length} characters</div>`
                        : nothing}
                    ${this.isLoading ? html`<loading-spinner class="self-center"></loading-spinner>` : nothing}
                    <button class="button text-sm ml-auto" @click=${() => this.vectorQuery()}>Query</button>
                </div>
                <span class="text-xs text-muted-fg">Embedding</span>
                <div class="flex flex-col w-full border border-divider rounded-md p-4 overflow-auto">
                    ${this.queryResult
                        ? map(
                              this.queryResult,
                              (doc) =>
                                  html`<div class="border-b border-divider flex flex-col">
                                      <span class="text-lg">${doc.doc.title}</span>
                                      <div class="whitespace-pre-wrap">${doc.doc.segments.map((seg) => seg.text).join("")}</div>
                                  </div>`
                          )
                        : nothing}
                </div>
            </div>
        </div>`;
    }

    async tokenize() {
        this.error = undefined;
        this.query = this.querySelector<HTMLInputElement>("#text")!.value.trim();
        if (this.query.length == 0) {
            this.tokens = [];
            return;
        }

        const result = await Api.tokenize(this.query);
        if (!result.success) {
            this.error = "Couldn't tokenize text: " + result.error;
        } else {
            this.tokens = result.data;
        }
    }

    async vectorQuery() {
        this.error = undefined;
        this.query = this.querySelector<HTMLInputElement>("#text")!.value.trim();
        if (this.query.length == 0) {
            this.error = "Can't query with an empty string";
            return;
        }

        this.isLoading = true;
        try {
            const result = await Api.vectorQuery(this.query);
            if (!result.success) {
                this.error = "Couldn't embed text: " + result.error;
            } else {
                this.queryResult = result.data;
            }
        } catch (e) {
        } finally {
            this.isLoading = false;
        }
    }
}
