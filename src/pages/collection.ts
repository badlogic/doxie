import { TemplateResult, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { BaseElement, chatDefaultCss, closeButton, dom, downloadJson, renderError, renderTopbar, toast, uploadJson } from "../app.js";
import { appState } from "../appstate.js";
import { Api, ChatSession, Collection, ProcessingJob, Source, VectorDocument, apiPost } from "../common/api.js";
import { i18n } from "../utils/i18n.js";
import { addIcon, deleteIcon, downloadIcon } from "../utils/icons.js";
import { router } from "../utils/routing.js";
import { Store } from "../utils/store.js";
import { pageContainerStyle, pageContentStyle } from "../utils/styles.js";
import { repeat } from "lit-html/directives/repeat.js";
import { Stream } from "../utils/streams.js";
import { StreamView } from "../utils/streamviews.js";

@customElement("collection-page")
export class CollectionPage extends BaseElement {
    @state()
    isLoading = true;

    @state()
    error?: string;

    @state()
    collection: Collection = { name: "", description: "", systemPrompt: "You are a helpful assistant", botName: "Doxie" };

    @state()
    sources: Source[] = [];

    @state()
    jobs: Map<string, ProcessingJob> = new Map();

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
                this.getData(adminToken, id);
            }
        }

        appState.subscribe("source", () => {
            if (adminToken && id) {
                this.getData(adminToken, id);
            }
        });
    }

    async getData(adminToken: string, id: string) {
        this.isLoading = true;
        try {
            const collections = await Api.getCollection(adminToken, id);
            if (!collections.success) {
                this.error = i18n("Could not load collection");
                return;
            } else {
                this.collection = collections.data;
            }
            const sources = await Api.getSources(adminToken, id);
            if (!sources.success) {
                this.error = i18n("Could not load collection");
                return;
            } else {
                this.sources = sources.data;
            }
            await this.getJobs(adminToken);
        } catch (e) {
            console.error(e);
            this.error = i18n("Could not load collection");
        } finally {
            this.isLoading = false;
        }
    }

    timeoutId: any = -1;
    connectedCallback(): void {
        super.connectedCallback();
        const updateJobs = () => {
            this.getJobs(Store.getAdminToken()!);
            this.timeoutId = setTimeout(updateJobs, 2000);
        };
        updateJobs();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        clearTimeout(this.timeoutId);
    }

    async getJobs(adminToken: string) {
        if (!adminToken) return;
        for (const source of this.sources) {
            const jobs = await Api.getJob(adminToken, source._id!);
            if (!jobs.success) {
                this.error = i18n("Could not load collection");
            } else {
                if (jobs.data) this.jobs.set(source._id!, jobs.data);
            }
            this.requestUpdate();
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
            <div class="${pageContentStyle} px-4 gap-4">
                <a href="/chat/${collection._id!}" class="button self-start">${i18n("Chat")}</a>
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1">${i18n("Name")}</span>
                <input
                    id="name"
                    class="textfield pt-2 ${collection.name.length == 0 ? "border-red-500" : ""}"
                    .value=${collection.name}
                    @input=${() => this.handleInput()}
                />
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1">${i18n("Description")}</span>
                <textarea
                    id="description"
                    class="textfield py-3"
                    .value=${collection.description}
                    rows="5"
                    @input=${() => this.handleInput()}
                ></textarea>
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1">${i18n("System prompt")}</span>
                <textarea
                    id="systemPrompt"
                    class="textfield py-3"
                    .value=${collection.systemPrompt}
                    rows="5"
                    @input=${() => this.handleInput()}
                ></textarea>
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1">${i18n("Chatbot name")}</span>
                <input
                    id="botName"
                    class="textfield pt-2 ${collection.name.length == 0 ? "border-red-500" : ""}"
                    .value=${collection.botName ?? "Doxie"}
                    @input=${() => this.handleInput()}
                />
                <span class="self-start text-xs text-muted-fg font-semibold bg-background z-[5] px-1">${i18n("Chatbot icon (128x128)")}</span>
                ${this.collection.botIcon
                    ? html` <img
                          class="h-12 w-12 border border-divider rounded-full cursor-pointer"
                          src="/files/${this.collection.botIcon}"
                          @click=${() => this.uploadImage()}
                      />`
                    : html`<div
                          class="cursor-pointer flex-shrink-0 w-12 h-12 rounded-full dark:border dark:border-muted-fg flex items-center justify-center text-white text-lg"
                          style="background-color: #ab68ff;"
                          @click=${() => this.uploadImage()}
                      >
                          <span>${(this.collection.botName ?? "Doxie").charAt(0).toUpperCase()}</span>
                      </div>`}
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1"
                    >${i18n("Chatbot welcome message")}</span
                >
                <textarea
                    id="botWelcome"
                    class="textfield py-3"
                    .value=${collection.botWelcome ?? "How can I assist you today?"}
                    rows="3"
                    @input=${() => this.handleInput()}
                ></textarea>
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1"
                    >${i18n("Chatbot footer (HTML)")}</span
                >
                <textarea
                    id="botFooter"
                    class="textfield py-3"
                    .value=${collection.botFooter ?? ""}
                    rows="3"
                    @input=${() => this.handleInput()}
                ></textarea>
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1">${i18n("Chatbot CSS")}</span>
                <textarea
                    id="botCss"
                    class="textfield py-3"
                    .value=${collection.botCss ?? chatDefaultCss.trim()}
                    rows="10"
                    @keydown=${(ev: KeyboardEvent) => this.handleTab(ev)}
                    @input=${() => this.handleInput()}
                ></textarea>
                ${!this.isNew
                    ? html` <div class="flex items-center mt-4 items-center gap-2">
                              <h2>${i18n("Sources")}</h2>
                              <button class="ml-auto hover:text-primary flex items-center gap-1" @click=${(ev: Event) => this.import(ev)}>
                                  <i class="icon w-5 h-5">${downloadIcon}</i><span>${i18n("Import")}</span>
                              </button>
                              <dropdown-button
                                  button
                                  class=""
                                  .content=${html`<div class="flex items-center hover:text-primary gap-1">
                                      <i class="icon w-5 h-5">${addIcon}</i><span>${i18n("New")}</span>
                                  </div>`}
                                  .values=${[
                                      { label: "FAQ", value: "faq" },
                                      { label: "Sitemap", value: "sitemap" },
                                      { label: "Markdown ZIP", value: "markdownzip" },
                                      { label: "Flarum dump", value: "flarum" },
                                  ]}
                                  .onSelected=${(sourceType: { value: string; label: string }) => this.addSource(sourceType)}
                              >
                              </dropdown-button>
                          </div>
                          <div class="flex flex-col gap-4 mb-4">
                              ${repeat(
                                  sources,
                                  (source) => source._id!,
                                  (source) => html`<div
                                      class="flex flex-col gap-2 border border-divider rounded-md underline-none hover:border-primary"
                                  >
                                      <a href="/sources/${encodeURIComponent(source._id ?? "")}">
                                          <div class="flex p-4 pb-0 gap-2">
                                              <span class="rounded-md px-1 border border-green-600 font-semibold">${source.type}</span>
                                              <span class="font-semibold">${source.name}</span>
                                              <button
                                                  class="ml-auto hover:text-primary flex items-center gap-1"
                                                  @click=${(ev: Event) => this.export(ev, source)}
                                              >
                                                  <i class="icon w-5 h-5">${downloadIcon}</i><span>${i18n("Export")}</span>
                                              </button>
                                              <button
                                                  class="hover:text-primary w-6 h-6 flex items-center justify-center"
                                                  @click=${(ev: Event) => this.deleteSource(ev, source)}
                                              >
                                                  <i class="icon w-5 h-5">${deleteIcon}</i>
                                              </button>
                                          </div>
                                          ${source.description.trim().length > 0
                                              ? html`<div class="line-clamp-2 px-4">${source.description}</div>`
                                              : nothing}
                                      </a>
                                      <source-panel class="p-4 pt-0" .source=${source}></source-panel>
                                  </div>`
                              )}
                          </div>
                          <div class="flex flex-col items-center gap-2">
                              <h2 class="self-start">${i18n("User questions")}</h2>
                              <chat-sessions class="w-full" .collectionId=${this.collection._id}></chat-sessions>
                          </div>`
                    : nothing}
            </div>
        </div>`;
    }

    handleTab(ev: KeyboardEvent) {
        if (ev.key == "Tab") {
            ev.preventDefault();
            const el = this.querySelector<HTMLTextAreaElement>("#botCss")!;
            const start = el.selectionStart;
            const end = el.selectionEnd;

            el.value = el.value.substring(0, start) + "\t" + el.value.substring(end);
            el.selectionStart = el.selectionEnd = start + 1;
        }
    }

    handleInput() {
        const name = this.querySelector<HTMLInputElement>("#name")!.value.trim();
        const description = this.querySelector<HTMLTextAreaElement>("#description")!.value.trim();
        const systemPrompt = this.querySelector<HTMLTextAreaElement>("#systemPrompt")!.value.trim();
        const botName = this.querySelector<HTMLInputElement>("#botName")!.value.trim();
        const botWelcome = this.querySelector<HTMLInputElement>("#botWelcome")!.value.trim();
        const botFooter = this.querySelector<HTMLTextAreaElement>("#botFooter")!.value.trim();
        const botCss = this.querySelector<HTMLTextAreaElement>("#botCss")!.value.trim();

        const collection = this.collection;
        collection.name = name;
        collection.description = description;
        collection.systemPrompt = systemPrompt;
        collection.botName = botName;
        collection.botWelcome = botWelcome;
        collection.botFooter = botFooter;
        collection.botCss = botCss;
        this.collection = { ...collection };
        this.requestUpdate();
    }

    uploadImage() {
        // Create a file input element
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*"; // Limit to image files

        input.onchange = async (e: Event) => {
            const target = e.target as HTMLInputElement;
            const file = target?.files ? target.files[0] : undefined;
            if (!file) {
                this.error = i18n("Could not upload icon");
                return;
            }

            // Create FormData and append the file
            const formData = new FormData();
            formData.append("file", file);

            // Call apiPost to upload the file
            try {
                const response = await apiPost<string>("upload", formData, Store.getAdminToken()!);
                if (response.success) {
                    this.collection.botIcon = response.data;
                    this.requestUpdate();
                } else {
                    this.error = i18n("Could not upload icon");
                }
            } catch (error) {
                console.error("Error during upload:", error);
            }
        };

        // Trigger the file browser
        input.click();
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

    export(ev: Event, source: Source) {
        ev.preventDefault();
        ev.stopPropagation();
        source = { ...source };
        source._id = undefined;
        source.collectionId = "";
        downloadJson(source, source.name);
    }

    import(ev: Event) {
        ev.preventDefault();
        ev.stopPropagation();
        uploadJson(async (source: Source) => {
            source.collectionId = this.collection._id!;
            const result = await Api.setSource(Store.getAdminToken()!, source);
            if (!result.success) {
                toast("Could not import source");
            } else {
                this.sources.unshift(result.data);
                this.requestUpdate();
            }
        });
    }
}

@customElement("source-panel")
export class SourcePanel extends BaseElement {
    @property()
    source?: Source;

    @state()
    error?: string;

    @state()
    job?: ProcessingJob;

    timeoutId: any = -1;
    connectedCallback(): void {
        super.connectedCallback();
        const updateJob = async () => {
            await this.getJob(Store.getAdminToken()!);
            this.timeoutId = setTimeout(updateJob, 1000);
        };
        updateJob();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        clearTimeout(this.timeoutId);
    }

    async getJob(adminToken: string) {
        if (!adminToken) return;
        if (!this.source) return;
        const jobs = await Api.getJob(adminToken, this.source._id!);
        if (!jobs.success) {
            this.error = i18n("Could not load job");
        } else {
            if (jobs.data) this.job = jobs.data;
        }
        this.requestUpdate();
    }

    render() {
        const source = this.source;
        if (!source) return renderError("Source not defined");

        if (this.job) {
            const job = this.job;
            const toggleLogs = (ev: Event) => {
                ev.preventDefault();
                ev.stopPropagation();
                const target = ev.target as HTMLElement;
                target.parentElement?.parentElement?.querySelector<HTMLDivElement>("#logs")?.classList.toggle("hidden");
            };

            let status = "";
            let color = "";
            let action = i18n("Process");
            let stop = false;
            switch (job.state) {
                case "running":
                    status = i18n("Processing");
                    color = "text-green-400";
                    action = i18n("Stop");
                    stop = true;
                    break;
                case "waiting":
                    status = i18n("Waiting for processing");
                    color = "text-yellow-400";
                    action = i18n("Stop");
                    stop = true;
                    break;
                case "succeeded":
                    status = i18n("Processing succeeded")(job.finishedAt, job.startedAt);
                    color = "text-green-400";
                    break;
                case "failed":
                    status = i18n("Processing failed")(job.finishedAt);
                    color = "text-red-400";
                    break;
                case "stopped":
                    status = i18n("Processing stopped by user")(job.finishedAt);
            }

            return html`<div class="flex flex-col gap-2">
                ${this.error ? renderError(this.error) : nothing}
                <span class="${color} font-semibold text-sm">${status}</span>
                <div class="flex gap-2 items-center">
                    <button class="self-start button" @click=${(ev: Event) => this.process(ev, stop)}>${action}</button>
                    <button class="self-start button" @click=${toggleLogs}>${i18n("Logs")}</button>
                    <a href="/documents/${source._id}" class="self-start button">${i18n("Docs")}</a>
                    <a href="/chat/${source.collectionId}/${source._id}" class="self-start button">${i18n("Chat")}</a>
                </div>
                <div id="logs" class="hidden debug hljs p-4 whitespace-pre-wrap min-h-80 max-h-80">${job.log}</div>
            </div>`;
        } else {
            return html`<div class="flex flex-col gap-2">
                ${this.error ? renderError(this.error) : nothing}
                <button class="self-start button" @click=${(ev: Event) => this.process(ev, false)}>${i18n("Process")}</button>
            </div>`;
        }
    }

    async process(ev: Event, stop: boolean) {
        ev.preventDefault();
        ev.stopPropagation();
        const source = this.source;
        if (!source) return;
        const job = stop
            ? await Api.stopProcessingSource(Store.getAdminToken()!, source._id!)
            : await Api.processSource(Store.getAdminToken()!, source._id!);
        if (!job.success) {
            alert("Could not start processing");
            return;
        }
        this.job = job.data;
        this.requestUpdate();
    }
}

class ChatSessionStream extends Stream<ChatSession> {
    getItemKey(item: ChatSession): string {
        return item._id!;
    }
    getItemDate(item: ChatSession): Date {
        return new Date();
    }
}

@customElement("chat-session-stream")
class ChatSessionStreamView extends StreamView<ChatSession> {
    constructor() {
        super();
        this.wrapItem = false;
    }

    renderItem(item: ChatSession, polledItems: boolean) {
        const messages = item.rawMessages.filter((message) => message.role == "user");
        if (messages.length == 0) {
            return html`<div></div> `;
        }
        const chatDom = dom(html`<div class="border border-divider rounded-md p-4 mb-4 flex flex-col gap-2">
            <div class="flex">
                <a href="/replay/${item._id}" class="button self-start">${i18n("Replay")}</a>
                <button
                    class="ml-auto hover:text-primary w-6 h-6 flex items-center justify-center"
                    @click=${() => this.deleteSession(chatDom, item._id!)}
                >
                    <i class="icon w-5 h-5">${deleteIcon}</i>
                </button>
            </div>
            ${map(messages, (message) => html`<a class="w-full flex flex-col p-2 border border-divider rounded-lg mt-2">${message.content}</a>`)}
        </div>`)[0];
        return chatDom;
    }

    async deleteSession(element: HTMLElement, sessionId: string) {
        element.remove();
        await Api.deleteSession(Store.getAdminToken()!, sessionId);
    }
}

@customElement("chat-sessions")
class ChatSessionsElement extends BaseElement {
    @property()
    collectionId?: string;

    render() {
        if (!this.collectionId) return html`${nothing}`;

        const stream = new ChatSessionStream(async (cursor?: string) => {
            let offset = cursor ? parseInt(cursor) : 0;
            const result = await Api.getChats(Store.getAdminToken()!, this.collectionId!, offset, 25);
            if (!result.success) {
                return { items: [] };
            }
            return { cursor: (offset + 25).toString(), items: result.data };
        });
        const streamView = dom(html`<chat-session-stream .stream=${stream}></chat-session-stream>`)[0];
        return html`${streamView}`;
    }
}
