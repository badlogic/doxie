import { LitElement, html, render } from "lit";
import { closeButton, renderTopbar } from "../app.js";
import { customElement } from "lit/decorators.js";
import { pageContainerStyle, pageContentStyle } from "../utils/styles.js";

@customElement("settings-page")
export class SettingsPage extends LitElement {
    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<div class="${pageContainerStyle}">
            ${renderTopbar("Settings", closeButton())}
            <div class="${pageContentStyle} px-4">
                <theme-toggle class="self-start"></theme-toggle>
                <div class="w-[1000px] h-[600px] bg-red-500"></div>
                <div class="w-[1000px] h-[600px] bg-green-500"></div>
                <div class="w-[1000px] h-[600px] bg-blue-500"></div>
                <div class="w-[1000px] h-[600px] bg-yellow-500"></div>
            </div>
        </div>`;
    }
}
