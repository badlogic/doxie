import { html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { BaseElement, renderTopbar, closeButton, renderError } from "../app";
import { appState } from "../appstate";
import { Source, FaqSource, FlarumSource, Api, FaqSourceEntry, SitemapSource, MarkdownZipSource, apiPost } from "../common/api";
import { i18n } from "../utils/i18n";
import { router } from "../utils/routing";
import { Store } from "../utils/store";
import { pageContainerStyle, pageContentStyle } from "../utils/styles";
import { assertNever } from "../utils/utils";
import { repeat } from "lit-html/directives/repeat.js";
import { addIcon, deleteIcon } from "../utils/icons";
import { v4 as uuid } from "uuid";
import minimatch from "minimatch";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";

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
                const source: FaqSource = {
                    type: "faq",
                    collectionId,
                    name: "",
                    description: "",
                    faqs: [],
                };
                return source;
            }
            case "flarum": {
                const source: FlarumSource = {
                    type: "flarum",
                    collectionId,
                    name: "",
                    description: "",
                    apiUrl: "",
                    staff: [],
                };
                return source;
            }
            case "sitemap": {
                const source: SitemapSource = {
                    type: "sitemap",
                    collectionId,
                    name: "",
                    description: "",
                    url: "",
                    excluded: [],
                    included: [],
                    titlePath: "",
                    contentPaths: [],
                };
                return source;
            }
            case "markdownzip": {
                const source: MarkdownZipSource = {
                    type: "markdownzip",
                    collectionId,
                    name: "",
                    description: "",
                    file: "",
                };
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

    createSourceElement(source: Source) {
        const type = source.type;
        switch (type) {
            case "flarum":
                return html`<flarum-source .source=${this.source} .page=${this}></flarum-source>`;
            case "faq":
                return html`<faq-source .source=${this.source} .page=${this}></faq-source>`;
            case "sitemap":
                return html`<sitemap-source .source=${this.source} .page=${this}></sitemap-source>`;
            case "markdownzip":
                return html`<markdownzip-source .source=${this.source} .page=${this}></markdownzip-source>`;
            default:
                assertNever(type);
        }
    }

    getSourceElement(source: Source) {
        const type = source.type;
        switch (type) {
            case "flarum":
                return this.querySelector<FlarumSourceElement>("flarum-source");
            case "faq":
                return this.querySelector<FaqSourceElement>("faq-source");
            case "sitemap":
                return this.querySelector<SitemapSourceElement>("sitemap-source");
            case "markdownzip":
                return this.querySelector<MarkdownZipSourceElement>("markdownzip-source");
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
            <div class="${pageContentStyle} px-4 gap-4 mb-4">
                <source-panel .source=${source}></source-panel>
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1">${i18n("Name")}</span>
                <input
                    id="name"
                    class="textfield pt-2 ${source.name.length == 0 ? "border-red-500" : ""}"
                    .value=${source.name}
                    @input=${() => this.handleInput()}
                />
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1">${i18n("Description")}</span>
                <textarea
                    id="description"
                    class="textfield py-3 mb-4"
                    .value=${source.description}
                    rows="5"
                    @input=${() => this.handleInput()}
                ></textarea>
                ${this.createSourceElement(source)}
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
        if (source.name.trim().length < 3) return false;
        const sourceElement = this.getSourceElement(source);
        if (!sourceElement) return true;
        return sourceElement.canSave();
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

export abstract class BaseSourceElement extends BaseElement {
    @property()
    page?: SourcePage;

    abstract canSave(): boolean;

    getSourcePage(): SourcePage | undefined {
        let parent = this.parentElement;
        while (parent) {
            if (parent.tagName == "source-page") return parent as SourcePage;
            parent = parent.parentElement;
        }
        return undefined;
    }
}

@customElement("faq-source-entry")
export class FaqSourceEntryElement extends BaseElement {
    @property()
    entry?: FaqSourceEntry;

    render() {
        const entry = this.entry;
        if (!entry) {
            return renderError("Unknown entry");
        }

        return html`<div class="flex flex-col gap-2">
            <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("Questions")}</span>
            <textarea id="questions" class="textfield py-3" .value=${entry.questions} rows="2" @input=${() => this.handleInput()}></textarea>
            <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("Answer")}</span>
            <textarea id="answer" class="textfield py-3" .value=${entry.answer} rows="5" @input=${() => this.handleInput()}></textarea>
        </div>`;
    }

    handleInput() {
        if (!this.entry) return;
        const questions = this.querySelector<HTMLTextAreaElement>("#questions")!.value.trim();
        const answer = this.querySelector<HTMLTextAreaElement>("#answer")!.value.trim();

        this.entry.questions = questions;
        this.entry.answer = answer;
    }
}

@customElement("faq-source")
export class FaqSourceElement extends BaseSourceElement {
    @property()
    source?: FaqSource;

    render() {
        const source = this.source;
        if (!source) return renderError("Unknown source");
        return html`<div class="flex flex-col">
            <div class="flex items-center mb-4">
                <h2>${i18n("Entries")}</h2>
                <button class="ml-auto flex items-center gap-1" @click=${() => this.addEntry()}>
                    <i class="icon w-5 h-5">${addIcon}</i><span>${i18n("New")}</span>
                </button>
            </div>
            <div class="flex flex-col gap-4">
                ${repeat(
                    source.faqs,
                    (entry) => entry.id,
                    (entry) => html`<div class="border border-divider rounded-md p-4">
                        <button
                            class="ml-auto hover:text-primary w-6 h-6 flex items-center justify-center"
                            @click=${(ev: Event) => this.deleteEntry(entry)}
                        >
                            <i class="icon w-5 h-5">${deleteIcon}</i>
                        </button>
                        <faq-source-entry .entry=${entry}></faq-source-entry>
                    </div>`
                )}
            </div>
        </div>`;
    }

    addEntry() {
        this.source?.faqs.unshift({ id: uuid(), questions: "", answer: "", relatedUrls: [] });
        this.requestUpdate();
    }

    deleteEntry(entry: FaqSourceEntry) {
        if (!this.source) return;
        this.source.faqs = this.source.faqs.filter((other) => other != entry);
        this.requestUpdate();
    }

    canSave(): boolean {
        return true;
    }
}

@customElement("flarum-source")
export class FlarumSourceElement extends BaseSourceElement {
    @property()
    source?: FlarumSource;

    render() {
        const source = this.source;
        if (!source) return html``;

        return html` <div class="flex flex-col gap-2">
            <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("Flarum dump API URL")}</span>
            <input id="apiUrl" class="textfield py-2 ${source.apiUrl.length == 0 ? "border-red-500" : ""}" .value=${source.apiUrl} @input=${() =>
            this.handleInput()}></textarea>
            <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("Staff user names")}</span>
            <textarea id="staff" class="textfield py-2" .value=${source.staff.join("\n")} @input=${() => this.handleInput()}></textarea>
        </div>`;
    }

    handleInput() {
        if (!this.source) return;
        const apiUrl = this.querySelector<HTMLInputElement>("#apiUrl")!.value.trim();
        const staff = this.querySelector<HTMLTextAreaElement>("#staff")
            ?.value.trim()
            .split("\n")
            .map((staff) => staff.trim())
            .filter((staff) => staff.length > 0);
        this.source.apiUrl = apiUrl.trim();
        this.source.staff = staff ?? [];
        this.page?.requestUpdate();
        this.requestUpdate();
    }

    canSave(): boolean {
        if (!this.source) return false;
        return this.source.apiUrl.length > 0;
    }
}

@customElement("markdownzip-source")
export class MarkdownZipSourceElement extends BaseSourceElement {
    @property()
    source?: MarkdownZipSource;

    @state()
    error?: string;

    @state()
    isUploading = false;

    render() {
        const source = this.source;
        if (!source) return html``;

        if (this.isUploading)
            return html` <div class="flex flex-col gap-2">
                <span class="self-start text-xs text-muted-fg font-semibold bg-background z-[5] px-1">${i18n("Markdown ZIP file")}</span>
                <loading-spinner></loading-spinner>
            </div>`;

        return html` <div class="flex flex-col gap-2">
            <div class="text-muted-fg text-xs italic">${unsafeHTML(i18n("markdownZipFormat"))}</div>
            ${this.error ? renderError(this.error) : nothing}
            ${source.file.length != 0
                ? html`<span class="self-start text-xs text-muted-fg font-semibold bg-background z-[5] px-1">${i18n("Markdown ZIP file")}</span>
                      <div class="flex gap-2">
                          <a class="text-blue-500" target="_blank" href="/files/${source.file}">${source.file}</a>
                          <button
                              class="ml-auto hover:text-primary w-6 h-6 flex items-center justify-center"
                              @click=${(ev: Event) => this.deleteZip()}
                          >
                              <i class="icon w-5 h-5">${deleteIcon}</i>
                          </button>
                      </div>`
                : html` <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1"
                          >${i18n("Markdown ZIP file")}</span
                      >
                      <div
                          class="border border-divider border-dashed border-1 hover:border-primary cursor-pointer rounded-md text-center px-4 py-12"
                          @click=${() => this.uploadZip()}
                      >
                          ${i18n("Click or drag and drop .zip file containing .md files")}
                      </div>`}
        </div>`;
    }

    deleteZip() {
        if (!this.source) return;
        this.source.file = "";
        this.page?.requestUpdate();
        this.requestUpdate();
    }

    uploadZip() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".zip";

        input.onchange = async (e: Event) => {
            const target = e.target as HTMLInputElement;
            const file = target?.files ? target.files[0] : undefined;
            if (!file) {
                this.error = i18n("Could not upload .zip");
                return;
            }

            const formData = new FormData();
            formData.append("file", file);
            this.isUploading = true;
            try {
                const response = await apiPost<string>("upload", formData, Store.getAdminToken()!);
                if (response.success) {
                    this.source!.file = response.data;
                    this.page?.requestUpdate();
                    this.requestUpdate();
                } else {
                    this.error = i18n("Could not upload .zip");
                }
            } catch (error) {
                this.error = i18n("Could not upload .zip");
            } finally {
                this.isUploading = false;
            }
        };

        input.click();
    }

    canSave(): boolean {
        if (!this.source) return false;
        return true;
    }
}

@customElement("sitemap-source")
export class SitemapSourceElement extends BaseSourceElement {
    @property()
    source?: SitemapSource;

    @state()
    testUrls: string[] = [];

    render() {
        const source = this.source;
        if (!source) return html``;

        return html` <div class="flex flex-col gap-2">
            <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("sitemap.xml URL")}</span>
            <input id="url" class="textfield py-2 ${source.url.length == 0 ? "border-red-500" : ""}" .value=${source.url} @input=${() =>
            this.handleInput()}></textarea>
            <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("Included patterns")}</span>
            <textarea id="included" class="textfield py-2" .value=${source.included.join("\n")} @input=${() => this.handleInput()}></textarea>
            <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("Excluded patterns")}</span>
            <textarea id="excluded" class="textfield py-2" .value=${source.excluded.join("\n")} @input=${() => this.handleInput()}></textarea>
            <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("Title CSS selector")}</span>
            <input id="titlePath" class="textfield py-2 ${source.titlePath.length == 0 ? "border-red-500" : ""}" .value=${
            source.titlePath
        } @input=${() => this.handleInput()}></textarea>
            <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("Content CSS selectors")}</span>
            <textarea id="contentPaths" class="textfield py-2" .value=${source.contentPaths.join("\n")} @input=${() => this.handleInput()}></textarea>
            <button class="button self-start" @click=${() => this.test()}>${i18n("Test")}</button>
            ${
                // prettier-ignore
                this.testUrls.length > 0
                    ? html`<div class="debug hljs mt-0 p-4"><span class="text-blue-400">${this.testUrls.length + " " + i18n("URLs")}</span><br><pre><code>${this.testUrls.join("\n")}</code></pre></div>`
                    : nothing
            }
        </div>`;
    }

    handleInput() {
        if (!this.source) return;
        const url = this.querySelector<HTMLInputElement>("#url")!.value.trim();
        const included = this.querySelector<HTMLTextAreaElement>("#included")
            ?.value.trim()
            .split("\n")
            .map((url) => url.trim())
            .filter((url) => url.length > 0);
        const excluded = this.querySelector<HTMLTextAreaElement>("#excluded")
            ?.value.trim()
            .split("\n")
            .map((url) => url.trim())
            .filter((url) => url.length > 0);
        const titlePath = this.querySelector<HTMLInputElement>("#titlePath")!.value.trim();
        const contentPaths = this.querySelector<HTMLTextAreaElement>("#contentPaths")
            ?.value.trim()
            .split("\n")
            .map((url) => url.trim())
            .filter((url) => url.length > 0);
        this.source.url = url.trim();
        this.source.included = included ?? [];
        this.source.excluded = excluded ?? [];
        this.source.titlePath = titlePath;
        this.source.contentPaths = contentPaths ?? [];
        this.page?.requestUpdate();
        this.requestUpdate();
    }

    canSave(): boolean {
        if (!this.source) return false;
        return this.source.url.length > 0 && this.source.titlePath.length > 0;
    }

    async test() {
        if (!this.source) return;
        this.testUrls.length = 0;
        const html = await Api.html(this.source.url);
        if (!html) return;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(html, "text/xml");
        const locElements = xmlDoc.getElementsByTagName("loc");

        const included = this.source.included;
        const excluded = this.source.excluded;
        for (let i = 0; i < locElements.length; i++) {
            const url = locElements[i].textContent;

            if (url) {
                const isIncluded = included.length === 0 || included.some((pattern) => minimatch(url, pattern));
                const isNotExcluded = excluded.length === 0 || !excluded.some((pattern) => minimatch(url, pattern));

                if (isIncluded && isNotExcluded) {
                    this.testUrls.push(url);
                }
            }
        }
        this.requestUpdate();
    }
}
