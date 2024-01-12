import { LitElement, html, nothing, render } from "lit";
import { BaseElement, closeButton, dom, renderError, renderTopbar } from "../app.js";
import { customElement, property, state } from "lit/decorators.js";
import { pageContainerStyle, pageContentStyle } from "../utils/styles.js";
import { Store } from "../utils/store.js";
import { i18n } from "../utils/i18n.js";
import { Api, Collection, FaqSource, FlarumSource, ProcessingJob, Source } from "../common/api.js";
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
            <div class="${pageContentStyle} px-4 gap-2">
                <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("Name")}</span>
                <input
                    id="name"
                    class="textfield pt-2 ${collection.name.length == 0 ? "border-red-500" : ""}"
                    .value=${collection.name}
                    @input=${() => this.handleInput()}
                />
                <span class="self-start text-xs text-muted-fg font-semibold -mb-4 ml-2 bg-background z-[5] px-1">${i18n("Description")}</span>
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
                                      { label: "Sitemap", value: "sitemap" },
                                  ]}
                                  .onSelected=${(sourceType: { value: string; label: string }) => this.addSource(sourceType)}
                              >
                              </dropdown-button>
                          </div>
                          <div class="flex flex-col gap-4 mb-4">
                              ${map(
                                  sources,
                                  (source) => html`<div
                                      class="flex flex-col gap-2 border border-divider rounded-md underline-none hover:border-primary"
                                  >
                                      <a href="/sources/${encodeURIComponent(source._id ?? "")}">
                                          <div class="flex px-2 py-2">
                                              <span class="rounded-md px-1 bg-green-600 font-semibold">${source.type}</span>
                                              <span class="ml-2 font-semibold">${source.name}</span>
                                              <button
                                                  class="ml-auto hover:text-primary w-6 h-6 flex items-center justify-center"
                                                  @click=${(ev: Event) => this.deleteSource(ev, source)}
                                              >
                                                  <i class="icon w-5 h-5">${deleteIcon}</i>
                                              </button>
                                          </div>
                                          ${source.description.trim().length > 0
                                              ? html`<div class="line-clamp-2 px-2">${source.description}</div>`
                                              : nothing}
                                      </a>
                                      ${this.renderJobState(source)}
                                  </div>`
                              )}
                          </div>`
                    : nothing}
            </div>
        </div>`;
    }

    renderJobState(source: Source) {
        const process = async (ev: Event, stop: boolean) => {
            ev.preventDefault();
            ev.stopPropagation();
            const job = stop
                ? await Api.stopProcessingSource(Store.getAdminToken()!, source._id!)
                : await Api.processSource(Store.getAdminToken()!, source._id!);
            if (!job.success) {
                alert("Could not start processing");
                return;
            }
            if (job.data) this.jobs.set(source._id!, job.data);
            else this.jobs.delete(source._id!);
            this.requestUpdate();
        };

        if (this.jobs.has(source._id!)) {
            const job = this.jobs.get(source._id!)!;
            const toggleLogs = (ev: Event) => {
                ev.preventDefault();
                ev.stopPropagation();
                const target = ev.target as HTMLElement;
                target.parentElement?.parentElement?.querySelector<HTMLDivElement>("#logs")?.classList.toggle("hidden");
            };
            const logs = job.log.length > 0 ? html`<div class="w-full flex flex-col"></div>` : nothing;

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
                    status = i18n("Processing succeeded")(job.finishedAt);
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
                <div class="flex gap-2 items-center px-2 mb-2">
                    <button class="self-start button" @click=${(ev: Event) => process(ev, stop)}>${action}</button>
                    <button class="self-start button" @click=${toggleLogs}>${i18n("Logs")}</button>
                    <span class="${color} font-semibold text-sm">${status}</span>
                </div>
                <div id="logs" class="hidden debug hljs -mt-2 p-4 whitespace-pre-wrap min-h-80 max-h-80">${job.log}</div>
            </div>`;
        } else {
            return html`<button class="self-start button mx-2 mb-2" @click=${(ev: Event) => process(ev, false)}>${i18n("Process")}</button>`;
        }
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
