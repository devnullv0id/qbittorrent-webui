/*
 * Bittorrent Client using Qt and libtorrent.
 * Copyright (C) 2026  qBittorrent project
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 *
 * In addition, as a special exception, the copyright holders give permission to
 * link this program with the OpenSSL project's "OpenSSL" library (or with
 * modified versions of it that use the same license as the "OpenSSL" library),
 * and distribute the linked executables. You must obey the GNU General Public
 * License in all respects for all of the code used other than "OpenSSL".  If you
 * modify file(s), you may extend this exception to your version of the file(s),
 * but you are not obligated to do so. If you do not wish to do so, delete this
 * exception statement from your version.
 */

"use strict";

// Behavior of the responsive layout that CSS can't provide
window.qBittorrent ??= {};
window.qBittorrent.Responsive ??= (() => {
    const exports = () => {
        return {
            init: init,
            queries: queries,
            addFrame: addFrame,
            rowHeight: rowHeight
        };
    };

    // the screens the layout changes for, as in responsive.css
    const queries = Object.freeze({
        // phones: the menus in a drawer, torrents as cards, windows that fill the screen
        phone: window.matchMedia("(width < 760px)"),
        // the filters in a drawer
        drawer: window.matchMedia("(width < 1100px)"),
        // touch screens and narrower screens, where windows are fitted to their page and pages are laid out anew
        relayout: window.matchMedia("(pointer: coarse), (width < 1100px)"),
        // phones and short touch screens, where the list needs the room: the header slides away and the properties
        // panel gives way
        small: window.matchMedia("(width < 760px), (pointer: coarse) and (height < 620px)"),
        // touch screens: controls of a touch's size
        coarse: window.matchMedia("(pointer: coarse)")
    });

    // the screen's size is the root's: on phones content wider than the screen also widens window.innerWidth and
    // window.innerHeight
    const root = document.documentElement;
    const localPreferences = new window.qBittorrent.LocalPreferences.LocalPreferences();

    // a length responsive.css sets on the root, in pixels
    const cssLength = (name) => Number.parseFloat(getComputedStyle(root).getPropertyValue(name));

    /* Pages */

    // the main page and every dialog frame carry the main window's queries as classes: a frame is narrower than the
    // screen its window is on
    const frameDocuments = new Set();

    const setClasses = (doc) => {
        doc.documentElement.classList.toggle("responsivePhone", queries.phone.matches);
        doc.documentElement.classList.toggle("responsiveRelayout", queries.relayout.matches);
    };

    // called by a dialog frame's color-scheme.js: responsive.css follows the frame's own stylesheets
    const addFrame = (doc) => {
        const stylesheet = doc.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.type = "text/css";
        stylesheet.href = document.getElementById("responsiveStylesheet").href;
        doc.head.append(stylesheet);
        setClasses(doc);
        frameDocuments.add(doc);
        doc.defaultView.addEventListener("pagehide", (_event) => frameDocuments.delete(doc));
    };

    for (const query of [queries.phone, queries.relayout]) {
        query.addEventListener("change", (_event) => {
            setClasses(document);
            for (const doc of frameDocuments)
                setClasses(doc);
        });
    }
    setClasses(document);

    const addScrim = (onClick) => {
        const scrim = document.createElement("div");
        scrim.className = "responsiveScrim";
        scrim.addEventListener("click", (_event) => onClick());
        document.body.append(scrim);
        return scrim;
    };

    // client.js builds the transfer list after this script starts
    const whenElement = (id) => new Promise((resolve) => {
        const found = document.getElementById(id);
        if (found !== null) {
            resolve(found);
            return;
        }
        const observer = new MutationObserver(() => {
            const element = document.getElementById(id);
            if (element === null)
                return;

            observer.disconnect();
            resolve(element);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });

    /* Focus */

    // the focus stays in an open drawer
    const focusableSelector = "a[href], button:not([disabled]), input:not([disabled], [type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const trapFocus = (container) => {
        const returnTo = document.activeElement;
        const focusable = () => [...container.querySelectorAll(focusableSelector)].filter((element) => element.getClientRects().length > 0);
        const first = focusable()[0];
        if (first !== undefined) {
            first.focus();
        }
        else {
            container.tabIndex = -1;
            container.focus();
        }
        const onKeyDown = (event) => {
            if (event.key !== "Tab")
                return;

            const items = focusable();
            if (items.length === 0) {
                event.preventDefault();
                return;
            }
            const index = items.indexOf(document.activeElement);
            if (event.shiftKey && (index <= 0)) {
                event.preventDefault();
                items.at(-1).focus();
            }
            else if (!event.shiftKey && ((index === -1) || (index === (items.length - 1)))) {
                event.preventDefault();
                items[0].focus();
            }
        };

        const listening = new AbortController();
        document.addEventListener("keydown", ((event) => onKeyDown(event)), { capture: true, signal: listening.signal });
        return () => {
            listening.abort();
            if (returnTo?.isConnected)
                returnTo.focus();
        };
    };

    // while a drawer is open, its items can be reached with Tab and chosen with Enter or Space, as buttons can
    const setKeyboardItems = (container, selector, on) => {
        for (const item of container.querySelectorAll(selector)) {
            if (on)
                item.tabIndex = 0;
            else
                item.removeAttribute("tabindex");
        }
    };

    const chooseWithKeys = (container, selector) => {
        container.addEventListener("keydown", (event) => {
            switch (event.key) {
                case "Enter":
                case " ":
                    if (!event.target.matches(selector) || !event.target.hasAttribute("tabindex"))
                        break;

                    event.preventDefault();
                    event.target.click();
                    break;
            }
        });
    };

    /* Main window layout */

    // on phones and short touch screens the properties panel gives way until the list has this share of the page
    const MIN_TRANSFER_LIST_SHARE = 0.45;
    const MIN_PROPERTIES_HEIGHT = 60;

    const fitPropertiesPanel = () => {
        const mainColumn = document.getElementById("mainColumn");
        const list = document.getElementById("transferList");
        const properties = document.getElementById("propertiesPanel");
        if (!queries.small.matches)
            return false;

        // hidden (another tab is shown) or collapsed
        if ((mainColumn.offsetHeight === 0) || (properties.offsetHeight === 0))
            return false;

        const missing = Math.round(mainColumn.offsetHeight * MIN_TRANSFER_LIST_SHARE) - list.offsetHeight;
        if (missing <= 0)
            return false;

        const height = Math.max(MIN_PROPERTIES_HEIGHT, properties.offsetHeight - missing);
        const given = properties.offsetHeight - height;
        if (given <= 0)
            return false;

        // Mocha shares the height in proportion, so set both
        properties.style.height = `${height}px`;
        list.style.height = `${list.offsetHeight + given}px`;
        return true;
    };

    // outside the small layout the panel gets back the share of the page the user gave it, as client.js stores it there
    let restoreProperties = false;

    const restorePropertiesPanel = () => {
        const list = document.getElementById("transferList");
        const properties = document.getElementById("propertiesPanel");
        if ((list === null) || (properties === null) || (properties.offsetHeight === 0))
            return false;

        const share = Number(localPreferences.get("properties_height_rel", 0.5));
        const total = list.offsetHeight + properties.offsetHeight;
        const height = Math.min(Math.round(share * root.clientHeight), total - MIN_PROPERTIES_HEIGHT);
        properties.style.height = `${height}px`;
        list.style.height = `${total - height}px`;
        return true;
    };

    // Mocha lays the page out only as the browser window is resized, not as the header, the status bar or the filters
    // column change size
    const relayout = () => {
        MochaUI.Desktop.setDesktopSize();
        const restore = restoreProperties;
        restoreProperties = false;
        if (restore ? restorePropertiesPanel() : fitPropertiesPanel())
            MochaUI.Desktop.setDesktopSize();
    };

    const initLayout = () => {
        const relayoutSoon = window.qBittorrent.Misc.createDebounceHandler(50, relayout);
        const observer = new ResizeObserver(relayoutSoon);
        observer.observe(document.getElementById("desktopHeader"));
        observer.observe(document.getElementById("desktopFooterWrapper"));
        observer.observe(document.getElementById("filtersColumn"));
        // after Mocha's own resize handling
        window.addEventListener("resize", (_event) => relayoutSoon());
        queries.small.addEventListener("change", (_event) => {
            restoreProperties = !queries.small.matches;
            relayoutSoon();
        });
    };

    /* Filters drawer */

    const filterItems = "ul.filterList span.link";

    let filtersScrim = null;
    let filtersObserver = null;
    let releaseFiltersFocus = null;

    const openFiltersDrawer = () => {
        if (!queries.drawer.matches || root.classList.contains("filtersDrawerOpen"))
            return;

        const column = document.getElementById("filtersColumn");
        const filters = document.getElementById("Filters");
        root.classList.add("filtersDrawerOpen");
        filtersScrim = addScrim(closeFiltersDrawer);
        column.setAttribute("role", "dialog");
        column.setAttribute("aria-modal", "true");
        column.setAttribute("aria-labelledby", "filtersDrawerTitle");
        document.getElementById("filtersButton").setAttribute("aria-expanded", "true");
        setKeyboardItems(filters, filterItems, true);
        // the lists are built anew as the torrents change
        filtersObserver = new MutationObserver(() => setKeyboardItems(filters, filterItems, true));
        filtersObserver.observe(filters, { childList: true, subtree: true });
        releaseFiltersFocus = trapFocus(column);
    };

    const closeFiltersDrawer = () => {
        if (!root.classList.contains("filtersDrawerOpen"))
            return;

        const column = document.getElementById("filtersColumn");
        root.classList.remove("filtersDrawerOpen");
        filtersScrim.remove();
        filtersScrim = null;
        column.removeAttribute("role");
        column.removeAttribute("aria-modal");
        column.removeAttribute("aria-labelledby");
        document.getElementById("filtersButton").setAttribute("aria-expanded", "false");
        filtersObserver.disconnect();
        filtersObserver = null;
        setKeyboardItems(document.getElementById("Filters"), filterItems, false);
        releaseFiltersFocus();
        releaseFiltersFocus = null;
    };

    const initFiltersDrawer = () => {
        const button = document.getElementById("filtersButton");
        const column = document.getElementById("filtersColumn");
        // Mocha creates the column at runtime
        button.setAttribute("aria-controls", "filtersColumn");
        button.addEventListener("click", (_event) => openFiltersDrawer());
        // choosing a filter closes the drawer, as Close does
        column.addEventListener("click", (event) => {
            if (event.target.closest("ul.filterList li, #filtersDrawerClose"))
                closeFiltersDrawer();
        });
        chooseWithKeys(column, filterItems);
        queries.drawer.addEventListener("change", (_event) => {
            if (!queries.drawer.matches)
                closeFiltersDrawer();
        });
        document.addEventListener("keydown", (event) => {
            switch (event.key) {
                case "Escape":
                    closeFiltersDrawer();
                    break;
            }
        });

        // while View > Top Toolbar hides the toolbar, the button waits at the menubar's end
        const toolbar = document.getElementById("mochaToolbar");
        const home = button.parentElement;
        const homeNext = button.nextSibling;
        const placeButton = () => {
            if (toolbar.classList.contains("invisible"))
                document.getElementById("desktopNavbar").append(button);
            else if (button.parentElement !== home)
                home.insertBefore(button, homeNext);
        };
        new MutationObserver(placeButton).observe(toolbar, { attributes: true, attributeFilter: ["class"] });
        placeButton();
    };

    /* Touch sizes */

    // the rows of the virtual list are positioned at this height (dynamicTable.js asks), else undefined
    const rowHeight = (table) => {
        if (queries.coarse.matches)
            return cssLength("--responsive-touch-row-height");
        return undefined;
    };

    // the list keeps its first row in view as its rows change height, also while the page's layout follows the change
    const FIRST_ROW_TIME = 1000;
    let shownRowHeight = null;
    let firstRow = null;

    const measureRowHeight = (table) => {
        if (table.useVirtualList)
            return table.rowHeight;
        return table.tableBody.querySelector("tr")?.offsetHeight || table.rowHeight;
    };

    const scrollToFirstRow = () => {
        if ((firstRow === null) || (performance.now() > firstRow.until)) {
            firstRow = null;
            return;
        }
        window.torrentsTable.dynamicTableDiv.scrollTop = Math.round(firstRow.index * shownRowHeight);
    };

    const keepFirstRow = () => {
        const table = window.torrentsTable;
        if (shownRowHeight === null)
            return;

        firstRow = { index: table.dynamicTableDiv.scrollTop / shownRowHeight, until: performance.now() + FIRST_ROW_TIME };
        // the rows of a list that isn't virtual take their height from responsive.css
        if (table.useVirtualList)
            table.rerender();
        shownRowHeight = measureRowHeight(table);
        scrollToFirstRow();
    };

    // taller title bars on touch screens (responsive.css), as Mocha's height for new windows
    let mochaTitleHeights = null;

    const applyWindowTitleHeight = () => {
        mochaTitleHeights ??= {
            window: MochaUI.Window.prototype.options.headerHeight,
            modal: MochaUI.Modal.prototype.options.headerHeight
        };
        const height = cssLength("--responsive-window-title-height");
        MochaUI.Window.prototype.options.headerHeight = (height > 0) ? height : mochaTitleHeights.window;
        MochaUI.Modal.prototype.options.headerHeight = (height > 0) ? height : mochaTitleHeights.modal;
    };

    const initTouch = async () => {
        applyWindowTitleHeight();
        queries.coarse.addEventListener("change", (_event) => applyWindowTitleHeight());

        const tableDiv = await whenElement("torrentsTableDiv");
        shownRowHeight = measureRowHeight(window.torrentsTable);
        queries.coarse.addEventListener("change", (_event) => keepFirstRow());
        new ResizeObserver(scrollToFirstRow).observe(tableDiv);
    };

    /* Windows */

    // distance from the screen's edges
    const WINDOW_MARGIN = 8;
    const PHONE_WINDOW_MARGIN = 12;

    // resizes like a drag of the edge, without storing the size as the user's
    const setContentSize = (instance, width, height) => {
        const wrapper = instance.contentWrapperEl;
        if ((wrapper.style.width === width) && (wrapper.style.height === height))
            return;

        wrapper.style.width = width;
        wrapper.style.height = height;
        instance.drawWindow();
        // only resizable windows have handles
        if (instance.options.resizable)
            instance.adjustHandles();
        MochaUI.rWidth(wrapper);
        for (const column of wrapper.querySelectorAll(":scope > .column"))
            MochaUI.panelHeight(column);
    };

    // the size a window asks for; an empty width or height fits its content
    const wantedSize = (instance) => {
        const { width, height } = instance.contentWrapperEl.style;
        const fitted = instance.responsiveFittedSize;
        if ((fitted === undefined) || (width !== fitted.width) || (height !== fitted.height))
            instance.responsiveWantedSize = { width: width, height: height };
        return instance.responsiveWantedSize;
    };

    // the largest content size a window has room for on the screen
    const roomOnScreen = (instance) => {
        const wrapper = instance.contentWrapperEl;
        const margin = queries.phone.matches ? PHONE_WINDOW_MARGIN : WINDOW_MARGIN;
        return {
            width: root.clientWidth - (2 * margin) - (instance.windowEl.offsetWidth - wrapper.offsetWidth),
            height: root.clientHeight - (2 * margin) - (instance.windowEl.offsetHeight - wrapper.offsetHeight)
        };
    };

    // what a window's fit follows: the screen, the window's size and its page's size
    const fitState = (instance) => {
        const sizes = [root.clientWidth, root.clientHeight, instance.contentWrapperEl.style.width, instance.contentWrapperEl.style.height];
        const page = [...instance.contentEl.children];
        for (const element of [...page, instance.iframeEl?.contentDocument?.body, instance.toolbarWrapperEl]) {
            if (element)
                sizes.push(element.offsetWidth, element.offsetHeight);
        }
        return sizes.join();
    };

    // fits a window to the screen, and keeps it on it
    const fitWindow = (instance) => {
        const windowEl = instance.windowEl;
        if (!windowEl.isConnected || (windowEl.style.display === "none") || instance.isMaximized)
            return;

        const phone = queries.phone.matches;
        const fullScreen = fitWindowSize(instance, phone);

        // no dragging on phones
        if (phone)
            instance.windowDrag?.detach();
        else
            instance.windowDrag?.attach();

        const margin = fullScreen ? 0 : (phone ? PHONE_WINDOW_MARGIN : WINDOW_MARGIN);
        const wasFullScreen = windowEl.classList.contains("responsiveFullScreen");
        windowEl.classList.toggle("responsiveFullScreen", fullScreen);
        const maxLeft = root.clientWidth - windowEl.offsetWidth - margin;
        const maxTop = root.clientHeight - windowEl.offsetHeight - margin;
        if (fullScreen) {
            windowEl.style.left = "0px";
            windowEl.style.top = "0px";
        }
        // Mocha centers a window at the size it opens with: where windows are fitted, a window is centered again,
        // until the user moves it
        else if (phone || wasFullScreen || (queries.relayout.matches && !instance.responsiveUserMoved)) {
            windowEl.style.left = `${Math.max(margin, Math.round((maxLeft + margin) / 2))}px`;
            windowEl.style.top = `${Math.max(margin, Math.round((maxTop + margin) / 2))}px`;
        }
        else {
            windowEl.style.left = `${Math.max(margin, Math.min(windowEl.offsetLeft, maxLeft))}px`;
            windowEl.style.top = `${Math.max(margin, Math.min(windowEl.offsetTop, maxTop))}px`;
        }
        instance.responsiveFitState = fitState(instance);
    };

    // the size a window asks for, within the screen; on phones it fills the screen, and returns true
    const fitWindowSize = (instance, phone) => {
        const windowEl = instance.windowEl;
        const wrapper = instance.contentWrapperEl;
        // Mocha draws the window around the toolbar's inline height, while touch-sized tabs and tabs that wrap make it
        // taller
        const toolbar = instance.toolbarWrapperEl;
        if (queries.relayout.matches && toolbar && (toolbar.style.height !== `${toolbar.offsetHeight}px`)) {
            toolbar.style.height = `${toolbar.offsetHeight}px`;
            instance.drawWindow();
        }
        const wanted = wantedSize(instance);
        // title bar, toolbar and borders
        const frameWidth = windowEl.offsetWidth - wrapper.offsetWidth;
        const frameHeight = windowEl.offsetHeight - wrapper.offsetHeight;
        // measure the wanted size
        wrapper.style.width = wanted.width;
        wrapper.style.height = wanted.height;
        const wantedWidth = wrapper.offsetWidth;
        const wantedHeight = wrapper.offsetHeight;
        const margin = phone ? PHONE_WINDOW_MARGIN : WINDOW_MARGIN;
        const maxWidth = root.clientWidth - (2 * margin) - frameWidth;
        const maxHeight = root.clientHeight - (2 * margin) - frameHeight;

        let width = phone ? maxWidth : Math.min(maxWidth, wantedWidth);
        let height = Math.min(maxHeight, wantedHeight);
        const fullScreen = phone;
        if (fullScreen) {
            width = root.clientWidth - frameWidth;
            height = root.clientHeight - frameHeight;
        }

        // restore, so the window is only redrawn on a change
        wrapper.style.width = instance.responsiveFittedSize?.width ?? wanted.width;
        wrapper.style.height = instance.responsiveFittedSize?.height ?? wanted.height;
        setContentSize(instance, `${width}px`, `${height}px`);
        instance.responsiveFittedSize = { width: `${width}px`, height: `${height}px` };
        return fullScreen;
    };

    const fitWindows = () => {
        for (const instance of Object.values(MochaUI.Windows.instances))
            fitWindow(instance);
    };

    // a window as it opens: fitted now, and as its page or the screen changes
    const watch = (node) => {
        if (!node.classList?.contains("mocha"))
            return;

        const instance = MochaUI.Windows.instances[node.id];
        if (instance === undefined)
            return;

        // a window opened from the drawer would open behind it
        closeFiltersDrawer();
        fitWindow(instance);

        // the page's own boxes change size as it loads and changes; skipped where nothing a fit follows has changed
        const fitSoon = window.qBittorrent.Misc.createDebounceHandler(50, () => {
            if (fitState(instance) !== instance.responsiveFitState)
                fitWindow(instance);
        });
        const sizeObserver = new ResizeObserver(fitSoon);
        const pageObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const added of mutation.addedNodes) {
                    if (added.nodeType === Node.ELEMENT_NODE)
                        sizeObserver.observe(added);
                }
                for (const removed of mutation.removedNodes) {
                    if (removed.nodeType === Node.ELEMENT_NODE)
                        sizeObserver.unobserve(removed);
                }
            }
            // another page
            instance.responsiveFitState = null;
            fitSoon();
        });
        for (const child of instance.contentEl.children)
            sizeObserver.observe(child);
        pageObserver.observe(instance.contentEl, { childList: true });
        if (instance.toolbarWrapperEl)
            sizeObserver.observe(instance.toolbarWrapperEl);
        instance.addEvent("closeComplete", () => {
            sizeObserver.disconnect();
            pageObserver.disconnect();
        });

        // a size or place the user chose is kept, from the start of the drag
        instance.addEvent("resize", () => {
            instance.responsiveUserResized = true;
        });
        for (const drag of [instance.resizable1, instance.resizable2, instance.resizable3, instance.resizable4, instance.resizable5]) {
            drag?.addEvent("start", () => {
                instance.responsiveUserMoved = true;
            });
        }
        instance.windowDrag?.addEvent("start", () => {
            instance.responsiveUserMoved = true;
        });

        // dialog pages
        const iframe = instance.iframeEl;
        iframe?.addEventListener("load", (event) => {
            fitWindow(instance);
            new iframe.contentWindow.ResizeObserver(fitSoon).observe(iframe.contentDocument.body);
        });
    };

    const initWindows = () => {
        const windowObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes)
                    watch(node);
            }
        });
        for (const container of new Set([document.getElementById("desktop"), document.body]))
            windowObserver.observe(container, { childList: true });
        for (const node of document.querySelectorAll(".mocha"))
            watch(node);

        // after Mocha's own resize handling
        window.addEventListener("resize", window.qBittorrent.Misc.createDebounceHandler(50, fitWindows));
    };

    // called by client.js once the main window is built
    const init = () => {
        initLayout();
        initFiltersDrawer();
        initTouch();
        initWindows();
    };

    return exports();
})();
Object.freeze(window.qBittorrent.Responsive);
