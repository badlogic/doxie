import { customElement, property, state } from "lit/decorators.js";
import { BaseElement } from "../app";
import { PropertyValueMap, html, nothing } from "lit";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";

@customElement("text-typer")
export class TextTyper extends BaseElement {
    @property()
    text = "";

    @property()
    charactersPerSecond = 250;

    @state()
    typedText = "";

    @state()
    stopped = false;

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        const delay = 1000 / this.charactersPerSecond;
        let offset = 0;
        const type = () => {
            if (this.typedText == this.text || this.stopped) return;
            this.typedText += this.text.charAt(offset++);
            setTimeout(type, delay);
        };
        type();
    }

    render() {
        const complete = this.typedText == this.text || this.stopped;
        // prettier-ignore
        return html` <div class="whitespace-pre-wrap break-words">${unsafeHTML(this.typedText.trim())}${!complete ? html`<span class="ml-2 w-3 h-3 inline-block rounded-full bg-black dark:bg-white animate-pulse animate-duration-1000 animate-loop"></span>` : nothing}</div>`;
    }
}
