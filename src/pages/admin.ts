import { LitElement, PropertyValueMap, html, nothing, render } from "lit";
import { BaseElement, closeButton, downloadJson, renderError, renderTopbar, toast, uploadJson } from "../app.js";
import { customElement, state } from "lit/decorators.js";
import { pageContainerStyle, pageContentStyle } from "../utils/styles.js";
import { Store } from "../utils/store.js";
import { i18n } from "../utils/i18n.js";
import { Api, Collection, Source } from "../common/api.js";
import { addIcon, deleteIcon, downloadIcon, plusIcon } from "../utils/icons.js";
import { map } from "lit/directives/map.js";
import { appState } from "../appstate.js";

@customElement("admin-page")
export class AdminPage extends BaseElement {
    @state()
    isLoading = false;

    @state()
    error?: string;

    @state()
    collections?: Collection[];

    constructor() {
        super();
        const adminToken = Store.getAdminToken();
        if (adminToken) {
            this.getCollections(adminToken);
        }
    }

    async getCollections(adminToken: string) {
        this.isLoading = true;
        try {
            const collections = await Api.getCollections(adminToken);
            if (!collections.success) {
                this.error = i18n("Could not load collection");
                Store.setAdminToken(undefined);
            } else {
                this.collections = collections.data;
                Store.setAdminToken(adminToken);
            }
        } catch (e) {
            console.error(e);
            this.error = i18n("Could not load collection");
        } finally {
            this.isLoading = false;
        }
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        appState.subscribe("collection", (event, id, data) => {
            this.getCollections(Store.getAdminToken()!);
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

        if (!this.collections) {
            return html`<div class="${pageContainerStyle}">
                ${renderTopbar("Admin", closeButton())}
                <div class="${pageContentStyle} px-4 items-center justify-center gap-4">
                    <span class="text-sm text-muted-fg -mb-2">${i18n("Admin token")}</span>
                    <div class="w-full max-w-[320px]">${this.error ? renderError(this.error) : nothing}</div>
                    <input id="adminToken" type="password" class="w-full max-w-[320px] textfield" />
                    <button class="button py-1" @click=${() => this.getCollections(document.querySelector<HTMLInputElement>("#adminToken")!.value)}>
                        ${i18n("Sign in")}
                    </button>
                </div>
            </div>`;
        }

        return html`<div class="${pageContainerStyle}">
            ${renderTopbar("Admin", closeButton())}
            <div class="${pageContentStyle} px-4 gap-4">
                <div class="flex gap-2">
                    <h1>${i18n("Collections")}</h1>
                    <button class="ml-auto hover:text-primary flex items-center gap-1" @click=${(ev: Event) => this.import(ev)}>
                        <i class="icon w-5 h-5">${downloadIcon}</i><span>${i18n("Import")}</span>
                    </button>
                    <a href="collections/new" class="self-start flex px-2 py-1 items-center gap-1 hover:text-primary">
                        <i class="icon w-5 h-5">${addIcon}</i><span>${i18n("New")}</span>
                    </a>
                </div>
                ${this.error ? renderError(this.error) : nothing}
                <div class="flex flex-col gap-4 mb-4">
                    ${map(
                        this.collections,
                        (collection) => html`<a href="/collections/${encodeURIComponent(
                            collection._id ?? ""
                        )}" class="px-4 py-2 flex flex-col gap-2 border border-divider rounded-md underline-none hover:border-primary">
                            <div class="flex gap-2">
                                <span class="font-semibold">${collection.name}</span>
                                <button class="ml-auto hover:text-primary flex items-center gap-1" @click=${(ev: Event) =>
                                    this.export(ev, collection)}>
                                    <i class="icon w-5 h-5">${downloadIcon}</i><span>${i18n("Export")}</span>
                                </button>
                                <button class="hover:text-primary w-6 h-6 flex items-center justify-center" @click=${(ev: Event) =>
                                    this.deleteCollection(ev, collection)}><i class="icon w-5 h-5">${deleteIcon}</i></button>
                            </div>
                            ${collection.description.length > 0 ? html`<div class="line-clamp-2">${collection.description}</div>` : nothing}
                        </div>`
                    )}
                </div>
            </div>
        </div>`;
    }

    async deleteCollection(ev: Event, collection: Collection) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!confirm(i18n("Are you sure you want to delete collection")(collection.name))) {
            return;
        }
        const result = await Api.deleteCollection(Store.getAdminToken()!, collection._id!);
        if (!result.success) {
            this.error = i18n("Could not delete collection ")(collection.name);
        } else {
            this.collections = this.collections?.filter((other) => other._id != collection._id);
        }
        this.requestUpdate();
    }

    async export(ev: Event, collection: Collection) {
        ev.preventDefault();
        ev.stopPropagation();
        const sources = await Api.getSources(Store.getAdminToken()!, collection._id!);
        if (!sources.success) {
            toast(i18n("Could not export collection"));
            return;
        }
        collection = { ...collection };
        collection._id = undefined;
        sources.data.forEach((source) => {
            source._id = undefined;
            source.collectionId = "";
        });

        downloadJson(
            {
                collection,
                sources: sources.data,
            },
            collection.name
        );
    }

    async import(ev: Event) {
        ev.preventDefault();
        ev.stopPropagation();
        uploadJson(async (data: { collection: Collection; sources: Source[] }) => {
            const colResult = await Api.setCollection(Store.getAdminToken()!, data.collection);
            if (!colResult.success) {
                toast(i18n("Could not import collection"));
                return;
            }
            for (const source of data.sources) {
                source.collectionId = colResult.data._id!;
                const result = await Api.setSource(Store.getAdminToken()!, source);
                if (!result.success) {
                    toast("Could not import source");
                }
            }
            this.collections!.unshift(colResult.data);
            this.requestUpdate();
        });
    }
}
