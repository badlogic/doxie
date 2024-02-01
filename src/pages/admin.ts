import { PropertyValueMap, html, nothing } from "lit";
import { repeat } from "lit-html/directives/repeat.js";
import { customElement, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { BaseElement, closeButton, downloadJson, renderError, renderTopbar, toast, uploadJson } from "../app.js";
import { appState } from "../appstate.js";
import { Api, Bot, Source } from "../common/api.js";
import { i18n } from "../utils/i18n.js";
import { addIcon, deleteIcon, downloadIcon } from "../utils/icons.js";
import { router } from "../utils/routing.js";
import { Store } from "../utils/store.js";
import { pageContainerStyle, pageContentStyle } from "../utils/styles.js";

@customElement("admin-page")
export class AdminPage extends BaseElement {
    @state()
    isLoading = false;

    @state()
    error?: string;

    @state()
    bots?: Bot[];

    @state()
    sources?: Source[];

    constructor() {
        super();
        const adminToken = Store.getAdminToken();
        if (adminToken) {
            this.getBotsAndSources(adminToken);
        }
    }

    async getBotsAndSources(adminToken: string) {
        this.isLoading = true;
        try {
            const bots = await Api.getBots(adminToken);
            if (!bots.success) {
                this.error = i18n("Could not load bots");
                Store.setAdminToken(undefined);
            } else {
                this.bots = bots.data;
                Store.setAdminToken(adminToken);
            }
            const sources = await Api.getSources(adminToken);
            if (!sources.success) {
                this.error = i18n("Could not load sources");
                Store.setAdminToken(undefined);
            } else {
                this.sources = sources.data;
                Store.setAdminToken(adminToken);
            }
        } catch (e) {
            console.error(e);
            this.error = i18n("Could not load bots");
        } finally {
            this.isLoading = false;
        }
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        appState.subscribe("source", (event, id, data) => {
            this.getBotsAndSources(Store.getAdminToken()!);
        });
    }

    render() {
        if (this.isLoading) {
            return html`<div class="${pageContainerStyle}">
                ${renderTopbar("Admin", closeButton())}
                <div class="${pageContentStyle} px-4 items-center justify-center gap-4">
                    <span>${i18n("Loading ...")}</span>
                    <loading-spinner></loading-spinner>
                </div>
            </div>`;
        }

        if (!this.bots) {
            return html`<div class="${pageContainerStyle}">
                ${renderTopbar("Admin", closeButton())}
                <div class="${pageContentStyle} px-4 items-center justify-center gap-4">
                    <span class="text-sm text-muted-fg -mb-2">${i18n("Admin token")}</span>
                    <div class="w-full max-w-[320px]">${this.error ? renderError(this.error) : nothing}</div>
                    <input id="adminToken" type="password" class="w-full max-w-[320px] textfield" />
                    <button
                        class="button py-1"
                        @click=${() => this.getBotsAndSources(document.querySelector<HTMLInputElement>("#adminToken")!.value)}
                    >
                        ${i18n("Sign in")}
                    </button>
                </div>
            </div>`;
        }

        if (!this.sources) {
            return html`<div class="${pageContainerStyle}">
                ${renderTopbar("Admin", closeButton())}
                <div class="${pageContentStyle} px-4 items-center justify-center gap-4">
                    <span class="text-sm text-muted-fg -mb-2">${i18n("Admin token")}</span>
                    <div class="w-full max-w-[320px]">${this.error ? renderError(this.error) : nothing}</div>
                    <input id="adminToken" type="password" class="w-full max-w-[320px] textfield" />
                    <button
                        class="button py-1"
                        @click=${() => this.getBotsAndSources(document.querySelector<HTMLInputElement>("#adminToken")!.value)}
                    >
                        ${i18n("Sign in")}
                    </button>
                </div>
            </div>`;
        }

        return html` <div class="${pageContainerStyle}">
            ${renderTopbar("Admin", closeButton())}
            <div class="${pageContentStyle} px-4 gap-4">
                ${this.error ? renderError(this.error) : nothing}
                <div class="flex items-center gap-4">
                    <h1>${i18n("Bots")}</h1>
                    <button class="ml-auto hover:text-primary flex items-center gap-1" @click=${(ev: Event) => this.importBot(ev)}>
                        <i class="icon w-5 h-5">${downloadIcon}</i><span>${i18n("Import")}</span>
                    </button>
                    <a href="bots/new" class="self-start flex items-center gap-1 hover:text-primary">
                        <i class="icon w-5 h-5">${addIcon}</i><span>${i18n("New")}</span>
                    </a>
                </div>
                <div class="flex flex-col gap-4 mb-4">
                    ${map(
                        this.bots,
                        (bot) => html`<div class="px-4 py-2 flex flex-col gap-2 border border-divider rounded-md underline-none hover:border-primary">
                            <a href="/bots/${encodeURIComponent(bot._id ?? "")}" class="flex flex-col gap-2">
                                <div class="flex gap-2">
                                    <span class="font-semibold">${bot.name}</span>
                                    <button
                                        class="ml-auto hover:text-primary flex items-center gap-1"
                                        @click=${(ev: Event) => this.exportBot(ev, bot)}
                                    >
                                        <i class="icon w-5 h-5">${downloadIcon}</i><span>${i18n("Export")}</span>
                                    </button>
                                    <button
                                        class="hover:text-primary w-6 h-6 flex items-center justify-center"
                                        @click=${(ev: Event) => this.deleteBot(ev, bot)}
                                    >
                                        <i class="icon w-5 h-5">${deleteIcon}</i>
                                    </button>
                                </div>
                                <span class="font-semibold">Id: ${bot._id}</span>
                                ${bot.description.length > 0 ? html`<div class="line-clamp-2">${bot.description}</div>` : nothing}
                            </a>
                            <a href="/chat/${bot._id!}" class="button self-start">${i18n("Chat")}</a>
                        </div>`
                    )}
                </div>
                <div class="flex items-center gap-4">
                    <h2>${i18n("Sources")}</h2>
                    <button class="ml-auto hover:text-primary flex items-center gap-1" @click=${(ev: Event) => this.importSource(ev)}>
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
                        .onSelected=${(sourceType: { value: string; label: string }) => this.newSource(sourceType)}
                    >
                    </dropdown-button>
                </div>
                <div class="flex flex-col gap-4 mb-4">
                    ${repeat(
                        this.sources,
                        (source) => source._id!,
                        (source) => html`<div
                            class="px-4 py-4 flex flex-col gap-2 border border-divider rounded-md underline-none hover:border-primary"
                        >
                            <a href="/sources/${encodeURIComponent(source._id ?? "")}" class="flex flex-col gap-2">
                                <div class="flex gap-2">
                                    <span class="font-semibold">${source.name}</span>
                                    <button
                                        class="ml-auto hover:text-primary flex items-center gap-1"
                                        @click=${(ev: Event) => this.exportSource(ev, source)}
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
                                <span class="font-semibold">Id: ${source._id}</span>
                                ${source.description.length > 0 ? html`<div class="line-clamp-2">${source.description}</div>` : nothing}
                            </a>
                            <source-panel .source=${source}></source-panel>
                        </div>`
                    )}
                </div>
            </div>
        </div>`;
    }

    async deleteBot(ev: Event, bot: Bot) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!confirm(i18n("Are you sure you want to delete bot")(bot.name))) {
            return;
        }
        const result = await Api.deleteBot(Store.getAdminToken()!, bot._id!);
        if (!result.success) {
            this.error = i18n("Could not delete bot ")(bot.name);
        } else {
            this.bots = this.bots?.filter((other) => other._id != bot._id);
        }
        this.requestUpdate();
    }

    async exportBot(ev: Event, bot: Bot) {
        ev.preventDefault();
        ev.stopPropagation();
        const sources = await Api.getSources(Store.getAdminToken()!);
        if (!sources.success) {
            toast(i18n("Could not export bot"));
            return;
        }
        bot = { ...bot };
        bot._id = undefined;
        sources.data.forEach((source) => {
            source._id = undefined;
        });

        const botSources = new Set<string>(bot.sources);
        downloadJson(
            {
                collection: bot,
                sources: sources.data.filter((source) => botSources.has(source._id!)),
            },
            bot.name
        );
    }

    async importBot(ev: Event) {
        ev.preventDefault();
        ev.stopPropagation();
        uploadJson(async (data: { bot: Bot; sources: Source[] }) => {
            const botResult = await Api.setBot(Store.getAdminToken()!, data.bot);
            if (!botResult.success) {
                toast(i18n("Could not import bot"));
                return;
            }
            const sources: Source[] = [];
            for (const source of data.sources) {
                const result = await Api.setSource(Store.getAdminToken()!, source);
                if (!result.success) {
                    toast("Could not import source");
                } else {
                    sources.push(result.data);
                }
            }
            this.bots!.unshift(botResult.data);
            this.sources?.unshift(...sources);
            this.requestUpdate();
        });
    }

    newSource(sourceType: { label: string; value: string }) {
        router.push(`/sources/new/${sourceType.value}`);
    }

    exportSource(ev: Event, source: Source) {
        ev.preventDefault();
        ev.stopPropagation();
        source = { ...source };
        source._id = undefined;
        downloadJson(source, source.name);
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

    importSource(ev: Event) {
        ev.preventDefault();
        ev.stopPropagation();
        uploadJson(async (source: Source) => {
            const result = await Api.setSource(Store.getAdminToken()!, source);
            if (!result.success) {
                toast("Could not import source");
            } else {
                this.sources!.unshift(result.data);
                this.requestUpdate();
            }
        });
    }
}
