import { LitElement, html, nothing, render } from "lit";
import { BaseElement, closeButton, dom, renderError, renderTopbar } from "../app.js";
import { customElement, property, state } from "lit/decorators.js";
import { pageContainerStyle, pageContentStyle } from "../utils/styles.js";
import { Store } from "../utils/store.js";
import { i18n } from "../utils/i18n.js";
import { Api, Collection, FaqSource, FlarumSource, Source } from "../common/api.js";
import { addIcon, deleteIcon, plusIcon } from "../utils/icons.js";
import { router } from "../utils/routing.js";
import { appState } from "../appstate.js";
import { map } from "lit/directives/map.js";
import { assertNever } from "../utils/utils.js";

@customElement("collection-page")
export class CollectionPage extends BaseElement {
    @state()
    isLoading = true;

    @state()
    error?: string;

    @state()
    collection: Collection = { name: "", description: "", systemPrompt: "You are a helpful assistant" };

    @state()
    sources: Source[] = [];

    isNew = false;

    constructor() {
        super();
        const adminToken = Store.getAdminToken();
        if (!adminToken) router.popAll("/");
        const id = router.getCurrentParams()?.get("id");
        if (id == "new") {
            this.isNew = true;
            this.isLoading = false;
        } else {
            if (adminToken && id) {
                this.getCollection(adminToken, id);
            }
        }

        appState.subscribe("source", () => {
            const id = router.getCurrentParams()?.get("id");
            const adminToken = Store.getAdminToken();
            if (adminToken && id) {
                this.getCollection(adminToken, id);
            }
        });
    }

    async getCollection(adminToken: string, id: string) {
        this.isLoading = true;
        try {
            const collections = await Api.getCollection(adminToken, id);
            if (!collections.success) {
                this.error = i18n("Could not load collection");
            } else {
                this.collection = collections.data;
            }
            const sources = await Api.getSources(adminToken, id);
            if (!sources.success) {
                this.error = i18n("Could not load collection");
            } else {
                this.sources = sources.data;
            }
        } catch (e) {
            console.error(e);
            this.error = i18n("Could not load collection");
        } finally {
            this.isLoading = false;
        }
    }

    render() {
        if (this.isLoading) {
            return html`<div class="${pageContainerStyle}">
                ${renderTopbar(i18n("Collection"), closeButton())}
                <div class="${pageContentStyle} px-4 items-center justify-center gap-4">
                    <span>${i18n("Loading ...")}</span>
                    <loading-spinner></loading-spinner>
                </div>
            </div>`;
        }

        if (this.error) {
            return html`<div class="${pageContainerStyle}">
                ${renderTopbar(i18n("Collection"), closeButton())}
                <div class="${pageContentStyle} px-4 items-center justify-center gap-4">
                    <div class="w-full max-w-[320px]">${this.error ? renderError(this.error) : nothing}</div>
                </div>
            </div>`;
        }
        const collection = this.collection;
        const sources = this.sources;
        const topBar = renderTopbar(
            i18n("Collection"),
            closeButton(),
            html`<button id="save" class="ml-auto button" ?disabled=${!this.canSave(collection)} @click=${() => this.save()}>${i18n("Save")}</button>`
        );
        return html`<div class="${pageContainerStyle}">
            ${topBar}
            <div class="${pageContentStyle} px-4 gap-2">
                <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("Name")}</span>
                <input
                    id="name"
                    class="textfield pt-2 ${collection.name.length == 0 ? "border-red-500" : ""}"
                    .value=${collection.name}
                    @input=${() => this.handleInput()}
                />
                <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 b g-background z-[5] px-1">${i18n("Description")}</span>
                <textarea
                    id="description"
                    class="textfield py-3"
                    .value=${collection.description}
                    rows="5"
                    @input=${() => this.handleInput()}
                ></textarea>
                <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("System prompt")}</span>
                <textarea
                    id="systemPrompt"
                    class="textfield py-3"
                    .value=${collection.systemPrompt}
                    rows="5"
                    @input=${() => this.handleInput()}
                ></textarea>
                ${!this.isNew
                    ? html` <div class="flex items-center">
                              <h2>${i18n("Sources")}</h2>
                              <dropdown-button
                                  button
                                  class="ml-auto self-start"
                                  .content=${html`<div class="flex items-center hover:text-primary gap-1">
                                      <i class="icon w-5 h-5">${addIcon}</i><span>${i18n("New")}</span>
                                  </div>`}
                                  .values=${[
                                      { label: "Flarum", value: "flarum" },
                                      { label: "FAQ", value: "faq" },
                                  ]}
                                  .onSelected=${(sourceType: { value: string; label: string }) => this.addSource(sourceType)}
                              >
                              </dropdown-button>
                          </div>
                          <div class="flex flex-col gap-4 mb-4">
                              ${map(
                                  sources,
                                  (source) => html`<a href="/sources/${encodeURIComponent(
                                      collection._id ?? ""
                                  )}" class="px-4 py-2 flex flex-col gap-2 border border-divider rounded-md underline-none hover:border-primary">
                            <div class="flex">
                                <span class="font-semibold">${source.name}</span>
                                <span class="ml-2 border border-divider border-md rounded-md px-1">${source.type}</span>
                                <button class="ml-auto hover:text-primary" @click=${(ev: Event) =>
                                    this.deleteSource(ev, source)}><i class="icon w-5 h-5">${deleteIcon}</i></button>
                            </div>
                            <div class="line-clamp-2">${source.description}</div>
                        </div>`
                              )}
                          </div>`
                    : nothing}
            </div>
        </div>`;
    }

    handleInput() {
        const name = this.querySelector<HTMLInputElement>("#name")!.value.trim();
        const description = this.querySelector<HTMLTextAreaElement>("#description")!.value.trim();
        const systemPrompt = this.querySelector<HTMLTextAreaElement>("#systemPrompt")!.value.trim();

        const collection = this.collection;
        collection.name = name;
        collection.description = description;
        collection.systemPrompt = systemPrompt;
        this.collection = { ...collection };
        this.requestUpdate();
    }

    canSave(collection?: Collection) {
        if (!collection) return false;
        return collection.name.trim().length >= 3;
    }

    addSource(sourceType: { label: string; value: string }) {
        router.push(`/sources/${this.collection._id}/${sourceType.value}`);
    }

    async deleteSource(ev: Event, source: Source) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!confirm(i18n("Are you sure you want to delete source")(source.name))) {
            return;
        }
        const result = await Api.deleteSource(Store.getAdminToken()!, source._id!);
        if (!result.success) {
            this.error = i18n("Could not delete source ")(source.name);
        } else {
            this.sources = this.sources?.filter((other) => other._id != source._id);
        }
        this.requestUpdate();
    }

    async save() {
        const result = await Api.setCollection(Store.getAdminToken()!, this.collection);
        if (!result.success) {
            if (result.error == "Duplicate collection name") {
                this.error = i18n("Collection with this name already exists");
            } else {
                this.error = i18n("Could not save collection");
                this.requestUpdate();
            }
        } else {
            this.collection = result.data;
            appState.update("collection", this.collection, this.collection._id);
            if (this.isNew) {
                router.replace("/collections/" + this.collection._id);
            }
        }
    }
}

@customElement("source-page")
export class SourcePage extends BaseElement {
    @property()
    source?: Source;

    @state()
    isLoading = true;

    @state()
    error?: string;

    isNew = false;

    constructor() {
        super();
        const adminToken = Store.getAdminToken();
        if (!adminToken) router.popAll("/");
        const id = router.getCurrentParams()?.get("id");
        const type = router.getCurrentParams()?.get("type");

        if (!id) {
            this.error = i18n("Could not load source");
            return;
        }

        if (type) {
            this.isNew = true;
            this.isLoading = false;
            this.source = this.createNewSource(id, type as Source["type"]);
        } else {
            if (adminToken && id) {
                this.getSource(adminToken, id);
            }
        }
    }

    createNewSource(collectionId: string, type: Source["type"]) {
        switch (type) {
            case "faq": {
                const source: FaqSource = { type: "faq", collectionId, name: "", description: "", faqs: [] };
                return source;
            }
            case "flarum": {
                const source: FlarumSource = { type: "flarum", collectionId, name: "", description: "", apiUrl: "", staff: [] };
                return source;
            }
            default:
                assertNever(type);
        }
    }

    async getSource(adminToken: string, id: string) {
        this.isLoading = true;
        try {
            const source = await Api.getSource(adminToken, id);
            if (!source.success) {
                this.error = i18n("Could not load source");
            } else {
                this.source = source.data;
            }
        } catch (e) {
            console.error(e);
            this.error = i18n("Could not load source");
        } finally {
            this.isLoading = false;
        }
    }

    getSourceElement(source: Source) {
        const type = source.type;
        switch (type) {
            case "flarum":
                return html`<flarum-source .source=${this.source}></flarum-source>`;
            case "faq":
                return html`<faq-source .source=${this.source}></faq-source>`;
            default:
                assertNever(type);
        }
    }

    render() {
        const source = this.source;
        if (!source) {
            return html`<div class="${pageContainerStyle}">
                ${renderTopbar(i18n("Source"), closeButton())}
                <div class="${pageContentStyle} px-4 gap-2"></div>
            </div>`;
        }

        const topBar = renderTopbar(
            i18n("Source"),
            closeButton(),
            html`<button id="save" class="ml-auto button" ?disabled=${!this.canSave(source)} @click=${() => this.save()}>${i18n("Save")}</button>`
        );
        return html`<div class="${pageContainerStyle}">
            ${topBar}
            <div class="${pageContentStyle} px-4 gap-2">
                <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("Name")}</span>
                <input
                    id="name"
                    class="textfield pt-2 ${source.name.length == 0 ? "border-red-500" : ""}"
                    .value=${source.name}
                    @input=${() => this.handleInput()}
                />
                <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("Description")}</span>
                <textarea id="description" class="textfield py-3" .value=${source.description} rows="5" @input=${() => this.handleInput()}></textarea>
                ${this.getSourceElement(source)}
            </div>
        </div>`;
    }

    handleInput() {
        const name = this.querySelector<HTMLInputElement>("#name")!.value.trim();
        const description = this.querySelector<HTMLTextAreaElement>("#description")!.value.trim();

        const source = this.source;
        if (!source) return;
        source.name = name;
        source.description = description;
        this.source = { ...source };
        this.requestUpdate();
    }

    canSave(source?: Source) {
        if (!source) return false;
        return source.name.trim().length >= 3;
    }

    async save() {
        if (!this.source) return;
        const result = await Api.setSource(Store.getAdminToken()!, this.source);
        if (!result.success) {
            if (result.error == "Duplicate source name") {
                this.error = i18n("Source with this name already exists");
            } else {
                this.error = i18n("Could not save collection");
                this.requestUpdate();
            }
        } else {
            this.source = result.data;
            appState.update("source", this.source, this.source._id);
            if (this.isNew) {
                router.replace("/sources/" + this.source._id);
            }
        }
    }
}

@customElement("faq-source")
export class FaqSourceElement extends BaseElement {
    render() {
        return html`<div>Faq source</div>`;
    }
}

@customElement("flarum-source")
export class FlarumSourceElement extends BaseElement {
    render() {
        return html`<div>Flarum source</div>`;
    }
}
