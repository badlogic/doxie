import * as DOMPurify from "dompurify";
import { PropertyValueMap, html, nothing } from "lit";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { customElement, property, state } from "lit/decorators.js";
import { Marked } from "marked";
import { BaseElement, dom, getScrollParent, renderError } from "../app";
import { Api, ChatSession, Collection, CompletionDebug, ChatMessage } from "../common/api";
import { sendIcon } from "../utils/icons";
import { router } from "../utils/routing";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import { map } from "lit/directives/map.js";
import { Store } from "../utils/store";

export const chatDefaultCss = `
:root {
    --background: #fff;
	--muted-fg: #6b7280;
	color: #111;
}

/* Dark colors */
.dark {
    --background: #111;
	--muted-fg: #9ca3af;
	color: rgb(221, 221, 221);
}

.chat {
}

.chat a {
	color: rgb(59, 130, 246);
}

.chat-topbar {
    background-color: var(--background);
}

.chat-message-user {
}

.chat-message-bot {
}

.chat-icon-img, .chat-icon-noimg {
    width: 2em;
    height: 2em;
    border-radius: 9999px;
}

.chat-message-bot .chat-icon-noimg {
    background-color: #ab68ff;
}

.chat-message-user .chat-icon-noimg {
    background-color: #512da8;
}

.chat-message-name {
	font-weight: 600;
}

.chat-message-text {
}

.chat-bottombar {
    background-color: var(--background);
}

.chat-input {
    background: none;
}

.chat-footer {
	font-size: 0.75rem;
	line-height: 1rem;
	color: var(--muted-fg);
}
`;

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
export class ChatMessageElement extends BaseElement {
    @property()
    botName = "Doxie";

    @property()
    botIcon?: string;

    @property()
    message?: Message;

    render() {
        if (this.message?.role == "error") {
            return html`<div>${renderError(this.message.text)}</div>`;
        }

        const role = this.message?.role;
        const text = this.message?.text ?? "";
        const markdown = DOMPurify.sanitize(marked.parse(text) as string);
        const name = this.message?.role == "doxie" ? this.botName : "You";
        const botIcon = this.message?.role == "doxie" ? this.botIcon : undefined;

        return html`<div class="${this.message?.role == "doxie" ? "chat-message-bot" : "chat-message-user"} flex w-full px-4 gap-4">
            ${botIcon
                ? html`<img class="chat-icon-img" src="/files/${botIcon}" />`
                : html`<div class="chat-icon-noimg flex-shrink-0 flex items-center justify-center">
                      <span>${this.botName.charAt(0).toUpperCase()}</span>
                  </div>`}
            <div class="w-full flex flex-col">
                <div class="chat-message-name">${name}</div>
                ${role == "doxie"
                    ? html`<text-typer class="chat-message-text" .text=${markdown}></text-typer>`
                    : html`<div>${unsafeHTML(markdown)}</div>`}
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
    botName = "Doxie";

    @property()
    botIcon?: string;

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
        const collection = router.getCurrentParams()?.get("collection") ?? "";
        const source = router.getCurrentParams()?.get("source");
        if (this.query && this.sessionId) {
            const query = this.query;
            const sessionId = this.sessionId;
            (async () => {
                const result = await Api.complete(sessionId, query, (chunk, type, done) => {
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
        const cursor = !this.isComplete
            ? html`<span
                  class="ml-2 w-3 h-3 inline-block rounded-full bg-black dark:bg-white animate-pulse animate-duration-1000 animate-loop"
              ></span>`
            : nothing;
        const markdown = DOMPurify.sanitize(marked.parse(this.text.trim()) as string);
        const debugQuery = this.debug?.query;
        const debugRagHistory = this.debug?.ragHistory;
        const debugRagQuery = this.debug?.ragQuery;
        const debugMessages = this.debug?.submittedMessages;
        const debugResponse = this.debug?.response;
        const debugTokens = (this.debug?.tokensIn ?? 0) + (this.debug?.tokensOut ?? 0);
        const debugHighlight = (content: string) => {
            const result = content
                .replaceAll(/###context-(\d+)/g, '<b class="text-blue-400">###context-$1</b>')
                .replaceAll(/###question/g, '<b class="text-blue-400">###question</b>')
                .replaceAll(/###summary/g, '<b class="text-blue-400">###summary</b>')
                .replaceAll(/###topicdrift/g, '<b class="text-blue-400">###topicdrift</b>');
            return result;
        };

        // prettier-ignore
        return html`<div class="chat-message-bot flex w-full max-w-full px-4 gap-4">
            ${this.botIcon ? html`<img class="chat-icon-img" src="/files/${this.botIcon}">`: html`<div
                class="chat-icon-noimg flex-shrink-0 flex items-center justify-center"
            >
                <span>${this.botName.charAt(0).toUpperCase()}</span>
            </div>`}
            <div class="overflow-auto flex-1 flex flex-col">
                <div class="chat-message-name">${this.botName}</div>
                <div class="chat-message-text">${unsafeHTML(markdown)}${cursor}</div>
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
                        <pre class="whitespace-pre-wrap"><code>${map(debugMessages, (msg) => html`<b class="text-green-400">${msg.role}</b>\n${unsafeHTML(debugHighlight(msg.content))}\n`)}\n\n<b class="text-green-400">response</b>\n${unsafeHTML(debugHighlight(debugResponse))}</code></pre>
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
    collection?: Collection;
    isReplay = false;
    replayMessages?: ChatMessage[];
    replayIndex = 0;

    constructor() {
        super();
        this.isReplay = location.pathname.startsWith("/replay/");
    }

    async connect() {
        try {
            let replaySession: ChatSession | undefined;
            if (this.isReplay) {
                const sessionId = router.getCurrentParams()?.get("chatsession");
                const session = await Api.getChat(Store.getAdminToken()!, sessionId!);
                if (!session.success) {
                    this.addMessage({ role: "error", text: "Could not create chat session. Try again later" });
                    return;
                }
                replaySession = session.data;
                this.replayMessages = replaySession.rawMessages.filter((message) => message.role == "user");
            }
            const collectionId = replaySession ? replaySession.collectionId : router.getCurrentParams()?.get("collection") ?? "";
            const collection = await Api.getCollection("noauth", collectionId);
            if (!collection.success) {
                this.addMessage({ role: "error", text: "Could not create chat session. Try again later" });
                return;
            }
            this.collection = collection.data;
            const sourceId = replaySession ? replaySession.sourceId : router.getCurrentParams()?.get("session");
            const sessionId = await Api.createSession(collectionId, sourceId);
            if (!sessionId.success) {
                this.addMessage({ role: "error", text: "Could not create chat session. Try again later" });
                return;
            }
            this.addMessage({ role: "doxie", text: this.collection.botWelcome ?? "How can I assist you today?" });
            this.sessionId = sessionId.data.sessionId;
            if (this.isReplay) {
                this.nextReplay();
                window.addEventListener("beforeunload", async () => {
                    await Api.deleteSession(Store.getAdminToken()!, this.sessionId);
                });
            }
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
        const footer = this.isConnecting
            ? ""
            : this.collection?.botFooter ??
              `<a href="/privacy">Privacy & Imprint</a><span>|</span><span>By <a href="https://twitter.com/badlogicgames">Mario Zechner</a>`;
        const botCss = this.collection?.botCss;

        return html`<style>
                ${botCss ?? ""}
            </style>
            <main class="chat w-full h-full overflow-auto flex flex-col">
                <div class="flex-1 w-full flex flex-col items-center">
                    <div class="chat-topbar sticky top-0 flex items-center justify-between z-10 h-10 w-full max-w-[640px] p-2">
                        <theme-toggle class="ml-auto"></theme-toggle>
                    </div>
                    ${this.isConnecting ? html`<div>Connecting</div>` : nothing}
                    <div id="messages" class="w-full flex flex-col items-center"></div>
                    <div id="sentinel" class="min-h-4"></div>
                </div>
                <div class="chat-bottombar w-full flex flex-col pb-2 px-4 justify-center items-center">
                    <div class="flex items-center border border-divider rounded-[16px] py-2 px-4 mx-4 w-full max-w-[640px]">
                        <textarea
                            id="editor"
                            @keydown=${(ev: KeyboardEvent) => this.handleKeyDown(ev)}
                            @input=${(ev: InputEvent) => this.handleInput(ev)}
                            class="chat-input bg-transparent flex-grow outline-none resize-none leading-tight"
                            rows="1"
                        ></textarea>
                        <button ?disabled=${!canSend} @click=${() => this.complete()}>
                            <i class="icon w-6 h-6 ${!canSend ? "text-muted-fg" : ""}">${sendIcon}</i>
                        </button>
                    </div>
                    <div class="chat-footer flex items-center justify-center gap-4 mt-2">${unsafeHTML(footer)}</div>
                </div>
            </main>`;
    }

    addMessage(message: Message) {
        const messagesDiv = this.querySelector<HTMLDivElement>("#messages")!;
        messagesDiv.append(
            dom(
                html`<chat-message
                    class="w-full max-w-[640px] mt-4"
                    .botName=${this.collection?.botName ?? "Doxie"}
                    .botIcon=${this.collection?.botIcon}
                    .message=${message}
                ></chat-message>`
            )[0]
        );
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
        if (!this.isReplay) scrollToBottom();
        messagesDiv.append(
            dom(
                html`<chat-gpt-reply
                    class="w-full max-w-[640px] mt-4"
                    .sessionId=${this.sessionId}
                    .botName=${this.collection?.botName ?? "Doxie"}
                    .botIcon=${this.collection?.botIcon}
                    .query=${this.text}
                    .completeCb=${() => {
                        this.isWaitingForResponse = false;
                        scrollParent.removeEventListener("scroll", scrolledUp);
                        if (this.isReplay) this.nextReplay();
                    }}
                ></chat-gpt-reply>`
            )[0]
        );

        this.text = "";
    }

    nextReplay() {
        if (!this.isReplay) return;
        if (!this.replayMessages) return;
        if (this.replayIndex == this.replayMessages?.length) return;
        const message = this.replayMessages[this.replayIndex++];
        this.text = message.content + (this.replayIndex == 1 ? "###debug" : "");
        this.querySelector<HTMLTextAreaElement>("#editor")!.value = this.text;
        this.complete();
    }
}
