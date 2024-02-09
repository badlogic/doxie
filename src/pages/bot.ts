import { TemplateResult, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { BaseElement, chatDefaultCss, closeButton, dom, downloadJson, renderError, renderTopbar, toast, uploadJson } from "../app.js";
import { appState } from "../appstate.js";
import { Api, ChatSession, Bot, ProcessingJob, Source, VectorDocument, apiPost } from "../common/api.js";
import { i18n } from "../utils/i18n.js";
import { addIcon, deleteIcon, downloadIcon } from "../utils/icons.js";
import { router } from "../utils/routing.js";
import { Store } from "../utils/store.js";
import { pageContainerStyle, pageContentStyle } from "../utils/styles.js";
import { repeat } from "lit-html/directives/repeat.js";
import { Stream } from "../utils/streams.js";
import { StreamView } from "../utils/streamviews.js";

@customElement("bot-page")
export class BotPage extends BaseElement {
    @state()
    isLoading = true;

    @state()
    error?: string;

    @state()
    bot: Bot = { name: "", description: "", systemPrompt: "You are a helpful assistant", botName: "Doxie", sources: [] };

    @state()
    sources?: Source[];

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
            const bot = await Api.getBot(adminToken, id);
            if (!bot.success) {
                this.error = i18n("Could not load bot");
            } else {
                this.bot = bot.data;
            }
            const sources = await Api.getSources(adminToken);
            if (!sources.success) {
                this.error = i18n("Could not load sources");
            } else {
                this.sources = sources.data;
            }
        } catch (e) {
            console.error(e);
            this.error = i18n("Could not load bot");
        } finally {
            this.isLoading = false;
        }
    }

    render() {
        if (this.isLoading) {
            return html`<div class="${pageContainerStyle}">
                ${renderTopbar(i18n("Bot"), closeButton())}
                <div class="${pageContentStyle} px-4 items-center justify-center gap-4">
                    <span>${i18n("Loading ...")}</span>
                    <loading-spinner></loading-spinner>
                </div>
            </div>`;
        }

        if (this.error) {
            return html`<div class="${pageContainerStyle}">
                ${renderTopbar(i18n("Bot"), closeButton())}
                <div class="${pageContentStyle} px-4 items-center justify-center gap-4">
                    <div class="w-full max-w-[320px]">${this.error ? renderError(this.error) : nothing}</div>
                </div>
            </div>`;
        }
        const bot = this.bot;
        const botSources = new Set<string>(bot.sources);
        const sources = this.sources?.filter((source) => botSources.has(source._id!)) ?? [];
        const availableSources = this.sources?.filter((source) => !botSources.has(source._id!)) ?? [];
        const topBar = renderTopbar(
            i18n("Bot"),
            closeButton(),
            html`<button id="save" class="ml-auto button" ?disabled=${!this.canSave(bot)} @click=${() => this.save()}>${i18n("Save")}</button>`
        );
        return html`<div class="${pageContainerStyle}">
            ${topBar}
            <div class="${pageContentStyle} px-4 gap-4">
                <div class="flex gap-2">
                    <a href="/chat/${bot._id!}" class="button self-start">${i18n("Chat")}</a>
                    <a href="/answer/${bot._id!}" class="button self-start">${i18n("Answer")}</a>
                </div>
                ${this.bot._id ? html`<span><strong>Id:</strong> ${this.bot._id}</span>` : nothing}
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1">${i18n("Name")}</span>
                <input
                    id="name"
                    class="textfield pt-2 ${bot.name.length == 0 ? "border-red-500" : ""}"
                    .value=${bot.name}
                    @input=${() => this.handleInput()}
                />
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1">${i18n("Description")}</span>
                <textarea id="description" class="textfield py-3" .value=${bot.description} rows="5" @input=${() => this.handleInput()}></textarea>
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1">${i18n("System prompt")}</span>
                <textarea id="systemPrompt" class="textfield py-3" .value=${bot.systemPrompt} rows="5" @input=${() => this.handleInput()}></textarea>
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1">${i18n("Chatbot name")}</span>
                <input
                    id="botName"
                    class="textfield pt-2 ${bot.name.length == 0 ? "border-red-500" : ""}"
                    .value=${bot.botName ?? "Doxie"}
                    @input=${() => this.handleInput()}
                />
                <span class="self-start text-xs text-muted-fg font-semibold bg-background z-[5] px-1">${i18n("Chatbot icon (128x128)")}</span>
                ${this.bot.botIcon
                    ? html` <img
                          class="h-12 w-12 border border-divider rounded-full cursor-pointer"
                          src="/files/${this.bot.botIcon}"
                          @click=${() => this.uploadImage()}
                      />`
                    : html`<div
                          class="cursor-pointer flex-shrink-0 w-12 h-12 rounded-full dark:border dark:border-muted-fg flex items-center justify-center text-white text-lg"
                          style="background-color: #ab68ff;"
                          @click=${() => this.uploadImage()}
                      >
                          <span>${(this.bot.botName ?? "Doxie").charAt(0).toUpperCase()}</span>
                      </div>`}
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1"
                    >${i18n("Chatbot welcome message")}</span
                >
                <textarea
                    id="botWelcome"
                    class="textfield py-3"
                    .value=${bot.botWelcome ?? "How can I assist you today?"}
                    rows="3"
                    @input=${() => this.handleInput()}
                ></textarea>
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1"
                    >${i18n("Chatbot footer (HTML)")}</span
                >
                <textarea id="botFooter" class="textfield py-3" .value=${bot.botFooter ?? ""} rows="3" @input=${() => this.handleInput()}></textarea>
                <span class="self-start text-xs text-muted-fg font-semibold -mb-6 ml-2 bg-background z-[5] px-1">${i18n("Chatbot CSS")}</span>
                <textarea
                    id="botCss"
                    class="textfield py-3"
                    .value=${bot.botCss ?? chatDefaultCss.trim()}
                    rows="10"
                    @keydown=${(ev: KeyboardEvent) => this.handleTab(ev)}
                    @input=${() => this.handleInput()}
                ></textarea>
                ${!this.isNew
                    ? html` <div class="flex items-center mt-4 items-center gap-2">
                              <h2>${i18n("Sources")}</h2>
                              <dropdown-button
                                  button
                                  class="ml-auto"
                                  .content=${html`<div class="flex items-center hover:text-primary gap-1">
                                      <i class="icon w-5 h-5">${addIcon}</i><span>${i18n("Add")}</span>
                                  </div>`}
                                  .values=${availableSources.map((source) => {
                                      return { label: source.name, value: source };
                                  })}
                                  .onSelected=${(source: { value: Source; label: string }) => this.addSource(source)}
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
                                              <span class="font-semibold">Id: ${source._id}</span>
                                              <button
                                                  class="ml-auto hover:text-primary w-6 h-6 flex items-center justify-center"
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
                              <h2 class="self-start">${i18n("Chat sessions")}</h2>
                              <chat-sessions class="w-full" .collectionId=${this.bot._id}></chat-sessions>
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

        const bot = this.bot;
        bot.name = name;
        bot.description = description;
        bot.systemPrompt = systemPrompt;
        bot.botName = botName;
        bot.botWelcome = botWelcome;
        bot.botFooter = botFooter;
        bot.botCss = botCss;
        this.bot = { ...bot };
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
                    this.bot.botIcon = response.data;
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

    canSave(bot?: Bot) {
        if (!bot) return false;
        return bot.name.trim().length >= 3;
    }

    addSource(source: { label: string; value: Source }) {
        this.bot.sources.push(source.value._id!);
        this.requestUpdate();
    }

    async deleteSource(ev: Event, source: Source) {
        ev.preventDefault();
        ev.stopPropagation();
        this.bot.sources = this.bot.sources.filter((src) => src != source._id);
        this.requestUpdate();
    }

    async save() {
        const result = await Api.setBot(Store.getAdminToken()!, this.bot);
        if (!result.success) {
            if (result.error == "Duplicate bot name") {
                this.error = i18n("Bot with this name already exists");
            } else {
                this.error = i18n("Could not save bot");
                this.requestUpdate();
            }
        } else {
            this.bot = result.data;
            appState.update("bot", this.bot, this.bot._id);
            if (this.isNew) {
                router.replace("/bots/" + this.bot._id);
            }
        }
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
