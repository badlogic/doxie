import { LitElement, PropertyValueMap, TemplateResult, html, nothing, render } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { errorIcon, arrowUpDoubleIcon, spinnerIcon, upDownIcon, moonIcon, sunIcon, settingsIcon, arrowLeftIcon, arrowRightIcon } from "./icons.js";
import { router } from "./routing.js";

export function dom(template: TemplateResult, container?: HTMLElement | DocumentFragment): HTMLElement[] {
    if (container) {
        render(template, container);
        return [];
    }

    const div = document.createElement(`div`);
    render(template, div);
    const children: Element[] = [];
    for (let i = 0; i < div.children.length; i++) {
        children.push(div.children[i]);
    }
    return children as HTMLElement[];
}

export function onVisibleOnce(target: Element, callback: () => void, rootMargin = "200px", threshold = 0.01) {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    callback();
                    observer.unobserve(entry.target);
                }
            });
        },
        {
            root: null,
            rootMargin,
            threshold,
        }
    );
    observer.observe(target);
}

export function onVisibilityChange(target: Element, onVisible: () => void, onInvisible: () => void) {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    onVisible();
                } else {
                    onInvisible();
                }
            });
        },
        {
            root: null,
            rootMargin: "200px",
            threshold: 0.01,
        }
    );
    observer.observe(target);
    return observer;
}

export function hasLinkOrButtonParent(el: Element | HTMLElement | null) {
    if (!el) return false;
    el = el as HTMLElement;
    while (el) {
        if (el.tagName == "A" || el.tagName == "BUTTON") return true;
        el = el.parentElement as HTMLElement;
    }
    return false;
}

export function collectLitElements(element: HTMLElement): LitElement[] {
    const litElements: LitElement[] = [];

    function traverse(node: HTMLElement) {
        if (node instanceof LitElement) {
            litElements.push(node);
        }
        const children = node.children;
        for (let i = 0; i < children.length; i++) {
            traverse(children[i] as HTMLElement);
        }
    }
    traverse(element);
    return litElements;
}

export async function waitForLitElementsToRender(element: HTMLElement) {
    const promises: Promise<boolean>[] = [];
    const elements = collectLitElements(element);
    for (const el of elements) {
        promises.push(el.updateComplete);
    }
    await Promise.all(promises);
}

export function waitForScrollHeightUnchanged(element: HTMLElement, cb: () => void, steadyInterval = 50) {
    let lastChangeTime = performance.now();
    let lastHeight = 0;
    const check = () => {
        const height = element.scrollHeight;
        if (height != lastHeight) {
            lastChangeTime = performance.now();
            lastHeight = height;
            requestAnimationFrame(check);
            return;
        }

        if (performance.now() - lastChangeTime > steadyInterval) {
            cb();
        } else {
            requestAnimationFrame(check);
        }
    };
    check();
}

export function waitForNavigation(): Promise<void> {
    return new Promise((resolve) => {
        window.addEventListener("popstate", function onPopState() {
            window.removeEventListener("popstate", onPopState);
            resolve();
        });
    });
}

export function copyTextToClipboard(text: string): void {
    const tempElement = document.createElement("textarea");
    tempElement.style.position = "fixed";
    tempElement.style.left = "0";
    tempElement.style.top = "0";
    tempElement.style.opacity = "0";
    tempElement.value = text;
    document.body.appendChild(tempElement);

    tempElement.focus();
    tempElement.select();

    try {
        const successful = document.execCommand("copy");
        if (!successful) {
            console.error("Failed to copy link");
        }
    } catch (err) {
        console.error("Error in copying link: ", err);
    }

    document.body.removeChild(tempElement);
}

export function getScrollParent(parent: HTMLElement | Node | null) {
    while (parent) {
        if (parent instanceof HTMLElement && parent.classList.contains("overflow-auto")) return parent as HTMLElement;
        if (parent == document.documentElement) return parent as HTMLElement;
        parent = parent.parentNode;
    }
    return undefined;
}

function resetAnimation(el: HTMLElement) {
    el.style.animation = "none";
    el.offsetHeight; /* trigger reflow */
    (el.style.animation as any) = null;
}

export function isMobileBrowser(): boolean {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;

    // Regular expressions for mobile User-Agent strings
    const mobileRegex =
        /android|avantgo|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od|ad)|iris|kindle|lge |maemo|midp|mini|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i;

    // Check if it's a mobile device based on the user agent
    if (mobileRegex.test(userAgent)) {
        return true;
    }

    // Additional check for iOS devices requesting desktop site
    const isIOSRequestingDesktop = () => {
        return /Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1;
    };

    return isIOSRequestingDesktop();
}

export function isSafariBrowser(): boolean {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return !userAgent.includes("chrome") && !userAgent.includes("android") && (userAgent.includes("webkit") || userAgent.includes("safari"));
}

export function renderInfo(content: TemplateResult | HTMLElement | string, icon?: TemplateResult, click?: (ev: MouseEvent) => void) {
    return html`<div
        @click=${(ev: MouseEvent) => (click ? click(ev) : undefined)}
        class="bg-muted text-muted-fg fill-muted-fg, px-4 py-2 rounded flex items-center"
    >
        ${icon ? html`<i class="icon w-6 h-6 fill-muted-fg mr-2">${icon}</i>` : nothing}${content}
    </div>`;
}

export function renderError(error: string) {
    return html`<div class="bg-red-500 w-full flex items-center px-4 py-2 text-[#fff] gap-2 rounded-md">
        <i class="icon !w-6 !h-6 fill-[#fff]">${errorIcon}</i>
        <div>${error}</div>
    </div>`;
}

export class BaseElement extends LitElement {
    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.updated(_changedProperties);
        fixLinksAndVideos(this);
    }
}

export class SubscribedElement extends BaseElement {
    readonly subscriptions: (() => void)[] = [];

    disconnectedCallback(): void {
        super.disconnectedCallback();
        for (const subscription of this.subscriptions) {
            subscription();
        }
    }
}

export abstract class FloatingButton extends LitElement {
    @property()
    highlight = false;

    @property()
    highlightAnimation = "";

    @property()
    highlightStyle = "w-12 h-12 flex justify-center items-center bg-primary rounded-full fancy-shadow";

    @property()
    highlightIconStyle = "text-[#fff]";

    @property()
    lower = false;

    @property()
    value?: string;

    @property()
    inContainer = true;

    abstract getOffset(): string;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        const root = this.renderRoot.children[0] as HTMLElement;
        resetAnimation(root);
    }

    render() {
        const normalStyle =
            "w-12 h-12 flex justify-center items-center bg-background dark:bg-divider border border-divider rounded-full fancy-shadow";
        const animationStyle = `transition-transform  ${this.lower ? "translate-y-full md:translate-y-0" : "translate-y-0"}`;

        return html`<div class="${animationStyle} fixed z-20 ${this.getOffset()} animate-duration-300 md:right-[calc(50vw+336px)]">
            <button
                class="${this.highlight ? this.highlightStyle + " animate-infinite animate-ease-in-out " : normalStyle}"
                @click=${() => this.handleClick()}
            >
                <i
                    class="icon !w-5 !h-5 ${this.highlight
                        ? `${this.highlightAnimation} animate-infinite animate-ease-in-out ${this.highlightIconStyle}`
                        : ""}"
                    >${this.getIcon()}</i
                >
            </button>
            <div
                class="${this.highlight && this.value
                    ? ""
                    : "hidden"} pointer-events-none absolute cursor-pointer left-[70%] bottom-[70%] rounded-full border border-white bg-primary text-primary-fg text-xs px-1 text-center"
            >
                ${this.value}
            </div>
        </div>`;
    }

    abstract handleClick(): void;
    abstract getIcon(): TemplateResult;
}

@customElement("up-button")
export class UpButton extends FloatingButton {
    @property()
    clicked: () => void = () => {
        const scrollParent = getScrollParent(this);
        scrollParent?.scrollTo({ top: 0, behavior: "smooth" });
    };

    scrollParent?: HTMLElement;

    constructor() {
        super();
        this.classList.add("hidden");
    }

    connectedCallback(): void {
        super.connectedCallback();
        this.scrollParent = getScrollParent(this);
        if (this.scrollParent == document.documentElement) {
            window.addEventListener("scroll", this.scrollHandler);
        } else {
            getScrollParent(this)!.addEventListener("scroll", this.scrollHandler);
        }
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.scrollParent?.removeEventListener("scroll", this.scrollHandler);
        window.removeEventListener("scroll", this.scrollHandler);
    }

    handleClick(): void {
        this.highlight = false;
        this.clicked();
    }

    getIcon(): TemplateResult {
        return html`${arrowUpDoubleIcon}`;
    }

    getOffset() {
        return `${this.inContainer ? "bottom-16" : "bottom-4"} ml-4 md:bottom-4 ${this.inContainer ? "md:ml-0" : "md:-ml-16"}`;
    }

    lastScrollTop = 0;
    scrollHandler = () => this.handleScroll();
    handleScroll() {
        if (this.highlight) {
            if (getScrollParent(this.parentElement)!.scrollTop < 10) {
                this.highlight = false;
                this.classList.add("hidden");
            }
            const dir = this.lastScrollTop - getScrollParent(this.parentElement)!.scrollTop;
            if (dir != 0) {
                this.lower = dir < 0;
            }
            this.classList.remove("hidden");
            this.lastScrollTop = getScrollParent(this.parentElement)!!.scrollTop;
            return;
        }

        if (getScrollParent(this.parentElement)!.scrollTop < 10) {
            this.highlight = false;
            this.lastScrollTop = getScrollParent(this.parentElement)!.scrollTop;
            this.classList.add("hidden");
            return;
        }
        this.classList.remove("hidden");

        const dir = this.lastScrollTop - getScrollParent(this.parentElement)!.scrollTop;
        if (dir != 0) {
            if (dir < 0) {
                this.classList.add("hidden");
            } else {
                this.classList.remove("hidden");
            }
            this.lower = dir < 0;
        }
        this.lastScrollTop = getScrollParent(this.parentElement)!.scrollTop;
    }

    setHighlight() {
        const scrollParent = getScrollParent(this)!;
        if (scrollParent.scrollTop > 80) {
            this.classList.remove("hidden");
            this.highlight = true;
        }
    }
}

@customElement("loading-spinner")
export class LoadingSpinner extends LitElement {
    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<div class="w-full h-full flex items-center justify-center">
            <i class="icon !w-8 !h-8 text-primary animate-spin">${spinnerIcon}</i>
        </div>`;
    }
}

@customElement("slide-button")
export class SlideButton extends LitElement {
    @property()
    checked = false;

    @property()
    text?: string | TemplateResult;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<label class="relative inline-flex items-center justify-center cursor-pointer">
            <input
                type="checkbox"
                class="sr-only peer outline-none"
                ?checked=${this.checked}
                @change=${(ev: Event) => this.handleChange(ev.target as HTMLInputElement)}
            />
            <div
                class="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-[#fff] after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-muted-fg peer-checked:bg-primary fancy-shadow"
            ></div>
            ${typeof this.text == "string"
                ? html`<span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">${this.text ? this.text : ""}</span>`
                : this.text}
        </label>`;
    }

    handleChange(el: HTMLInputElement) {
        this.checked = el.checked;
        this.dispatchEvent(
            new CustomEvent("changed", {
                detail: {
                    value: this.checked,
                },
            })
        );
    }
}

@customElement("button-group")
export class ButtonGroup<T> extends LitElement {
    @property()
    values: { label: string; value: T }[] = [];

    @property()
    selected?: T;

    @property()
    change: (value: T) => void = () => {};

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<div class="flex h-8 fancy-shadow rounded-full cursor-pointer">
            ${map(this.values, (value, index) => {
                let rounded = "";
                if (index == 0) rounded = "rounded-l-full";
                if (index == this.values.length - 1) rounded = "rounded-r-full";
                let selected =
                    this.values[index].value == this.selected
                        ? "bg-primary text-primary-fg hover:bg-primarysw-600"
                        : "border border-divider hover:bg-muted";
                return html`<div
                    class="flex items-center justify-center px-4 text-sm ${rounded} ${selected}"
                    @click=${() => this.selectedChanged(index)}
                >
                    ${value.label}
                </div>`;
            })}
        </div>`;
    }

    selectedChanged(index: number) {
        this.selected = this.values[index].value;
        this.dispatchEvent(
            new CustomEvent("change", {
                detail: {
                    value: this.selected,
                    index: index,
                },
            })
        );
        this.change(this.selected);
    }
}

@customElement("select-box")
export class SelectBox<T> extends LitElement {
    @property()
    values: { label: string; value: T }[] = [];

    @property()
    selected: T | undefined;

    @property()
    dropdownOpen = false;

    @property()
    align: "left" | "right" = "right";

    @property()
    change: (value: T) => void = () => {};

    popout?: HTMLElement;
    popoutContainer?: HTMLElement;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    private toggleDropdown() {
        this.dropdownOpen = !this.dropdownOpen;
        if (this.dropdownOpen) {
            const button = this.querySelector("button");
            this.popoutContainer = dom(
                html`
                    <div class="fixed top-0 left-0 w-full h-full">
                        <div class="fixed flex flex-col rounded-md bg-muted focus:outline-none overflow-y-auto fancy-shadow mt-1">
                            ${this.values.map(
                                (item) =>
                                    html`<button @click="${() => this.handleSelect(item)}" class="px-4 py-2 text-left text-sm hover:text-primary">
                                        ${item.label}
                                    </button>`
                            )}
                        </div>
                    </div>
                `
            )[0];
            this.popout = this.popoutContainer.children[0] as HTMLElement;
            this.popoutContainer.addEventListener("click", () => {
                this.popoutContainer?.remove();
                this.dropdownOpen = false;
            });
            document.body.append(this.popoutContainer);
            const updatePosition = () => {
                if (!this.popout || !this.dropdownOpen) return;
                const rect = button!.getBoundingClientRect();
                this.popout!.style.top = rect.bottom + "px";
                this.popout!.style.left = rect.left + rect.width - this.popout.getBoundingClientRect().width + "px";
                requestAnimationFrame(updatePosition);
            };
            updatePosition();
        } else {
            this.popout?.remove();
        }
    }

    private handleSelect(item: { label: string; value: T }) {
        this.selected = item.value;
        this.dropdownOpen = false;
        this.popoutContainer?.remove();
        this.dispatchEvent(new CustomEvent("selection-changed", { detail: item.value }));
        this.change(this.selected);
    }

    render() {
        const buttonText = this.selected ? this.values.find((value) => value.value == this.selected)?.label : "Select an Option";
        return html`
            <div class="inline-block text-left fancy-shadow rounded-md">
                <button
                    @click="${this.toggleDropdown}"
                    type="button"
                    class="inline-flex items-center justify-center w-full rounded-md gap-1 pl-2 pr-1 py-1 bg-muted text-sm focus:outline-none"
                    aria-expanded="${this.dropdownOpen}"
                    aria-haspopup="true"
                >
                    ${buttonText}
                    <i class="icon w-5 h-5">${upDownIcon}</i>
                </button>
            </div>
        `;
    }
}

@customElement("dropdown-button")
export class DropdownButton<T> extends LitElement {
    @property()
    content?: TemplateResult;

    @property()
    values: { label: string; value: T }[] = [];

    @property()
    onSelected: (value: { label: string; value: T }) => void = () => {};

    @property()
    dropdownOpen = false;

    @property()
    align: "left" | "right" = "right";

    @property()
    change: (value: T) => void = () => {};

    popout?: HTMLElement;
    popoutContainer?: HTMLElement;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    private toggleDropdown() {
        this.dropdownOpen = !this.dropdownOpen;
        if (this.dropdownOpen) {
            const button = this.querySelector("button");
            this.popoutContainer = dom(
                html`
                    <div class="fixed top-0 left-0 w-full h-full">
                        <div class="fixed flex flex-col rounded-md bg-muted focus:outline-none overflow-y-auto fancy-shadow mt-1">
                            ${this.values.map(
                                (item) =>
                                    html`<button @click="${() => this.handleSelect(item)}" class="px-4 py-2 text-left text-sm hover:text-primary">
                                        ${item.label}
                                    </button>`
                            )}
                        </div>
                    </div>
                `
            )[0];
            this.popout = this.popoutContainer.children[0] as HTMLElement;
            this.popoutContainer.addEventListener("click", () => {
                this.popoutContainer?.remove();
                this.dropdownOpen = false;
            });
            document.body.append(this.popoutContainer);
            const updatePosition = () => {
                if (!this.popout || !this.dropdownOpen) return;
                const rect = button!.getBoundingClientRect();
                this.popout!.style.top = rect.bottom + "px";
                this.popout!.style.left = rect.left + rect.width - this.popout.getBoundingClientRect().width + "px";
                requestAnimationFrame(updatePosition);
            };
            updatePosition();
        } else {
            this.popout?.remove();
        }
    }

    private handleSelect(item: { label: string; value: T }) {
        this.onSelected(item);
        this.dropdownOpen = false;
        this.popoutContainer?.remove();
    }

    render() {
        return html` <button class="flex items-center" @click="${this.toggleDropdown}">${this.content}</button> `;
    }
}

@customElement("toast-element")
export class Toast extends LitElement {
    @property()
    content: TemplateResult | HTMLElement | string = "";

    @property()
    timeout = 5000;

    @property()
    bottom = true;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        setTimeout(() => {
            this.remove();
        }, this.timeout);
    }

    render() {
        return html`<div class="fixed px-4 w-full ${this.bottom ? "bottom-4" : "top-[52px]"} left-0 flex items-center justify-center z-30">
            <div
                id="box"
                class="animate-fade animate-duration-[500ms] w-full max-w-[600px] px-4 py-2 flex justify-center items-center bg-black text-white rounded-md fancy-shadow"
            >
                ${this.content}
            </div>
        </div>`;
    }
}

export function toast(content: TemplateResult | HTMLElement | string, timeout = 2000) {
    document.body.append(dom(html`<toast-element .content=${content} .timeout=${timeout}></toast-element>`)[0]);
}

export function renderChrome(content: TemplateResult) {
    return html`<div class="w-full max-w-[640px] mx-auto flex flex-col gap-4 px-4 pt-4 relative">
        <h1 class="text-center text-primary"><a href="/" class="text-primary" style="text-decoration: none;">mtorrent</a></h1>
        ${content}
        <div class="absolute top-2 right-2 flex">
            <theme-toggle class="w-10 h-10"></theme-toggle>
            <button class="flex items-center justify-center w-10 h-10" @click=${() => router.push("/settings")}>
                <i class="icon !w-6 !h-6">${settingsIcon}</i>
            </button>
        </div>
    </div>`;
}

export function closeButton() {
    return html`<button @click=${() => router.pop()} class="flex items-center justify-center w-10 h-10">
        <i class="icon !w-6 !h-6 fill-muted-fg">${arrowLeftIcon}</i>
    </button>`;
}

export function renderTopbar(
    title: HTMLElement | string,
    closeButton?: TemplateResult | HTMLElement,
    buttons?: TemplateResult | HTMLElement,
    limitWidth = true
) {
    return html`<top-bar
        .limitWidth=${limitWidth}
        .heading=${title instanceof HTMLElement ? title : title}
        .closeButton=${closeButton}
        .buttons=${buttons}
    >
    </top-bar>`;
}

@customElement("top-bar")
export class Topbar extends BaseElement {
    @property()
    heading?: TemplateResult;

    @property()
    buttons?: TemplateResult;

    @property()
    closeButton?: TemplateResult | HTMLElement;

    @property()
    limitWidth = true;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`
            <div class="fixed top-0 left-0 z-10 w-screen h-12 flex items-center bg-background">
                <div class="w-full ${this.limitWidth ? "max-w-[640px]" : ""} mx-auto h-12 pr-4 flex items-center">
                    ${this.closeButton ? html`<div class="flex-shrink-0">${this.closeButton}</div>` : html`<div class="w-4"></div>`}
                    ${this.heading instanceof HTMLElement
                        ? this.heading
                        : html`<span class="font-semibold truncate overflow-hidden">${this.heading}</span>`}
                    ${this.buttons}
                </div>
            </div>
            <div class="w-full h-12"></div>
        `;
    }
}

export function renderPageShell(title: string, content: TemplateResult | HTMLElement, limitWidth = true) {
    return html`<div class="flex flex-col w-full ${limitWidth ? "max-w-[640px]" : ""} mx-auto min-h-full overflow-auto">
        ${renderTopbar(dom(html`<div class="font-semibold whitespace-nowrap overflow-x-auto">${title}</div>`)[0], closeButton(), undefined, true)}
        ${content}
    </div> `;
}

export function fixLinksAndVideos(container: HTMLElement, collapsed = false) {
    const links = container.querySelectorAll("a");
    if (links) {
        links.forEach((link) => {
            if (collapsed) {
                link.addEventListener("click", (ev) => ev.preventDefault());
                return;
            }

            if (link.host != location.host) {
                link.setAttribute("target", "_blank");
                link.setAttribute("rel", "noopener noreferrer");
            } else {
                if (!router.isIgnored(link.pathname)) {
                    link.addEventListener("click", (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        ev.stopImmediatePropagation();
                        if (link.pathname == location.pathname) return;
                        const navs = new Set<string>(["/home", "/settings", "/hashtags", "/lists", "/feeds", "/search", "/notifications"]);

                        router.push(link.pathname);
                    });
                }
            }
            link.addEventListener("click", (ev) => {
                ev.stopPropagation();
            });
        });
    }

    const videos = container.querySelectorAll("video");
    if (videos) {
        videos.forEach((video) => {
            video.addEventListener("click", (ev) => {
                ev.stopPropagation();
                ev.stopImmediatePropagation();
            });
        });
    }
}

export function downloadJson(obj: any, filename: string): void {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(obj, null, 2));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", filename + ".json");
    document.body.appendChild(downloadAnchorNode); // required for Firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

export function uploadJson(callback: (data: any) => void): void {
    const inputElement = document.createElement("input");
    inputElement.type = "file";
    inputElement.accept = ".json";

    inputElement.addEventListener("change", (event) => {
        const fileReader = new FileReader();
        fileReader.onload = (e) => {
            try {
                const jsonData = JSON.parse(e.target?.result as string);
                callback(jsonData);
            } catch (error) {
                console.error("Error parsing JSON:", error);
            }
        };

        const files = (event.target as HTMLInputElement).files;
        if (files && files[0]) {
            fileReader.readAsText(files[0]);
        }
    });

    inputElement.click();
}
