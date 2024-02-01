import { TemplateResult, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseElement, closeButton, dom, renderError, renderTopbar } from "../app";
import { i18n } from "../utils/i18n";
import { pageContainerStyle, pageContentStyle } from "../utils/styles";
import { Api, Source, VectorDocument } from "../common/api";
import { Store } from "../utils/store";
import { router } from "../utils/routing";
import { Stream } from "../utils/streams";
import { StreamView } from "../utils/streamviews";

class VectorDocumentStream extends Stream<VectorDocument> {
    getItemKey(item: VectorDocument): string {
        return item.docUri + item.index;
    }
    getItemDate(item: VectorDocument): Date {
        return new Date();
    }
}

@customElement("vector-document-stream")
class VectorDocumentStreamView extends StreamView<VectorDocument> {
    constructor() {
        super();
        this.wrapItem = false;
    }

    renderItem(item: VectorDocument, polledItems: boolean): TemplateResult {
        return html`<div class="w-full flex flex-col p-4 border-b border-divider gap-2">
            <span class="line-clamp-1">${item.docTitle}</span>
            <span class="text-green-400">${item.tokenCount} ${i18n("tokens")}</span>
            <div id="logs" class="debug hljs p-4 whitespace-pre-wrap max-h-80">${item.text}</div>
        </div>`;
    }
}

@customElement("documents-page")
export class DocumentsPage extends BaseElement {
    @state()
    isLoading = true;

    @state()
    source?: Source;

    @state()
    error?: string;

    @state()
    query?: string;

    connectedCallback(): void {
        super.connectedCallback();
        this.load();
    }

    async load() {
        try {
            const sourceId = router.getCurrentParams()!.get("id")!;
            const source = await Api.getSource(Store.getAdminToken()!, sourceId);
            if (!source.success) {
                this.error = i18n("Could not load source documents");
            } else {
                this.source = source.data;
            }
        } catch (e) {
            this.error = i18n("Could not load source documents");
        } finally {
            this.isLoading = false;
        }
    }

    render() {
        if (this.isLoading) {
            return html`<div class="${pageContainerStyle}">
                ${renderTopbar(i18n("Docs"), closeButton())}
                <div class="${pageContentStyle} px-4 items-center justify-center gap-4">
                    <span>${i18n("Loading ...")}</span>
                    <loading-spinner></loading-spinner>
                </div>
            </div>`;
        }

        if (!this.source || this.error) {
            return html`<div class="${pageContainerStyle}">
                ${renderTopbar(i18n("Docs"), closeButton())}
                <div class="${pageContentStyle} px-4 items-center justify-center gap-4">
                    ${renderError(this.error ?? i18n("Could not load source documents"))}
                </div>
            </div>`;
        }

        const stream =
            this.query && this.query.trim().length > 0
                ? new VectorDocumentStream(async (cursor?: string) => {
                      if (cursor) return { items: [] };
                      const k = parseInt(this.querySelector<HTMLInputElement>("#top")!.value);
                      const resp = await Api.queryDocuments(Store.getAdminToken()!, this.source?._id!, this.query!, k);
                      if (!resp.success) {
                          return { items: [] };
                      } else {
                          return { cursor: cursor ? (parseInt(cursor) + 25).toString() : "25", items: resp.data };
                      }
                  })
                : new VectorDocumentStream(async (cursor?: string) => {
                      const resp = await Api.getDocuments(Store.getAdminToken()!, this.source?._id!, cursor ? parseInt(cursor) : 0, 25);
                      if (!resp.success) {
                          return { items: [] };
                      } else {
                          return { cursor: cursor ? (parseInt(cursor) + 25).toString() : "25", items: resp.data };
                      }
                  });
        const streamView = dom(html`<vector-document-stream .stream=${stream}></vector-document-stream>`)[0];
        const queryUrl = `/api/documents/${this.source._id}/query`;
        return html`<div class="${pageContainerStyle}">
            ${renderTopbar(i18n("Docs"), closeButton())}
            <div class="${pageContentStyle} items-center justify-center gap-4">
                <span>${i18n("Source")} ${this.source.name}</span>
                <span>${i18n("Query URL")}</span>
                <a href="${queryUrl}">${queryUrl}</a>
                <div class="px-4 w-full flex flex-col gap-2 border-b border-divider pb-4">
                    <input
                        id="search"
                        class="w-full search bg-transparent"
                        placeholder="${i18n("Search query ...")}"
                        @input=${() => this.handleInput()}
                    />
                    <div class="flex gap-2 items-center justify-center">
                        <span>${i18n("Top")}</span
                        ><input class="textfield text-center" id="top" type="number" min="1" max="50" value="5" @input=${() => this.handleInput()} />
                    </div>
                </div>
                ${streamView}
            </div>
        </div>`;
    }

    timeoutId: any = -1;
    handleInput() {
        clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(async () => {
            this.query = this.querySelector<HTMLInputElement>("#search")!.value.trim();
            this.requestUpdate();
        }, 200) as any as number;
    }
}
