import * as DOMPurify from "dompurify";
import { PropertyValueMap, html, nothing } from "lit";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { customElement, property, state } from "lit/decorators.js";
import { Marked } from "marked";
import { BaseElement, dom, getScrollParent, renderError } from "../app";
import { Api, CompletionDebug } from "../common/api";
import { sendIcon } from "../utils/icons";
import { router } from "../utils/routing";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import { map } from "lit/directives/map.js";

export interface Message {
    role: "doxie" | "user" | "error";
    text: string;
}

const marked = new Marked(
    markedHighlight({
        langPrefix: "hljs language-",
        highlight(code, lang, info) {
            const language = hljs.getLanguage(lang) ? lang : "plaintext";
            return hljs.highlight(code, { language }).value;
        },
    })
);

@customElement("chat-message")
export class ChatMessage extends BaseElement {
    @property()
    message?: Message;

    render() {
        if (this.message?.role == "error") {
            return html`<div>${renderError(this.message.text)}</div>`;
        }

        const color = this.message?.role == "doxie" ? "#ab68ff" : "#512da8";
        const role = this.message?.role;
        const text = this.message?.text ?? "";
        const markdown = DOMPurify.sanitize(marked.parse(text) as string);

        return html`<div class="flex w-full px-4 gap-4">
            <div
                class="w-6 h-6 rounded-full dark:border dark:border-muted-fg flex items-center justify-center text-white text-sm"
                style="background-color: ${color};"
            >
                <span>${role?.substring(0, 1).toUpperCase()}</span>
            </div>
            <div class="w-full flex flex-col">
                <div class="font-semibold">${this.message?.role}</div>
                ${role == "doxie" ? html`<text-typer .text=${markdown}></text-typer>` : html`<div>${unsafeHTML(markdown)}</div>`}
            </div>
        </div>`;
    }
}

@customElement("chat-gpt-reply")
export class ChatGptReply extends BaseElement {
    @property()
    query?: string;

    @property()
    sessionId?: string;

    @property()
    completeCb = () => {};

    @state()
    text = "";

    @state()
    debug?: CompletionDebug;

    @state()
    isComplete = false;

    @state()
    error?: string;

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        const collection = router.getCurrentParams()?.get("collection") ?? "berufslexikon";
        if (this.query && this.sessionId) {
            const query = this.query;
            const sessionId = this.sessionId;
            (async () => {
                const result = await Api.complete(sessionId, collection, query, (chunk, type, done) => {
                    if (type == "text") {
                        this.text += chunk;
                    } else {
                        this.debug = JSON.parse(chunk) as CompletionDebug;
                    }
                    this.isComplete = done;
                    if (this.isComplete) {
                        console.log("Is complete");
                    }
                });
                if (!result.success) {
                    this.isComplete = true;
                    this.error = "Sorry, something went wrong";
                }
                this.completeCb();
            })();
        }
    }

    render() {
        const color = "#ab68ff";
        const cursor = !this.isComplete ? html`<span class="ml-2 w-3 h-3 inline-block rounded-full bg-[#ccccc] dark:bg-[#f0f0f0]"></span>` : nothing;
        const markdown = DOMPurify.sanitize(marked.parse(this.text.trim()) as string);
        const debugQuery = this.debug?.query;
        const debugRagHistory = this.debug?.ragHistory;
        const debugRagQuery = this.debug?.ragQuery;
        const debugMessages = this.debug?.submittedMessages;
        const debugResponse = this.debug?.response;
        const debugTokens = (this.debug?.tokensIn ?? 0) + (this.debug?.tokensOut ?? 0);

        // prettier-ignore
        return html`<div class="flex w-full max-w-full px-4 gap-4">
            <div
                class="flex-shrink-0 w-6 h-6 rounded-full dark:border dark:border-muted-fg flex items-center justify-center text-white text-sm"
                style="background-color: ${color};"
            >
                <span>D</span>
            </div>
            <div class="overflow-auto flex-1 flex flex-col">
                <div class="font-semibold">Doxie</div>
                <div class="gpt-reply w-full">${unsafeHTML(markdown)}${cursor}</div>
                ${this.error
                    ? html`<div class="bg-red-500 w-full flex items-center px-4 py-2 text-[#fff] gap-2 rounded-md">${this.error}</div>`
                    : nothing}
                    ${debugQuery ? html`
                    <div class="debug hljs p-4 w-full flex flex-col mt-2">
                        <span class="text-sm font-semibold">User query</span>
                        <pre><code>${debugQuery}</code></pre>
                    </div>`: nothing}
                    ${debugRagHistory ? html`
                    <div class="debug hljs p-4 w-full flex flex-col mt-2">
                        <span class="text-sm font-semibold">RAG history</span>
                        <pre><code>${debugRagHistory}</code></pre>
                    </div>`: nothing}
                ${debugRagQuery ? html`
                    <div class="debug hljs p-4 w-full flex flex-col mt-2">
                        <span class="text-sm font-semibold">RAG query</span>
                        <pre><code>${debugRagQuery}</code></pre>
                    </div>`: nothing}
                ${debugMessages && debugResponse? html`
                    <div class="debug hljs p-4 w-full flex flex-col mt-2">
                        <span class="text-sm font-semibold">Request/Response</span>
                        <pre class="whitespace-pre-wrap"><code>${map(debugMessages, (msg) => html`<b class="text-green-400">${msg.role}</b>\n${msg.content}\n`)}\n\n<b class="text-green-400">response</b>\n${debugResponse}</code></pre>
                    </div>`: nothing}
                    ${debugTokens > 0 ? html`
                    <div class="debug hljs p-4 w-full flex flex-col mt-2">
                        <span class="text-sm font-semibold">Tokens</span>
                        <pre class="whitespace-pre-wrap"><code class="text-blue-400">${this.debug?.tokensIn} in, ${this.debug?.tokensOut} out, ${debugTokens} total</code></pre>
                    </div>`: nothing}
                </div>
            </div>
        </div>`;
    }
}

@customElement("chat-page")
export class ChatPage extends BaseElement {
    @state()
    isConnecting = true;

    @state()
    isWaitingForResponse = false;

    @state()
    error?: string;

    @state()
    text = "";

    sessionId?: string;

    constructor() {
        super();
    }

    async connect() {
        try {
            const collection = router.getCurrentParams()?.get("collection") ?? "berufslexikon";
            const sessionId = await Api.createSession(collection);
            if (!sessionId.success) {
                this.addMessage({ role: "error", text: "Could not create chat session. Try again later" });
                return;
            }
            this.addMessage({ role: "doxie", text: "How can I assist you today?" });
            this.sessionId = sessionId.data.sessionId;
        } finally {
            this.isConnecting = false;
        }
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.connect();
    }

    render() {
        const canSend = this.text.trim().length > 0 && !this.isWaitingForResponse;

        return html`<main class="w-screen max-h-screen h-screen overflow-auto flex flex-col">
            <div id="scrollContainer" class="flex-1 w-full flex flex-col items-center overflow-auto">
                <div class="sticky top-0 flex items-center justify-between z-10 h-14 w-full max-w-[640px] p-2 font-semibold bg-background">
                    <span class="text-lg pl-2">Doxie</span>
                    <theme-toggle class="ml-auto"></theme-toggle>
                </div>
                ${this.isConnecting ? html`<div>Connecting</div>` : nothing}
                <div id="messages" class="w-full flex flex-col items-center">
                </div>
                <div id="sentinel" class="min-h-4"></div>
            </div>
            <div class="bg-background w-full flex flex-col pb-2 px-4 justify-center items-center">
                <div class="flex items-center border border-divider rounded-[16px] py-2 px-4 mx-4 w-full max-w-[640px]">
                    <textarea
                        id="editor"
                        @keydown=${(ev: KeyboardEvent) => this.handleKeyDown(ev)}
                        @input=${(ev: InputEvent) => this.handleInput(ev)}
                        class="flex-grow bg-transparent outline-none resize-none leading-tight"
                        rows="1"
                    ></textarea>
                    <button ?disabled=${!canSend} @click=${() => this.complete()}><i class="icon w-6 h-6 ${
            !canSend ? "text-muted-fg" : ""
        }">${sendIcon}</i></button>
                </div>
                <div class="flex text-xs items-center justify-center gap-4 mt-2 text-muted-fg">
                    <a href="/privacy">Privacy & Imprint</a>
                    <span>|</span>
                    <span>By <a href="https://twitter.com/badlogicgames">Mario Zechner</a>
                </div>
            </div>
        </main>`;
    }

    addMessage(message: Message) {
        const messagesDiv = this.querySelector<HTMLDivElement>("#messages")!;
        messagesDiv.append(dom(html`<chat-message class="w-full max-w-[640px] mt-4" .message=${message}></chat-message>`)[0]);
    }

    handleKeyDown(ev: KeyboardEvent) {
        if (ev.key === "Enter" && !ev.shiftKey) {
            ev.preventDefault();
            ev.stopPropagation();
            this.complete();
        }
    }

    handleInput(ev: InputEvent) {
        const editor = this.querySelector<HTMLTextAreaElement>("#editor")!;
        editor.style.height = "auto";
        editor.style.height = Math.min(16 * 15, editor.scrollHeight) + "px";
        this.text = editor.value;
    }

    complete() {
        if (this.isWaitingForResponse) return;
        const editor = this.querySelector<HTMLTextAreaElement>("#editor")!;
        editor.value = "";
        editor.style.height = "auto";
        editor.style.height = Math.min(16 * 15, editor.scrollHeight) + "px";

        this.addMessage({ role: "user", text: this.text });

        const messagesDiv = this.querySelector<HTMLDivElement>("#messages")!;
        const scrollParent = getScrollParent(messagesDiv)!;
        this.isWaitingForResponse = true;
        let lastScrollTop = -1;
        let userScrolledUp = false;
        const scrolledUp = (ev: Event) => {
            if (scrollParent.scrollTop < lastScrollTop) {
                userScrolledUp = true;
            }
            lastScrollTop = scrollParent.scrollTop;
            console.log(ev);
        };
        scrollParent.addEventListener("scroll", scrolledUp);
        const scrollToBottom = () => {
            scrollParent.scrollTop = scrollParent.scrollHeight;
            if (!this.isWaitingForResponse || userScrolledUp) {
                queueMicrotask(() => {
                    const scrollParent = getScrollParent(messagesDiv)!;
                    scrollParent.scrollTop = scrollParent.scrollHeight;
                });
                return;
            }
            requestAnimationFrame(scrollToBottom);
        };
        scrollToBottom();
        messagesDiv.append(
            dom(
                html`<chat-gpt-reply
                    class="w-full max-w-[640px] mt-4"
                    .sessionId=${this.sessionId}
                    .query=${this.text}
                    .completeCb=${() => {
                        this.isWaitingForResponse = false;
                        scrollParent.removeEventListener("scroll", scrolledUp);
                    }}
                ></chat-gpt-reply>`
            )[0]
        );

        this.text = "";
    }
}
