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
        if (queries.phone.matches && (table.dynamicTableDivId === "torrentsTableDiv"))
            return cssLength("--responsive-card-height");
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
    // the least width of a window, and the least height of a page that scrolls anyway or fills whatever height it is
    // given
    const MIN_WINDOW_WIDTH = 300;
    const MIN_WINDOW_HEIGHT = 240;
    // the largest a window grows to fit its page
    const MAX_WINDOW_WIDTH = 1200;
    const MAX_WINDOW_HEIGHT = 800;
    // windows whose pages share them and differ in height, as Options' tabs do: they keep the fitted height
    const ONE_SIZE_WINDOWS = new Set(["preferencesPage"]);

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

    // the page of a window: its frame's document, or its content box; null while it loads
    const pageOf = (instance) => {
        const iframe = instance.iframeEl;
        if (iframe) {
            const loading = (iframe.contentDocument?.readyState !== "complete") || (iframe.contentWindow.location.href === "about:blank");
            return loading ? null : iframe.contentDocument.documentElement;
        }
        return (instance.contentEl.childElementCount === 0) ? null : instance.contentWrapperEl;
    };

    // measure(page) at the given size, or null while the page loads; the page is left as it was, scrolled where it was
    const measurePage = (instance, width, height, measure) => {
        const page = pageOf(instance);
        if (page === null)
            return null;

        const box = instance.iframeEl ?? page;
        const scrolled = [box, page, ...page.querySelectorAll("*")]
            .filter((element) => (element.scrollTop > 0) || (element.scrollLeft > 0))
            .map((element) => ({ element: element, top: element.scrollTop, left: element.scrollLeft }));
        const { width: oldWidth, height: oldHeight } = box.style;
        const oldOverflow = [page.style.getPropertyValue("overflow"), page.style.getPropertyPriority("overflow")];
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
        // a scrollbar would narrow the page; also over a stylesheet's !important
        page.style.setProperty("overflow", "hidden", "important");
        const result = measure(page);
        page.style.setProperty("overflow", ...oldOverflow);
        box.style.width = oldWidth;
        box.style.height = oldHeight;
        for (const { element, top, left } of scrolled) {
            element.scrollTop = top;
            element.scrollLeft = left;
        }
        return result;
    };

    // heights of the scrolling boxes and leaf elements
    const contentHeights = (page) => {
        const view = page.ownerDocument.defaultView;
        const heights = [];
        for (const el of page.querySelectorAll("*")) {
            if ((el === page.ownerDocument.body) || ((el.firstElementChild !== null) && !/auto|scroll/.test(view.getComputedStyle(el).overflowY)))
                continue;

            heights.push(el.getBoundingClientRect().height);
        }
        return heights;
    };

    // the bottom padding of a content box the page runs past
    const pageBottomPadding = (instance) => {
        const content = instance.iframeEl ? null : instance.contentEl;
        if ((content === null) || (content.scrollHeight <= content.clientHeight))
            return 0;

        return Number.parseFloat(getComputedStyle(content).paddingBottom) || 0;
    };

    // whether a page takes whatever height it is given (a list or a field that fills the rest) rather than a height of
    // its own: some of its lists or fields grow with the height. Decided once for each page the window loads, or null
    // while it loads
    const pageFills = (instance, width, tallHeight) => {
        if (instance.responsiveFills === undefined) {
            const short = measurePage(instance, width, 1, contentHeights);
            if (short === null)
                return null;

            const tall = measurePage(instance, width, tallHeight, contentHeights);
            instance.responsiveFills = tall.some((height, i) => Math.abs(height - short[i]) > 1);
        }
        return instance.responsiveFills;
    };

    // a page's own height at the given width, 0 if it fills whatever height it is given, or null while it loads
    const pageHeight = (instance, width, tallHeight) => {
        const fills = pageFills(instance, width, tallHeight);
        if (fills === null)
            return null;
        if (fills)
            return 0;

        return measurePage(instance, width, 1, (page) => page.scrollHeight + pageBottomPadding(instance));
    };

    // the size a page needs not to scroll, 0 where it fits
    const pageOverflow = (instance, width, height) => measurePage(instance, width, height, (page) => ({
        width: (page.scrollWidth > page.clientWidth) ? page.scrollWidth : 0,
        height: (page.scrollHeight > page.clientHeight) ? page.scrollHeight : 0
    })) ?? { width: 0, height: 0 };

    // the width a vertical scrollbar takes where it would make the page scroll sideways, else 0 (also where scrollbars
    // are drawn over the page)
    const sidewaysScrollbarWidth = (instance, width, height) => measurePage(instance, width, height, (page) => {
        const fullWidth = page.clientWidth;
        page.style.overflowY = "scroll";
        return (page.scrollWidth > page.clientWidth) ? (fullWidth - page.clientWidth) : 0;
    }) ?? 0;

    // the largest content size a window has room for on the screen
    const roomOnScreen = (instance) => {
        const wrapper = instance.contentWrapperEl;
        const margin = queries.phone.matches ? PHONE_WINDOW_MARGIN : WINDOW_MARGIN;
        return {
            width: root.clientWidth - (2 * margin) - (instance.windowEl.offsetWidth - wrapper.offsetWidth),
            height: root.clientHeight - (2 * margin) - (instance.windowEl.offsetHeight - wrapper.offsetHeight)
        };
    };

    // a drag can't make a window smaller than its page needs or its own limit, unless it already is; the limits are
    // measured as the drag starts
    const limitResize = (instance) => {
        const wrapper = instance.contentWrapperEl;
        const room = roomOnScreen(instance);
        // a page that a fitted window shows whole keeps all of its height, else MIN_WINDOW_HEIGHT of it
        const ownHeight = pageHeight(instance, wrapper.offsetWidth, room.height) ?? 0;
        instance.responsivePageFits = (ownHeight > 0) && (ownHeight <= Math.min(room.height, MAX_WINDOW_HEIGHT));
        const page = {
            width: Math.min(room.width, Math.max(MIN_WINDOW_WIDTH, pageOverflow(instance, MIN_WINDOW_WIDTH, wrapper.offsetHeight).width)),
            height: Math.min(room.height, (instance.responsivePageFits ? ownHeight : MIN_WINDOW_HEIGHT))
        };
        const frameWidth = instance.windowEl.offsetWidth - wrapper.offsetWidth;
        const frameHeight = instance.windowEl.offsetHeight - wrapper.offsetHeight;
        // the limits the window was opened with
        const own = instance.responsiveResizeLimit ??= { x: [...instance.options.resizeLimit.x], y: [...instance.options.resizeLimit.y] };
        const min = {
            width: Math.min(wrapper.offsetWidth, Math.max(page.width, own.x[0] - frameWidth)),
            height: Math.min(wrapper.offsetHeight, Math.max(page.height, own.y[0] - frameHeight))
        };
        instance.options.resizeLimit = { x: [min.width + frameWidth, own.x[1]], y: [min.height + frameHeight, own.y[1]] };
        for (const drag of [instance.resizable2, instance.resizable3, instance.resizable4]) {
            if (drag?.options.limit.x)
                drag.options.limit.x[0] = min.width;
            if (drag?.options.limit.y)
                drag.options.limit.y[0] = min.height;
        }
    };

    // a page the window shows whole needs more height as a drag makes it narrower
    const keepPageHeight = (instance) => {
        if (!instance.responsivePageFits)
            return;

        const wrapper = instance.contentWrapperEl;
        const height = measurePage(instance, wrapper.offsetWidth, 1, (page) => page.scrollHeight + pageBottomPadding(instance)) ?? 0;
        const minHeight = Math.min(roomOnScreen(instance).height, height);
        if (wrapper.offsetHeight >= minHeight)
            return;

        wrapper.style.height = `${minHeight}px`;
        instance.drawWindow();
    };

    // the name a window's size is stored under (saveWindowSize): its id, without the source that Add Torrent adds
    const storageName = (instance) => instance.options.id.split("-", 1)[0];

    // a size stored by an earlier resize
    const hasStoredSize = (instance) => {
        const name = storageName(instance);
        return (localPreferences.get(`window_${name}_width`) !== null) || (localPreferences.get(`window_${name}_height`) !== null);
    };

    // a stored size from before windows kept a minimum can be too small to show the window: it opens at least
    // MIN_WINDOW_WIDTH wide and MIN_WINDOW_HEIGHT high, as the screen allows
    const raiseStoredSize = (instance) => {
        if (!hasStoredSize(instance))
            return;

        const wrapper = instance.contentWrapperEl;
        const room = roomOnScreen(instance);
        const width = Math.max(wrapper.offsetWidth, Math.min(room.width, MIN_WINDOW_WIDTH));
        const height = Math.max(wrapper.offsetHeight, Math.min(room.height, MIN_WINDOW_HEIGHT));
        if ((width !== wrapper.offsetWidth) || (height !== wrapper.offsetHeight))
            setContentSize(instance, `${width}px`, `${height}px`);
    };

    // what a window's fit follows: the screen, the window's size and its page's size
    const fitState = (instance) => {
        const sizes = [root.clientWidth, root.clientHeight, instance.contentWrapperEl.style.width, instance.contentWrapperEl.style.height];
        // the pages that share a window don't change its size
        const page = ONE_SIZE_WINDOWS.has(instance.windowEl.id) ? [] : [...instance.contentEl.children];
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

    // the size a window asks for, as large as its page needs where pages are laid out anew, within the screen;
    // returns whether it fills the screen
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
        const fitWidth = Math.min(maxWidth, MAX_WINDOW_WIDTH);
        const fitHeight = Math.min(maxHeight, MAX_WINDOW_HEIGHT);

        let width = phone ? maxWidth : Math.min(maxWidth, wantedWidth);
        let height = Math.min(maxHeight, wantedHeight);
        // null while unknown: a window the user sized, or a page still loading, isn't taken full screen
        let ownHeight = null;
        // a size the user gave a window, now or before, is kept, except on phones
        const userSized = instance.responsiveUserResized || hasStoredSize(instance);
        if (queries.relayout.matches && (phone || !userSized)) {
            width = phone ? maxWidth : Math.min(fitWidth, Math.max(width, MIN_WINDOW_WIDTH, pageOverflow(instance, width, wantedHeight).width));
            // pages that share one window take all of its fitted height, so it doesn't change from page to page
            if (ONE_SIZE_WINDOWS.has(windowEl.id)) {
                ownHeight = (pageOf(instance) === null) ? null : 0;
                height = fitHeight;
            }
            else {
                ownHeight = pageHeight(instance, width, maxHeight);
                height = Math.min(fitHeight, (ownHeight > 0) ? ownHeight : Math.max(wantedHeight, pageOverflow(instance, width, wantedHeight).height));
            }
            // a page that scrolls keeps its width beside the scrollbar
            if (pageOverflow(instance, width, height).height > 0)
                width = Math.min(fitWidth, width + sidewaysScrollbarWidth(instance, width, height));
        }
        // a phone shows a window whose page fits as a card, else it fills the screen, as it does the pages that share a
        // window (0)
        const fullScreen = phone && (ownHeight !== null) && ((ownHeight === 0) || (ownHeight > fitHeight));
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
        if (queries.relayout.matches)
            raiseStoredSize(instance);
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
            instance.responsiveFills = undefined;
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
            drag?.addEvent("beforeStart", () => {
                if (queries.relayout.matches)
                    limitResize(instance);
            });
        }
        // the edges that change the width
        for (const drag of [instance.resizable2, instance.resizable3, instance.resizable5])
            drag?.addEvent("drag", () => keepPageHeight(instance));
        instance.windowDrag?.addEvent("start", () => {
            instance.responsiveUserMoved = true;
        });

        // dialog pages
        const iframe = instance.iframeEl;
        iframe?.addEventListener("load", (event) => {
            instance.responsiveFills = undefined;
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

    /* View tabs */

    // view tabs that show only their icons on phones are named on hover
    const initViewTabs = () => {
        const name = () => {
            for (const img of document.querySelectorAll("#mainWindowTabsList img")) {
                if (queries.phone.matches)
                    img.parentElement.title = img.alt;
                else
                    img.parentElement.removeAttribute("title");
            }
        };
        queries.phone.addEventListener("change", (_event) => name());
        name();
    };

    /* Header that slides away */

    // a little longer than the slide (responsive.css)
    const SLIDE_TIME = 250;

    // on phones and short touch screens the header slides away once the first torrent has scrolled out of view, unless
    // a field in it has focus
    const initHeaderAutoHide = async () => {
        const header = document.getElementById("desktopHeader");
        const list = await whenElement("torrentsTableDiv");
        let lockedUntil = 0;
        let slideTimer = -1;

        // the page takes the header's room as soon as it has slid
        const endSlide = () => {
            clearTimeout(slideTimer);
            header.classList.remove("sliding");
            header.style.removeProperty("height");
            relayout();
        };

        const setHidden = (hidden) => {
            if (root.classList.contains("headerHidden") === hidden)
                return;

            // slide between fixed heights, as auto can't be animated
            clearTimeout(slideTimer);
            header.classList.add("sliding");
            header.style.height = `${header.offsetHeight}px`;
            void header.offsetHeight;
            root.classList.toggle("headerHidden", hidden);
            if (!hidden)
                header.style.height = `${header.scrollHeight}px`;
            if (getComputedStyle(header).transitionDuration === "0s")
                endSlide();
            else
                slideTimer = setTimeout(endSlide, SLIDE_TIME);
            // ignore the scroll the relayout causes
            lockedUntil = performance.now() + SLIDE_TIME;
        };

        const busy = () => header.contains(document.activeElement) && document.activeElement.matches("input, select");

        // capturing, before the list renders its rows, so nothing has to be laid out again to be read
        list.parentElement.addEventListener("scroll", (event) => {
            if ((event.target !== list) || !queries.small.matches || (performance.now() < lockedUntil))
                return;

            if (list.scrollTop <= window.torrentsTable.rowHeight)
                setHidden(false);
            else if (!root.classList.contains("headerHidden") && !busy() && ((list.scrollHeight - list.clientHeight) > (header.offsetHeight + 24)))
                setHidden(true);
        }, { capture: true, passive: true });
        queries.small.addEventListener("change", (_event) => {
            if (!queries.small.matches)
                setHidden(false);
        });
        header.addEventListener("focusin", (event) => setHidden(false));
    };

    /* Torrent cards on phones */

    // a card's zones (responsive.css): the checkbox at its left and the ⋯ at its top right, or null
    const cardZone = (event) => {
        const tr = queries.phone.matches ? event.target.closest?.("#torrentsTableDiv tbody tr") : null;
        if (!tr)
            return null;

        const point = event.changedTouches?.[0] ?? event;
        const box = tr.getBoundingClientRect();
        if (point.clientX < (box.left + cssLength("--responsive-card-check-width")))
            return "check";
        if ((point.clientX >= (box.right - cssLength("--responsive-card-menu-width"))) && (point.clientY <= (box.top + cssLength("--responsive-card-menu-height"))))
            return "menu";
        return null;
    };

    // on phones each torrent is a card, laid out by the column of each cell
    const initCards = async () => {
        const tableDiv = await whenElement("torrentsTableDiv");
        const table = window.torrentsTable;
        const tag = (rows, force = false) => {
            if (!queries.phone.matches)
                return;

            for (const tr of rows) {
                if (!force && (tr.dataset.cardCells === "1"))
                    continue;

                for (const [i, td] of [...tr.children].entries()) {
                    td.dataset.col = table.columns[i].name;
                    td.dataset.label = table.columns[i].caption;
                }
                tr.dataset.cardCells = "1";
            }
        };

        // rows the list renders anew keep their cells
        new MutationObserver((mutations) => {
            tag(mutations.flatMap((mutation) => [...mutation.addedNodes]));
        }).observe(table.tableBody, { childList: true });
        // rows and cards differ in height
        queries.phone.addEventListener("change", (_event) => {
            keepFirstRow();
            tag(table.tableBody.children, true);
        });
        tag(table.tableBody.children, true);

        // the ⋯ opens the torrent's menu, as a long press does
        tableDiv.addEventListener("click", (event) => {
            if (cardZone(event) !== "menu")
                return;

            event.preventDefault();
            event.stopPropagation();
            event.target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: event.clientX, clientY: event.clientY }));
        }, true);
        // and a double click on a zone doesn't start or stop the torrent
        tableDiv.addEventListener("dblclick", (event) => {
            if (cardZone(event) !== null)
                event.stopPropagation();
        }, true);
    };

    // a card's checkbox adds its torrent to the selection or takes it out, as a Ctrl+click on a row does; the bar above
    // the cards selects all or none and counts the selected torrents
    const initCardCheckboxes = async () => {
        const tableDiv = await whenElement("torrentsTableDiv");
        const table = window.torrentsTable;

        // a touch on the checkbox neither selects the card alone nor starts a long press
        tableDiv.addEventListener("touchstart", (event) => {
            if (cardZone(event) === "check")
                event.stopPropagation();
        }, { capture: true, passive: true });
        tableDiv.addEventListener("click", (event) => {
            if (event.ctrlKey || (cardZone(event) !== "check"))
                return;

            event.stopPropagation();
            event.target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true, clientX: event.clientX, clientY: event.clientY }));
        }, true);

        const selectAll = document.getElementById("torrentsSelectAll");
        const count = document.getElementById("torrentsSelectionCount");
        const update = () => {
            if (!queries.phone.matches)
                return;

            const selected = table.selectedRowsIds().length;
            const all = (selected > 0) ? table.getFilteredAndSortedRows().length : 0;
            selectAll.checked = (selected > 0) && (selected >= all);
            selectAll.indeterminate = (selected > 0) && (selected < all);
            count.textContent = (selected > 0) ? count.dataset.format.replace("%1", selected) : "";
            for (const tr of table.tableBody.children)
                tr.setAttribute("aria-selected", tr.classList.contains("selected"));
        };
        selectAll.addEventListener("click", (event) => {
            if (selectAll.checked) {
                table.selectAll();
            }
            else {
                table.deselectAll();
                table.setRowClass();
            }
            update();
        });
        // the cards show the selection, and the list renders them anew as it scrolls and updates
        const updateSoon = window.qBittorrent.Misc.createDebounceHandler(100, update);
        new MutationObserver(updateSoon).observe(table.tableBody, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
        queries.phone.addEventListener("change", (_event) => update());
        update();
    };

    // in the column header's place, the bar sorts the cards and opens the columns' menu
    const initCardSorting = async () => {
        await whenElement("torrentsTableDiv");
        const table = window.torrentsTable;
        const select = document.getElementById("torrentsSortSelect");
        const order = document.getElementById("torrentsSortOrder");
        const update = () => {
            if (!queries.phone.matches)
                return;

            const options = table.columns.filter((column) => column.caption !== "").map((column) => new Option(column.caption, column.name));
            select.replaceChildren(...options);
            // the column's name, or its index until the user sorts
            select.value = table.columns[table.sortedColumn]?.name ?? "";
            order.setAttribute("aria-pressed", (table.reverseSort === "1"));
        };
        select.addEventListener("change", (event) => {
            table.setSortedColumn(select.value, table.reverseSort);
            update();
        });
        order.addEventListener("click", (event) => {
            table.setSortedColumn(table.sortedColumn);
            update();
        });
        // the header's menu, below the button
        document.getElementById("torrentsColumnsButton").addEventListener("click", (event) => {
            event.stopPropagation();
            const box = event.currentTarget.getBoundingClientRect();
            table.fixedTableHeader.firstElementChild.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: box.left, clientY: box.bottom }));
        });
        queries.phone.addEventListener("change", (_event) => update());
        update();
    };

    /* Menu drawer on phones */

    const menuItems = "#desktopNavbar a";

    let menuDrawerScrim = null;
    let releaseMenuDrawerFocus = null;

    const openMenuDrawer = () => {
        if (!queries.phone.matches || root.classList.contains("menuDrawerOpen"))
            return;

        const navbar = document.getElementById("desktopNavbar");
        root.classList.add("menuDrawerOpen");
        menuDrawerScrim = addScrim(closeMenuDrawer);
        navbar.setAttribute("role", "dialog");
        navbar.setAttribute("aria-modal", "true");
        navbar.setAttribute("aria-labelledby", "menuDrawerTitle");
        document.getElementById("menuDrawerButton").setAttribute("aria-expanded", "true");
        setKeyboardItems(navbar, menuItems, true);
        releaseMenuDrawerFocus = trapFocus(navbar);
    };

    const closeMenuDrawer = () => {
        if (!root.classList.contains("menuDrawerOpen"))
            return;

        const navbar = document.getElementById("desktopNavbar");
        root.classList.remove("menuDrawerOpen");
        for (const li of navbar.querySelectorAll(":scope > ul > li.menuDrawerExpanded"))
            li.classList.remove("menuDrawerExpanded");
        menuDrawerScrim.remove();
        menuDrawerScrim = null;
        navbar.removeAttribute("role");
        navbar.removeAttribute("aria-modal");
        navbar.removeAttribute("aria-labelledby");
        document.getElementById("menuDrawerButton").setAttribute("aria-expanded", "false");
        setKeyboardItems(navbar, menuItems, false);
        releaseMenuDrawerFocus();
        releaseMenuDrawerFocus = null;
    };

    const initMenuDrawer = () => {
        const navbar = document.getElementById("desktopNavbar");
        document.getElementById("menuDrawerButton").addEventListener("click", (_event) => openMenuDrawer());
        document.getElementById("menuDrawerClose").addEventListener("click", (_event) => closeMenuDrawer());
        // in the drawer a menu's name opens the menu below it, and closes any other
        for (const li of navbar.querySelectorAll(":scope > ul > li")) {
            li.firstElementChild.addEventListener("click", (event) => {
                if (!root.classList.contains("menuDrawerOpen"))
                    return;

                const open = !li.classList.contains("menuDrawerExpanded");
                for (const other of navbar.querySelectorAll(":scope > ul > li.menuDrawerExpanded"))
                    other.classList.remove("menuDrawerExpanded");
                li.classList.toggle("menuDrawerExpanded", open);
            });
        }
        // choosing an item closes the drawer; capturing, as the items' handlers stop the click
        navbar.addEventListener("click", (event) => {
            if (event.target.closest("li li"))
                closeMenuDrawer();
        }, true);
        chooseWithKeys(navbar, menuItems);
        queries.phone.addEventListener("change", (_event) => {
            if (!queries.phone.matches)
                closeMenuDrawer();
        });
        document.addEventListener("keydown", (event) => {
            switch (event.key) {
                case "Escape":
                    closeMenuDrawer();
                    break;
            }
        });
    };

    // called by client.js once the main window is built
    const init = () => {
        initLayout();
        initFiltersDrawer();
        initTouch();
        initWindows();
        initViewTabs();
        initHeaderAutoHide();
        initCards();
        initCardCheckboxes();
        initCardSorting();
        initMenuDrawer();
    };

    return exports();
})();
Object.freeze(window.qBittorrent.Responsive);
