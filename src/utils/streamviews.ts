import { LitElement, PropertyValueMap, TemplateResult, html } from "lit";
import { property, query, state } from "lit/decorators.js";
import { i18n } from "./i18n";
import { Stream, StreamPage } from "./streams";
import { UpButton, dom, getScrollParent, isSafariBrowser, onVisibleOnce, renderError, waitForLitElementsToRender } from "./ui-components.js";
import { error } from "./utils.js";

type RenderedPage<T> = { container: HTMLElement; items: HTMLElement[]; width: number; height: number; placeholder?: HTMLElement };

export abstract class StreamView<T> extends LitElement {
    @property()
    stream?: Stream<T>;

    @property()
    newItems?: (newItems: StreamPage<T> | Error) => Promise<void> = async () => {};

    @property()
    wrapItem = true;

    @property()
    showEndOfList = true;

    @state()
    error?: string;

    @query("#spinner")
    spinner?: HTMLElement;

    loadingPaused = false;
    numItems = 0;
    intersectionObserver?: IntersectionObserver;
    renderedPages: RenderedPage<T>[] = [];
    disableIntersector = false;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        if (!this.stream) {
            error("No stream set, this should not happen");
            return;
        }

        this.intersectionObserver = new IntersectionObserver((entries, observer) => this.handleIntersection(entries, observer));
        this.poll();
        this.load();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.stream?.close();
        for (const page of this.renderedPages) {
            this.intersectionObserver?.unobserve(page.container);
            if (page.placeholder) this.intersectionObserver?.unobserve(page.placeholder);
        }
    }

    poll() {
        // Setup polling
        if (this.stream && this.stream.pollNew) {
            this.stream.addNewItemsListener(async (newPage) => {
                if (this.newItems) this.newItems(newPage);
                if (newPage instanceof Error) {
                    error("Couldn't load newer items", newPage);
                    return;
                }

                const scrollParent = getScrollParent(this.children[0] as HTMLElement)!;
                const upButton = scrollParent.querySelector("up-button") as UpButton;
                if (upButton && scrollParent.scrollTop > 80) {
                    upButton.classList.remove("hidden");
                    upButton.highlight = true;
                }

                const list = this.querySelector("#list") as HTMLElement;
                if (list) {
                    const renderedPage = await this.preparePage(newPage, list, true);
                    if (list.children.length > 0) {
                        list.insertBefore(renderedPage.container, list.children[0]);
                    } else {
                        list.append(renderedPage.container);
                    }
                    this.intersectionObserver?.observe(renderedPage.container);
                    if (isSafariBrowser() || scrollParent.scrollTop < 200) {
                        scrollParent.scrollTop += renderedPage.container.offsetHeight;
                    }
                }
            });
        }
    }

    isLoading = false;
    protected async load() {
        if (!this.stream) {
            this.error = i18n("Invalid stream");
            return;
        }
        if (this.loadingPaused) return;
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            const page = await this.stream.next();
            if (page instanceof Error) {
                this.error = i18n("Invalid stream"); // FIXME handle error
                return;
            }

            const { items } = page;
            const list = this.querySelector("#list") as HTMLElement;
            const spinner = this.spinner;
            if (!list || !spinner) {
                this.error = i18n("Sorry, an unknown error occured");
                return;
            }

            if (items.length == 0) {
                spinner.innerHTML = "";
                if (this.showEndOfList)
                    spinner.append(dom(html`<div class="w-full h-16 flex items-center justify-center">${i18n("End of list")}</div>`)[0]);
                return;
            }

            const renderedPage = await this.preparePage(page, list);
            list.append(renderedPage.container);
            this.intersectionObserver?.observe(renderedPage.container);
            requestAnimationFrame(() => {
                if (renderedPage.items.length > 5) {
                    onVisibleOnce(renderedPage.items[renderedPage.items.length - 4], () => this.load());
                }
                onVisibleOnce(spinner, () => this.load());
            });
        } catch (e) {
            this.error = i18n("Sorry, an unknown error occured");
            console.error(e);
        } finally {
            this.isLoading = false;
        }
    }

    renderItemInternal(item: T, polledItems: boolean) {
        const itemDom = this.wrapItem ? StreamView.renderWrapped(this.renderItem(item, polledItems)) : this.renderItem(item, polledItems);
        return itemDom;
    }

    render() {
        if (this.error) return renderError(this.error);

        return html`
            <div class="relative flex flex-col">
                <div id="list" class="w-full h-full"></div>
                <loading-spinner class="w-full py-2" id="spinner"></loading-spinner>
            </div>
        `;
    }

    abstract renderItem(item: T, polledItems: boolean): TemplateResult;

    static renderWrapped(item: TemplateResult | HTMLElement): TemplateResult {
        return html`<div class="w-full px-4 py-2 border-b border-divider">${item}</div>`;
    }

    handleIntersection(entries: IntersectionObserverEntry[], observer: IntersectionObserver) {
        if (this.disableIntersector) return;
        for (const entry of entries) {
            const renderedPage = this.renderedPages.find((page) => page.container == entry.target || page.placeholder == entry.target);
            const index = this.renderedPages.findIndex((page) => page == renderedPage);
            if (!renderedPage) {
                return;
            }
            if (entry.isIntersecting) {
                if (!renderedPage.placeholder) {
                    // first time, nothing to do, setup placeholder
                    renderedPage.placeholder = dom(html`<div></div>`)[0];
                } else {
                    if (entry.target == renderedPage.placeholder) {
                        this.intersectionObserver?.unobserve(renderedPage.placeholder);
                        const list = this.querySelector("#list") as HTMLElement;
                        list.insertBefore(renderedPage.container, renderedPage.placeholder);
                        renderedPage.placeholder.remove();
                    }
                }
            } else {
                if (renderedPage.placeholder) {
                    if (entry.target == renderedPage.container) {
                        const list = this.querySelector("#list") as HTMLElement;
                        renderedPage.placeholder.style.width = renderedPage.container.offsetWidth + "px";
                        renderedPage.placeholder.style.height = renderedPage.container.offsetHeight + "px";
                        list.insertBefore(renderedPage.placeholder, renderedPage.container);
                        renderedPage.container.remove();
                        this.intersectionObserver?.observe(renderedPage.placeholder);
                    }
                }
            }
        }
    }

    async preparePage(page: StreamPage<T>, targetContainer: HTMLElement, polledItems = false): Promise<RenderedPage<T>> {
        // Create a detached container
        const container = dom(html`<div class="flex flex-col" style="width: ${targetContainer.clientWidth}px;"></div>`)[0];

        // Make the container invisible and append it to the body for more accurate measurements
        container.style.visibility = "hidden";
        container.style.position = "absolute";
        document.body.appendChild(container);

        // Render the items in the container
        const items: HTMLElement[] = [];
        for (const item of page.items) {
            const renderedItem = dom(this.renderItemInternal(item, polledItems))[0];
            items.push(renderedItem);
            container.append(renderedItem);
        }

        if (polledItems) {
            await waitForLitElementsToRender(container);

            // Wait for all media elements to load
            const mediaElements = Array.from(container.querySelectorAll<HTMLImageElement>("img"));
            await Promise.all(
                [...mediaElements].map((media) => {
                    return new Promise<void>((resolve) => {
                        if (media.loading == "lazy") {
                            resolve();
                            return;
                        }
                        if (media.complete) {
                            resolve();
                        } else {
                            media.addEventListener("load", () => resolve(), { once: true });
                            media.addEventListener("error", () => resolve(), { once: true });
                        }
                    });
                })
            );
        }

        // Measure dimensions
        const bounds = container.getBoundingClientRect();
        const width = bounds.width;
        const height = bounds.height;

        // Remove container from the body
        document.body.removeChild(container);
        container.style.width = "";
        container.style.visibility = "";
        container.style.position = "";

        const renderedPage = { container, items, width, height };
        this.renderedPages.push(renderedPage);
        this.intersectionObserver?.observe(renderedPage.container);
        return renderedPage;
    }
}
