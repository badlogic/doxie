import { TemplateResult } from "lit";
import { Key, pathToRegexp } from "path-to-regexp";
import { StreamView } from "./streamviews.js";
import { dom, getScrollParent } from "./ui-components.js";

export class Route<T extends HTMLElement> {
    readonly regexp: RegExp;
    readonly keys: Key[] = [];

    constructor(
        readonly path: string,
        readonly renderPage: () => TemplateResult | T,
        readonly title: () => string,
        readonly requiresAuth = false,
        readonly removePage = true
    ) {
        this.regexp = pathToRegexp(this.path, this.keys);
    }
}

export type RouterPage = { route: Route<any>; path: string; page: HTMLElement; srcollTop: number; display: string };

export class Router {
    pageStack: RouterPage[] = [];
    routes: Route<any>[] = [];
    authProvider = () => true;
    rootRoute = "/";
    notFoundRoot = "/404";
    currPage = 0;
    modals: HTMLElement[] = [];
    outlet = document.body;
    listeners: ((pathname: string) => void)[] = [];

    constructor() {
        window.addEventListener("popstate", (ev) => this.handleNavigation(ev));
        this.currPage = history.state?.page ?? 0;
    }

    setAuthProvider(authProvider: () => boolean) {
        this.authProvider = authProvider;
    }

    setRootRoute(path: string) {
        if (!this.matchRoute(path)) throw new Error("No Route defined for path " + path);
        this.rootRoute = path;
    }

    setNotFoundRoot(path: string) {
        if (!this.matchRoute(path)) throw new Error("No Route defined for path " + path);
        this.notFoundRoot = path;
    }

    addRoute<T extends HTMLElement>(
        path: string,
        renderPage: () => TemplateResult | T,
        title: () => string,
        requiresAuth: boolean = false,
        removePage = true
    ) {
        const route = new Route(path, renderPage, title, requiresAuth, removePage);
        if (this.routes.some((other) => other.path == route.path)) throw new Error(`Route ${route.path}} already defined`);
        this.routes.push(route);
    }

    replace(path: string) {
        const page = this.pageStack.pop();
        page?.page.remove();
        if (this.navigateTo(path)) {
            history.replaceState({ page: history.state?.page ?? this.pageStack.length }, "", path);
            this.notifyListeners(path);
        } else {
            history.replaceState({ page: history.state?.page ?? this.pageStack.length }, "", this.rootRoute);
            this.notifyListeners(this.rootRoute);
        }
    }

    replaceUrl(path: string) {
        history.replaceState({ page: history.state?.page ?? this.pageStack.length }, "", path);
    }

    push(path: string) {
        if (location.pathname == path) return;
        history.pushState({ page: this.pageStack.length + 1 }, "", path);
        const route = this.matchRoute(path);
        if (!route) {
            this.navigateTo("/404");
        } else {
            this.navigateTo(path);
        }
        this.currPage++;
        this.notifyListeners(path);
    }

    pushModal(modal: HTMLElement) {
        this.modals.push(modal);
        this.currPage++;
        this.outlet.append(modal);
        history.pushState({ page: this.pageStack.length + 1 }, "", location.href);
    }

    pop() {
        this.currPage--;
        history.back();
    }

    popAll(path: string) {
        if (this.pageStack.length == 0) {
            this.currPage = 1;
            this.replace(path);
            return;
        }

        this.disableNavigation = true;
        while (this.pageStack.length > 0) {
            this.pageStack.pop()?.page.remove();
        }
        const popState = () => {
            if (history.state && history.state.page == 1) {
                window.removeEventListener("popstate", popState);
                this.replace(path);
                this.currPage = 1;
                this.disableNavigation = false;
            } else {
                history.back();
            }
        };
        window.addEventListener("popstate", popState);
        if (history.state?.page == 1) {
            this.replace(path);
            this.currPage = 1;
            this.disableNavigation = false;
        } else {
            history.back();
        }
    }

    top() {
        return this.pageStack.length > 0 ? this.pageStack[this.pageStack.length - 1] : undefined;
    }

    setOutlet(outlet: HTMLElement) {
        this.outlet = outlet;
    }

    private notifyListeners(pathname: string) {
        for (const listener of this.listeners) {
            listener(pathname);
        }
    }

    private savePage(page: RouterPage) {
        if (page.page.style.display == "none") return;
        page.srcollTop = getScrollParent(this.outlet)!.scrollTop;
        page.display = page.page.style.display;
        const streamViews = Array.from(page.page.querySelectorAll("*")).filter((el) => el instanceof StreamView) as StreamView<any>[];
        for (const streamView of streamViews) streamView.disableIntersector = true;
        // page.page.style.display = "none";
        page.page.remove();
    }

    private restorePage(page: RouterPage) {
        this.pageStack = this.pageStack.filter((other) => other != page);
        this.pageStack.push(page);
        this.outlet.append(page.page);
        const streamViews = Array.from(page.page.querySelectorAll("*")).filter((el) => el instanceof StreamView) as StreamView<any>[];
        for (const streamView of streamViews) streamView.disableIntersector = false;
        // page.page.style.display = page.display;
        queueMicrotask(() => (getScrollParent(this.outlet)!.scrollTop = page.srcollTop));
    }

    private navigateTo(path: string) {
        const route = this.matchRoute(path);

        if (!route) {
            this.navigateTo("/404");
            return false;
        }

        if (route.route.requiresAuth && !this.authProvider()) {
            this.navigateTo(this.rootRoute);
            return false;
        }

        document.title = route?.route.title();

        if (this.top()) this.savePage(this.top()!);
        const matchingPage = this.pageStack.find((page) => page.path == path);
        if (matchingPage) {
            this.restorePage(matchingPage);
        } else {
            const page = route.route.renderPage();
            const pageDom = page instanceof HTMLElement ? page : dom(page)[0];
            getScrollParent(this.outlet)!.scrollTop = 0;
            this.pageStack.push({ route: route.route, path, page: pageDom, srcollTop: 0, display: pageDom.style.display });
            this.outlet.append(pageDom);
        }
        return true;
    }

    disableNavigation = false;
    private handleNavigation(ev: PopStateEvent) {
        if (this.disableNavigation) return;
        if (this.modals.length > 0) {
            const modal = this.modals.pop()!;
            modal.remove();
            this.currPage = ev.state.page;
            return;
        }
        if (ev.state.page > this.currPage || !ev.state) {
            this.currPage = ev.state.page;
            // Forward
            const route = this.matchRoute(location.pathname);
            if (!route) {
                this.navigateTo("/404");
                this.notifyListeners("/404");
                return;
            }
            if ((route.route.requiresAuth && !this.authProvider()) || (!this.authProvider() && ev.state.page > 1)) {
                this.popAll(this.rootRoute);
            } else {
                this.navigateTo(location.pathname + location.search + location.hash);
                this.notifyListeners(location.pathname);
            }
        } else {
            this.currPage = ev.state.page;
            // Backward
            const page = this.pageStack.pop();
            if (page) {
                if (page.route.removePage) {
                    page.page.remove();
                } else {
                    page.page.remove();
                    this.pageStack.push(page);
                }
            }
            queueMicrotask(() => {
                this.navigateTo(location.pathname);
                this.notifyListeners(location.pathname);
            });
        }
    }

    private matchRoute(path: string) {
        path = path.startsWith("http") ? new URL(path).pathname : new URL("https://foo.bar" + path).pathname;
        for (const route of this.routes) {
            const match = route.regexp.exec(path);
            if (match) {
                const params: any = {};
                route.keys.forEach((key: Key, index) => {
                    params[key.name] = match[index + 1];
                });
                return { route, params };
            }
        }
        return null;
    }

    getCurrentParams() {
        const path = new URL(location.href).pathname;
        for (const route of this.routes) {
            const match = route.regexp.exec(path);
            if (match) {
                const params = new Map<string, string>();
                route.keys.forEach((key: Key, index) => {
                    params.set(key.name.toString(), match[index + 1]);
                });
                return params;
            }
        }
        return undefined;
    }
}

export const router = new Router();
