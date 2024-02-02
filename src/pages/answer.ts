import { customElement, state } from "lit/decorators.js";
import { BaseElement, closeButton, renderCompletionDebug, renderError, renderTopbar } from "../app";
import { pageContainerStyle, pageContentStyle } from "../utils/styles";
import { PropertyValueMap, html, nothing } from "lit";
import { i18n } from "../utils/i18n";
import { Api, Bot, CompletionDebug, Source } from "../common/api";
import { router } from "../utils/routing";
import { Store } from "../utils/store";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { map } from "lit/directives/map.js";

@customElement("answer-page")
export class AnswerPage extends BaseElement {
    @state()
    isLoading = true;

    @state()
    isAnswering = false;

    @state()
    answer?: { answer: string; debug: CompletionDebug };

    @state()
    error?: string;

    bot?: Bot;
    sources: Source[] = [];
    selectedSources = new Set<string>();

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    async load() {
        try {
            const botId = router.getCurrentParams()?.get("bot");
            if (!botId) throw new Error();
            const bot = await Api.getBot(Store.getAdminToken()!, botId);
            if (!bot.success) {
                throw new Error();
            } else {
                this.bot = bot.data;
            }
            const sources = await Api.getSources(Store.getAdminToken()!);
            if (!sources.success) {
                throw new Error();
            } else {
                this.sources = sources.data;
            }
            this.selectedSources = new Set<string>(this.bot.sources);
        } catch (e) {
            this.error = i18n("Could not load bot");
        } finally {
            this.isLoading = false;
        }
    }

    render() {
        if (this.error) {
            return html`<div class="${pageContainerStyle}">
                <div class="${pageContentStyle} px-4 gap-4">${renderError(this.error)}</div>
            </div>`;
        }

        const topBar = renderTopbar(i18n("Answer"), closeButton());
        if (this.isLoading) {
            return html`<div class="${pageContainerStyle}">
                ${topBar}
                <div class="${pageContentStyle} px-4 gap-4">
                    <loading-spinner></loading-spinner>
                </div>
            </div>`;
        }

        const botAnswer = this.answer ? this.answer.answer : "";
        const answer = DOMPurify.sanitize(marked.parse(botAnswer) as string);
        return html`<div class="${pageContainerStyle}">
            ${topBar}
            <style>
                a {
                    color: rgb(59, 130, 246);
                }
            </style>
            <div class="${pageContentStyle} px-4 gap-4">
                <span>Bot: ${this.bot?.name}</span>
                <div class="flex gap-4">
                    ${map(
                        this.sources,
                        (source) =>
                            html`<label class="flex gap-2"
                                ><input
                                    type="checkbox"
                                    ?checked=${this.selectedSources.has(source._id!)}
                                    @change=${(ev: Event) => this.handleSourceChange(source, ev)}
                                />${source.name}</label
                            >`
                    )}
                </div>
                <textarea id="question" class="textfield" rows="10" placeholder="${i18n("Question")}" ?disabled=${this.isAnswering}></textarea>
                <button class="button self-end" @click=${() => this.handleAnswer()} ?disabled=${this.isAnswering}>${i18n("Answer")}</button>
                ${this.answer ? html`<span class="font-semibold">${i18n("Answer")}</span>` : nothing}
                ${this.isAnswering ? html`<loading-spinner></loading-spinner>` : nothing}
                <div id="answer">${unsafeHTML(answer)}</div>
                ${this.answer ? renderCompletionDebug(this.answer.debug) : nothing}
            </div>
        </div>`;
    }

    handleSourceChange(source: Source, ev: Event) {
        const target = ev.target as HTMLInputElement;
        if (target.checked) {
            this.selectedSources.add(source._id!);
        } else {
            this.selectedSources.delete(source._id!);
        }
    }

    async handleAnswer() {
        this.isAnswering = true;
        this.answer = undefined;
        this.requestUpdate();
        try {
            const question = this.querySelector<HTMLTextAreaElement>("#question")!.value.trim();
            const response = await Api.answer(this.bot?._id!, question, Array.from(this.selectedSources.values()));
            if (!response.success) throw new Error();
            this.answer = response.data;
        } catch (e) {
            this.error = i18n("Could not get answer");
        } finally {
            this.isAnswering = false;
        }
    }
}
