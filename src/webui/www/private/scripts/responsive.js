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

    // the same breakpoints as responsive.css
    const queries = Object.freeze({
        phone: window.matchMedia("(width < 760px)"),
        drawer: window.matchMedia("(width < 1100px)"),
        relayout: window.matchMedia("(pointer: coarse), (width < 1100px)"),
        small: window.matchMedia("(width < 760px), (pointer: coarse) and (height < 620px)"),
        coarse: window.matchMedia("(pointer: coarse)")
    });

    const root = document.documentElement;
    const localPreferences = new window.qBittorrent.LocalPreferences.LocalPreferences();

    const cssLength = (name) => Number.parseFloat(getComputedStyle(root).getPropertyValue(name));

    const frameDocuments = new Set();

    const setClasses = (doc) => {
        doc.documentElement.classList.toggle("responsivePhone", queries.phone.matches);
        doc.documentElement.classList.toggle("responsiveRelayout", queries.relayout.matches);
    };

    // called by color-scheme.js in dialog frames
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

    const focusableSelector = "a[href], button:not([disabled]), input:not([disabled], [type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    // keep the focus inside an open drawer
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

    // make a drawer's items reachable with Tab while it is open
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

    // on small screens, the properties panel shrinks until the list has this share of the page
    const MIN_TRANSFER_LIST_SHARE = 0.45;
    const MIN_PROPERTIES_HEIGHT = 60;

    const fitPropertiesPanel = () => {
        const mainColumn = document.getElementById("mainColumn");
        const list = document.getElementById("transferList");
        const properties = document.getElementById("propertiesPanel");
        if (!queries.small.matches)
            return false;

        // hidden or collapsed
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

    // leaving the small layout restores the panel height the user set
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

    // Mocha relayouts only when the browser window is resized
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
        // the filter lists are rebuilt as torrents change
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
        button.setAttribute("aria-controls", "filtersColumn");
        button.addEventListener("click", (_event) => openFiltersDrawer());
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

        // the button moves to the menubar while the toolbar is hidden
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

    // the virtual list's row height for dynamicTable.js, or undefined for its own
    const rowHeight = (table) => {
        if (queries.coarse.matches)
            return cssLength("--responsive-touch-row-height");
        return undefined;
    };

    // keep the first visible row in view while row heights change
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
        if (table.useVirtualList)
            table.rerender();
        shownRowHeight = measureRowHeight(table);
        scrollToFirstRow();
    };

    let mochaTitleHeights = null;

    // new windows take their title bar height from responsive.css
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

    const initWindows = () => {
        const windowObserver = new MutationObserver((mutations) => {
            if (mutations.some((mutation) => [...mutation.addedNodes].some((node) => node.classList?.contains("mocha"))))
                closeFiltersDrawer();
        });
        for (const container of new Set([document.getElementById("desktop"), document.body]))
            windowObserver.observe(container, { childList: true });
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
