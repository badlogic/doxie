import { customElement, state } from "lit/decorators.js";
import { BaseElement } from "../app";
import { html } from "lit";
import { moonIcon, sunIcon } from "../utils/icons";
import { Theme, Store } from "../utils/store";

@customElement("theme-toggle")
export class ThemeToggle extends BaseElement {
    @state()
    theme: Theme = "dark";

    connectedCallback(): void {
        super.connectedCallback();
        this.theme = Store.getTheme() ?? "dark";
        this.setTheme(this.theme);
    }

    setTheme(theme: Theme) {
        Store.setTheme(theme);
        if (theme == "dark") document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
    }

    toggleTheme() {
        this.theme = this.theme == "dark" ? "light" : "dark";
        this.setTheme(this.theme);
    }

    render() {
        return html`<button class="flex items-center justify-center w-10 h-10" @click=${this.toggleTheme}>
            <i class="icon w-5 h-5">${this.theme == "dark" ? moonIcon : sunIcon}</i>
        </button>`;
    }
}
