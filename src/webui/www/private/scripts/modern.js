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
window.qBittorrent.Modern ??= (() => {
    const exports = () => {
        return {
            init: init,
            addSpeedSlider: addSpeedSlider,
            addSpeedUnitPicker: addSpeedUnitPicker,
            openOptionsPage: openOptionsPage,
            trimEllipsis: trimEllipsis,
            optionsPage: optionsPage,
            rssDownloaderPage: rssDownloaderPage,
            rssPage: rssPage,
            initTorrentLimits: initTorrentLimits,
            searchPluginsPage: searchPluginsPage,
            searchPage: searchPage,
            setUpOptionsTabs: setUpOptionsTabs,
        };
    };

    const responsive = window.qBittorrent.Responsive;
    const root = document.documentElement;

    // open popups, the latest last: Escape closes the latest, a press outside a popup closes it
    const popups = [];

    const addPopup = (element, close, { keepOpenFor = null, swallow = false } = {}) => {
        const popup = { element: element, close: close, keepOpenFor: keepOpenFor, swallow: swallow };
        popups.push(popup);
        return () => {
            const index = popups.indexOf(popup);
            if (index >= 0)
                popups.splice(index, 1);
        };
    };

    // the rest of a press that closed a popup: its touch and its click
    const SWALLOW_TIME = 500;
    let swallowUntil = 0;

    // Escape on an open dropdown list closes only the list: a list the page styles passes the key on to the page
    const LISTS_CAN_BE_OPEN = CSS.supports("selector(:open)");
    const keepEscapeInLists = (view) => {
        if (!LISTS_CAN_BE_OPEN)
            return;

        view.addEventListener("keydown", (event) => {
            if ((event.key === "Escape") && event.target.closest?.("select")?.matches(":open"))
                event.stopPropagation();
        }, true);
    };

    const initPopups = () => {
        keepEscapeInLists(window);
        document.addEventListener("pointerdown", (event) => {
            for (const popup of popups.toReversed()) {
                if (popup.element.contains(event.target) || ((popup.keepOpenFor !== null) && event.target.closest?.(popup.keepOpenFor)))
                    continue;

                popup.close();
                if (popup.swallow) {
                    swallowUntil = performance.now() + SWALLOW_TIME;
                    event.preventDefault();
                    event.stopPropagation();
                }
            }
        }, true);
        document.addEventListener("touchstart", (event) => {
            if (performance.now() < swallowUntil)
                event.stopPropagation();
        }, { capture: true, passive: true });
        document.addEventListener("click", (event) => {
            if (performance.now() >= swallowUntil)
                return;

            swallowUntil = 0;
            event.preventDefault();
            event.stopPropagation();
        }, true);
        // capturing: a drawer below the popup and a window above it keep their own Escape
        document.addEventListener("keydown", (event) => {
            if ((event.key !== "Escape") || (popups.length === 0) || event.target.closest?.(".mocha"))
                return;

            event.stopPropagation();
            popups.at(-1).close();
        }, true);
    };

    // a click opens a menu; while one is open, hovering another opens it
    const initMenubar = () => {
        const navbar = document.getElementById("desktopNavbar");
        const menus = [...navbar.querySelectorAll(":scope > ul > li")];
        let removePopup = null;

        const close = () => {
            for (const li of menus)
                li.classList.remove("open");
            removePopup?.();
            removePopup = null;
        };
        const open = (li) => {
            close();
            li.classList.add("open");
            removePopup = addPopup(navbar, close);
        };

        for (const li of menus) {
            li.firstElementChild.addEventListener("click", (event) => {
                if (root.classList.contains("menuDrawerOpen"))
                    return;

                event.preventDefault();
                if (li.classList.contains("open"))
                    close();
                else
                    open(li);
            });
            li.addEventListener("pointerenter", (event) => {
                if ((event.pointerType === "mouse") && (removePopup !== null) && !li.classList.contains("open"))
                    open(li);
            });
        }
        // capturing, as the items' handlers stop the click
        navbar.addEventListener("click", (event) => {
            if (event.target.closest("li li"))
                close();
        }, true);
    };

    // keep the selected tab in view in the scrolling strip
    const initPropertiesTabs = async () => {
        const strip = await responsive.whenElement("propertiesTabs");
        const keepSelectedInView = () => {
            const tab = strip.querySelector("li.selected");
            if ((tab === null) || (strip.scrollWidth <= strip.clientWidth))
                return;

            // the strip's own scrolling, so that neither the page nor the panel moves
            const room = strip.getBoundingClientRect();
            const box = tab.getBoundingClientRect();
            if (box.left < room.left)
                strip.scrollLeft -= room.left - box.left;
            else if (box.right > room.right)
                strip.scrollLeft += box.right - room.right;
        };
        new ResizeObserver(keepSelectedInView).observe(strip);
        // after client.js selects the tab on this click
        strip.addEventListener("click", (_event) => requestAnimationFrame(keepSelectedInView));
    };

    // buttons drop the "..." of a label that opens a window, which reads as cut off
    const TRAILING_ELLIPSIS = /\s*(?:\.{2,}|\u2026)\s*$/;
    const BUTTONS = "button, input:is([type='button'], [type='submit'])";

    const trimEllipsis = (container) => {
        for (const button of container.querySelectorAll(BUTTONS)) {
            if (button.matches("input")) {
                button.value = button.value.replace(TRAILING_ELLIPSIS, "");
                continue;
            }
            const label = [...button.childNodes].findLast((node) => (node.nodeType === Node.TEXT_NODE) && (node.textContent.trim() !== ""));
            if (label !== undefined)
                label.textContent = label.textContent.replace(TRAILING_ELLIPSIS, "");
        }
    };

    // the buttons that close a dialog without doing anything
    const CANCEL_BUTTONS = "#cancelBtn, #newPluginCancel, [id^='cancel'][id$='Button'], [onclick*='closeFrameWindow']";

    // weak, so closed dialogs can be freed
    const footers = new WeakSet();

    // wrap a button's text, which modern.css trims to the letters' height
    const labelButton = (button) => {
        for (const node of [...button.childNodes]) {
            if ((node.nodeType !== Node.TEXT_NODE) || (node.textContent.trim() === ""))
                continue;

            const label = button.ownerDocument.createElement("span");
            label.className = "modernButtonLabel";
            node.replaceWith(label);
            label.append(node);
        }
    };

    // after trimEllipsis(), which works on the buttons' own text
    const labelFooterButtons = (footer) => {
        for (const button of footer?.querySelectorAll(":scope > button") ?? [])
            labelButton(button);
    };

    // Cancel first, or last where the buttons stack on phones; moved in the page, so the tab order follows
    const placeCancel = (footer) => {
        const cancel = footer.querySelector(":scope > .dialogCancel");
        if (responsive.queries.phone.matches)
            footer.append(cancel);
        else
            footer.prepend(cancel);
    };

    // a dialog frame with one button gets a Cancel; the other button, or a window's only one, is the main action
    const setUpFooter = (footer, frameWindow) => {
        const buttons = [...footer.querySelectorAll(`:scope > :is(${BUTTONS})`)];
        let cancel = buttons.find((button) => button.matches(CANCEL_BUTTONS));
        if ((cancel === undefined) && (frameWindow !== null) && (buttons.length === 1)) {
            cancel = footer.ownerDocument.createElement("button");
            cancel.type = "button";
            cancel.textContent = "QBT_TR(Cancel)QBT_TR[CONTEXT=MainWindow]";
            cancel.addEventListener("click", (_event) => window.qBittorrent.Client.closeFrameWindow(frameWindow));
            footer.append(cancel);
            buttons.push(cancel);
        }
        if (buttons.length !== ((cancel === undefined) ? 1 : 2))
            return;

        buttons.find((button) => button !== cancel).classList.add("dialogPrimary");
        if (cancel === undefined)
            return;

        cancel.classList.add("dialogCancel");
        footers.add(footer);
        placeCancel(footer);
    };

    // Enter on a focused button presses that button, not the main action the page presses on Enter
    const ENTER_TARGETS = "button, input:is([type='button'], [type='submit'], [type='reset']), a[href]";

    const setUpFrame = (doc) => {
        const footer = doc.querySelector(".dialogFooter");
        if (footer !== null)
            setUpFooter(footer, doc.defaultView);
        keepEscapeInLists(doc.defaultView);
        // New and Edit Category: spaced like the share limits' rows
        for (const id of ["categoryName", "savePath", "useDownloadPath", "downloadPath"])
            doc.getElementById(id)?.parentElement.classList.add("modernFieldRow");
        doc.defaultView.addEventListener("keydown", (event) => {
            if ((event.key === "Enter") && event.target.matches?.(ENTER_TARGETS))
                event.stopImmediatePropagation();
        }, true);
        trimEllipsis(doc.body);
        labelFooterButtons(footer);
    };

    // Remember choice as a switch, saved with Remove torrent; Enter removes unless a button has the focus
    const setUpRemoveDialog = (instance) => {
        const page = instance.contentEl;
        const lock = page.querySelector("#rememberBtn");
        const contentFiles = page.querySelector("#deleteFromDiskCB");
        const removeButton = page.querySelector("#confirmDeletionButton");
        if ((lock === null) || (contentFiles === null) || (removeButton === null) || (page.querySelector("#modernRememberChoice") !== null))
            return;

        const remember = document.createElement("input");
        remember.type = "checkbox";
        remember.id = "modernRememberChoice";
        remember.checked = localPreferences.get("remove_remember_choice") === "true";
        remember.addEventListener("change", (_event) => localPreferences.set("remove_remember_choice", remember.checked.toString()));
        const label = document.createElement("label");
        label.htmlFor = remember.id;
        const name = document.createElement("em");
        name.textContent = lock.title;
        label.append(name);
        const row = document.createElement("span");
        row.className = "deletionGridItem modernDeletionOption";
        row.append(remember, label);
        contentFiles.parentElement.classList.add("modernDeletionOption");
        contentFiles.parentElement.after(row);
        lock.parentElement.hidden = true;

        removeButton.addEventListener("click", (_event) => {
            if (!remember.checked)
                return;

            window.qBittorrent.Cache.preferences.set({ delete_torrent_content_files: contentFiles.checked }).catch((error) => {
                if (error.name === "ServerError")
                    alert(`QBT_TR(Error:)QBT_TR[CONTEXT=HttpServer] ${error.message}`);
                else
                    alert("QBT_TR(Unable to save preferences, qBittorrent is probably unreachable.)QBT_TR[CONTEXT=HttpServer]");
            });
        });

        // the page gives Cancel the focus; the dialog takes it, so Enter reaches it
        instance.windowEl.setAttribute("tabindex", "-1");
        instance.windowEl.focus();
        instance.windowEl.addEventListener("keydown", (event) => {
            if ((event.key !== "Enter") || event.target.matches(ENTER_TARGETS))
                return;

            event.preventDefault();
            removeButton.click();
        });
    };

    // ask before removing a category or tag; Enter answers Yes unless a button has the focus
    const askToRemove = (title, message, remove) => {
        const id = "modernRemovalQuestion";
        if (document.getElementById(id) !== null)
            return;

        const warning = document.createElement("span");
        warning.className = "confirmGridItem confirmWarning";
        const text = document.createElement("span");
        text.className = "confirmGridItem dialogMessage";
        text.textContent = message;
        const grid = document.createElement("div");
        grid.className = "genericConfirmGrid";
        grid.append(warning, text);
        const yes = document.createElement("input");
        yes.type = "button";
        yes.id = "confirmRemovalButton";
        yes.value = "QBT_TR(Yes)QBT_TR[CONTEXT=MainWindow]";
        const no = document.createElement("input");
        no.type = "button";
        no.id = "cancelRemovalButton";
        no.value = "QBT_TR(No)QBT_TR[CONTEXT=MainWindow]";
        const footer = document.createElement("div");
        footer.className = "dialogFooter";
        footer.append(yes, no);
        const content = document.createElement("div");
        content.append(grid, footer);

        new MochaUI.Modal({
            ...window.qBittorrent.Dialog.baseModalOptions,
            id: id,
            title: title,
            loadMethod: "html",
            content: content
        });
        const close = () => window.qBittorrent.Client.closeWindow(document.getElementById(id));
        yes.addEventListener("click", (_event) => {
            remove();
            close();
        });
        no.addEventListener("click", (_event) => close());
        const windowEl = document.getElementById(id);
        windowEl.setAttribute("tabindex", "-1");
        windowEl.focus();
        windowEl.addEventListener("keydown", (event) => {
            if ((event.key !== "Enter") || event.target.matches(ENTER_TARGETS))
                return;

            event.preventDefault();
            yes.click();
        });
    };

    const initRemovalQuestions = () => {
        const removeCategory = removeCategoryFN;
        removeCategoryFN = (category) => askToRemove("QBT_TR(Remove category)QBT_TR[CONTEXT=CategoryFilterWidget]",
            "QBT_TR(Are you sure you want to remove the category %1?)QBT_TR[CONTEXT=CategoryFilterWidget]".replace("%1", `"${category}"`),
            () => removeCategory(category));
        const removeUnusedCategories = deleteUnusedCategoriesFN;
        deleteUnusedCategoriesFN = () => askToRemove("QBT_TR(Remove unused categories)QBT_TR[CONTEXT=CategoryFilterWidget]",
            "QBT_TR(Are you sure you want to remove all unused categories?)QBT_TR[CONTEXT=CategoryFilterWidget]",
            () => removeUnusedCategories());
        const removeTag = removeTagFN;
        removeTagFN = (tag) => askToRemove("QBT_TR(Remove tag)QBT_TR[CONTEXT=TagFilterWidget]",
            "QBT_TR(Are you sure you want to remove the tag %1?)QBT_TR[CONTEXT=TagFilterWidget]".replace("%1", `"${tag}"`),
            () => removeTag(tag));
        const removeUnusedTags = deleteUnusedTagsFN;
        deleteUnusedTagsFN = () => askToRemove("QBT_TR(Remove unused tags)QBT_TR[CONTEXT=TagFilterWidget]",
            "QBT_TR(Are you sure you want to remove all unused tags?)QBT_TR[CONTEXT=TagFilterWidget]",
            () => removeUnusedTags());
    };

    // About's text in cards
    const setUpAbout = (instance) => {
        const page = instance.contentEl;
        const intro = page.querySelector("#aboutAboutContent");
        if ((intro === null) || (page.querySelector(".modernAboutCard") !== null))
            return;

        const wrap = (nodes) => {
            const card = document.createElement("div");
            card.className = "modernAboutCard";
            nodes[0].before(card);
            card.append(...nodes);
            return card;
        };
        wrap([...intro.children].filter((child) => child.tagName !== "TABLE")).classList.add("modernAboutIntro");
        for (const id of ["aboutSpecialThanksContent", "aboutTranslatorsContent", "aboutLicenseContent"])
            wrap([...page.querySelector(`#${id}`).childNodes]);
    };

    // every window: no empty strip below its page; then the windows whose pages aren't framed
    const setUpWindow = (instance) => {
        if (instance.iframeEl)
            return;

        const footer = instance.contentEl.querySelector(".dialogFooter");
        if ((footer !== null) && !footers.has(footer))
            setUpFooter(footer, null);
        trimEllipsis(instance.contentEl);
        labelFooterButtons(footer);
        if (instance.windowEl.id === "confirmDeletionPage")
            setUpRemoveDialog(instance);
        if (instance.windowEl.id === "aboutpage")
            setUpAbout(instance);
    };

    const initDialogs = () => {
        responsive.addFrameHook(setUpFrame);
        responsive.addWindowHook(setUpWindow);
        // place Cancel anew in every open row as the phone layout changes
        responsive.queries.phone.addEventListener("change", (_event) => {
            const docs = [document, ...[...document.querySelectorAll("iframe")].map((frame) => frame.contentDocument).filter((doc) => doc !== null)];
            for (const doc of docs) {
                for (const footer of doc.querySelectorAll(".dialogFooter:has(> .dialogCancel)"))
                    placeCancel(footer);
            }
        });
    };

    // a window the user moved or resized opens where it was left (Add Torrent's windows share one place); a button beside
    // Close centers it again
    const localPreferences = new window.qBittorrent.LocalPreferences.LocalPreferences();
    const placeKey = (instance, side) => `window_${instance.options.id.split("-", 1)[0]}_${side}`;

    // responsive.js centers a window as it fits it, until the user moves it
    const setMoved = (instance, moved) => {
        instance.responsiveUserMoved = moved;
        instance.windowEl.classList.toggle("modernMoved", moved);
    };

    const savePlace = (instance) => {
        localPreferences.set(placeKey(instance, "left"), instance.windowEl.offsetLeft);
        localPreferences.set(placeKey(instance, "top"), instance.windowEl.offsetTop);
    };

    const centerWindow = (instance) => {
        localPreferences.remove(placeKey(instance, "left"));
        localPreferences.remove(placeKey(instance, "top"));
        setMoved(instance, false);
        responsive.fitWindow(instance);
    };

    const placedWindows = new WeakSet();

    // as the window opens, before it is first fitted
    const placeWindow = (instance) => {
        if (placedWindows.has(instance))
            return;

        placedWindows.add(instance);
        const left = localPreferences.get(placeKey(instance, "left"));
        const top = localPreferences.get(placeKey(instance, "top"));
        if ((left !== null) && (top !== null)) {
            instance.windowEl.style.left = `${Number(left)}px`;
            instance.windowEl.style.top = `${Number(top)}px`;
            setMoved(instance, true);
        }

        for (const drag of [instance.windowDrag, instance.resizable1, instance.resizable2, instance.resizable3, instance.resizable4, instance.resizable5]) {
            drag?.addEvent("start", () => setMoved(instance, true));
            drag?.addEvent("complete", () => savePlace(instance));
        }

        if (!instance.controlsEl)
            return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "modernCenterButton";
        button.title = "QBT_TR(Center window)QBT_TR[CONTEXT=MainWindow]";
        button.setAttribute("aria-label", button.title);
        button.addEventListener("click", (_event) => centerWindow(instance));
        instance.controlsEl.append(button);
    };

    // windows the stylesheet sizes (Options, About) resize at their corner only, once a drag has moved a few pixels; the
    // size is stored under Modern's own keys
    const RESIZE_THRESHOLD = 4;
    const sizeKey = (instance, side) => `modern_window_${instance.options.id}_${side}`;

    const setSize = (instance, width, height) => {
        instance.windowEl.style.setProperty("--modern-window-width", `${width}px`);
        instance.windowEl.style.setProperty("--modern-window-height", `${height}px`);
    };

    // the hooks run again as a window's page loads
    const cornerWindows = new WeakSet();

    const resizeAtCorner = (instance) => {
        const windowEl = instance.windowEl;
        const corner = instance.se;
        if (!responsive.isStylesheetSized(instance) || !corner || cornerWindows.has(instance))
            return;

        cornerWindows.add(instance);
        const stored = { width: Number(localPreferences.get(sizeKey(instance, "width"))), height: Number(localPreferences.get(sizeKey(instance, "height"))) };
        if ((stored.width > 0) && (stored.height > 0))
            setSize(instance, stored.width, stored.height);

        // Mocha's drag would set an inline size over the stylesheet's
        instance.resizable3?.detach();
        corner.addEventListener("pointerdown", (event) => {
            if (!event.isPrimary || (event.button !== 0))
                return;

            event.preventDefault();
            event.stopPropagation();
            corner.setPointerCapture(event.pointerId);
            const style = getComputedStyle(windowEl);
            const min = { width: Number.parseFloat(style.minWidth) || 0, height: Number.parseFloat(style.minHeight) || 0 };
            const start = { x: event.clientX, y: event.clientY, width: windowEl.offsetWidth, height: windowEl.offsetHeight };
            let resizing = false;
            const listening = new AbortController();
            corner.addEventListener("pointermove", (moveEvent) => {
                const x = moveEvent.clientX - start.x;
                const y = moveEvent.clientY - start.y;
                if (!resizing && (Math.hypot(x, y) < RESIZE_THRESHOLD))
                    return;

                if (!resizing)
                    setMoved(instance, true);
                resizing = true;
                const room = {
                    width: document.documentElement.clientWidth - windowEl.offsetLeft - responsive.windowMargin,
                    height: document.documentElement.clientHeight - windowEl.offsetTop - responsive.windowMargin
                };
                setSize(instance, Math.max(min.width, Math.min(room.width, start.width + x)), Math.max(min.height, Math.min(room.height, start.height + y)));
            }, { signal: listening.signal });
            corner.addEventListener("lostpointercapture", (_event) => {
                listening.abort();
                if (!resizing)
                    return;

                savePlace(instance);
                localPreferences.set(sizeKey(instance, "width"), windowEl.offsetWidth);
                localPreferences.set(sizeKey(instance, "height"), windowEl.offsetHeight);
            }, { once: true });
        });
    };

    // on phones the toolbar keeps the buttons used most; the others, and on narrow phones Execution Log, are in a menu
    const NARROW_PHONE = window.matchMedia("(width < 480px)");
    const OVERFLOW_ITEMS = [
        ["topPrioButton", "images/go-top.svg", "QBT_TR(Top of Queue)QBT_TR[CONTEXT=MainWindow]"],
        ["increasePrioButton", "images/go-up.svg", "QBT_TR(Move Up Queue)QBT_TR[CONTEXT=MainWindow]"],
        ["decreasePrioButton", "images/go-down.svg", "QBT_TR(Move Down Queue)QBT_TR[CONTEXT=MainWindow]"],
        ["bottomPrioButton", "images/go-bottom.svg", "QBT_TR(Bottom of Queue)QBT_TR[CONTEXT=MainWindow]"],
        ["torrentCreatorButton", "images/torrent-creator.svg", "QBT_TR(Torrent Creator)QBT_TR[CONTEXT=MainWindow]"],
        ["preferencesButton", "images/configure.svg", "QBT_TR(Options)QBT_TR[CONTEXT=OptionsDialog]"],
        ["logTabLink", "images/help-contents.svg", "QBT_TR(Execution Log)QBT_TR[CONTEXT=MainWindow]"]
    ];

    // Modern's own menus are menus to assistive technology; the arrow keys, Home and End move through their entries
    const MENU_KEYS = ["ArrowDown", "ArrowUp", "Home", "End"];
    const setUpMenuKeys = (list) => {
        list.setAttribute("role", "menu");
        list.addEventListener("keydown", (event) => {
            if (!MENU_KEYS.includes(event.key))
                return;

            const items = [...list.querySelectorAll("a")].filter((link) => link.getClientRects().length > 0);
            if (items.length === 0)
                return;

            event.preventDefault();
            const at = items.indexOf(document.activeElement);
            let next = 0;
            if (event.key === "End")
                next = items.length - 1;
            else if (event.key === "ArrowDown")
                next = (at + 1) % items.length;
            else if (event.key === "ArrowUp")
                next = (at - 1 + items.length) % items.length;
            items[next].focus();
        });
    };

    const initPhoneHeader = () => {
        const button = document.createElement("button");
        button.type = "button";
        button.id = "toolbarOverflowButton";
        button.title = "QBT_TR(More actions)QBT_TR[CONTEXT=MainWindow]";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", "toolbarOverflowMenu");
        const glyph = document.createElement("span");
        glyph.className = "modernGlyph";
        glyph.dataset.glyph = "more";
        button.append(glyph);
        document.getElementById("mainWindowTabs").after(button);

        const list = document.createElement("ul");
        list.id = "toolbarOverflowMenu";
        list.className = "contextMenu";
        list.setAttribute("aria-label", button.title);
        const actions = {};
        for (const [target, icon, label] of OVERFLOW_ITEMS) {
            const item = document.createElement("li");
            item.setAttribute("role", "none");
            const link = document.createElement("a");
            link.href = `#${target}`;
            link.setAttribute("role", "menuitem");
            const img = document.createElement("img");
            img.src = icon;
            img.alt = "";
            link.append(img, label);
            item.append(link);
            list.append(item);
            actions[target] = (_element, _menu) => document.getElementById(target).click();
        }
        list.querySelector("a[href='#torrentCreatorButton']").parentElement.classList.add("separator");
        setUpMenuKeys(list);
        document.body.append(list);

        const queueItems = ["topPrioButton", "increasePrioButton", "decreasePrioButton", "bottomPrioButton"];
        const OverflowMenu = class extends window.qBittorrent.ContextMenu.ContextMenu {
            updateMenuItems() {
                const queueing = !document.getElementById("queueingButtons").classList.contains("invisible");
                for (const item of queueItems) {
                    if (queueing)
                        this.showItem(item);
                    else
                        this.hideItem(item);
                }
                if (NARROW_PHONE.matches && !document.getElementById("logTabLink").classList.contains("invisible"))
                    this.showItem("logTabLink");
                else
                    this.hideItem("logTabLink");
            }
        };
        let releaseFocus = null;
        const menu = new OverflowMenu({
            targets: "",
            menu: "toolbarOverflowMenu",
            actions: actions,
            onShow: () => {
                button.setAttribute("aria-expanded", "true");
                releaseFocus ??= responsive.trapFocus(list);
            },
            onHide: () => {
                button.setAttribute("aria-expanded", "false");
                releaseFocus?.();
                releaseFocus = null;
            }
        });
        button.addEventListener("click", (event) => {
            // the page's click would close it again
            event.stopPropagation();
            if (list.classList.contains("visible"))
                menu.hide();
            else
                menu.triggerMenu(event, button);
        });
    };

    // phones: a tap on a card opens its torrent's properties as a sheet over the list
    const SHEET_STEP_TIME = 450;

    const initPropertiesSheet = async () => {
        const wrapper = await responsive.whenElement("propertiesPanel_wrapper");
        const header = await responsive.whenElement("propertiesPanel_header");
        const tableDiv = await responsive.whenElement("torrentsTableDiv");
        const collapseToggle = () => document.getElementById("propertiesPanel_collapseToggle");

        const bar = document.createElement("div");
        bar.className = "modernSheetBar";
        const back = document.createElement("button");
        back.type = "button";
        back.className = "modernSheetBack";
        back.title = "QBT_TR(Back)QBT_TR[CONTEXT=MainWindow]";
        back.setAttribute("aria-label", back.title);
        const title = document.createElement("span");
        title.id = "modernSheetTitle";
        bar.append(back, title);
        header.prepend(bar);

        let sheet = null;
        const isHalf = () => wrapper.classList.contains("modernSheetHalf");

        const close = () => {
            if (sheet === null)
                return;

            const { removePopup, releaseFocus, collapseAfter } = sheet;
            sheet = null;
            wrapper.classList.remove("modernSheet", "modernSheetHalf", "modernSheetDragging");
            wrapper.style.removeProperty("--modern-sheet-top");
            for (const attribute of ["role", "aria-modal", "aria-labelledby"])
                wrapper.removeAttribute(attribute);
            removePopup();
            releaseFocus();
            if (collapseAfter)
                collapseToggle()?.click();
        };
        const toFull = () => wrapper.classList.remove("modernSheetHalf");
        const toHalf = () => {
            wrapper.style.removeProperty("--modern-sheet-top");
            wrapper.classList.add("modernSheetHalf");
        };

        const open = (tr) => {
            title.textContent = tr.querySelector("td[data-col='name']")?.textContent.trim() ?? "";
            if (sheet !== null)
                return;

            // a collapsed panel opens for the sheet, and the state the user stored stays
            const collapsed = collapseToggle()?.classList.contains("panel-expand") ?? false;
            if (collapsed) {
                const stored = localPreferences.get("properties_panel_collapsed");
                collapseToggle().click();
                if (stored !== null)
                    localPreferences.set("properties_panel_collapsed", stored);
            }
            wrapper.classList.add("modernSheet", "modernSheetHalf");
            // the panel doesn't follow the selection while it is collapsed
            updatePropertiesPanel();
            wrapper.setAttribute("role", "dialog");
            wrapper.setAttribute("aria-modal", "true");
            wrapper.setAttribute("aria-labelledby", title.id);
            sheet = {
                collapseAfter: collapsed,
                // menus, their scrims and windows opened from the sheet leave it open
                removePopup: addPopup(wrapper, close, { keepOpenFor: ".contextMenu, .responsiveScrim, .mocha", swallow: true }),
                releaseFocus: responsive.trapFocus(wrapper)
            };
        };

        tableDiv.addEventListener("click", (event) => {
            const tr = event.target.closest("tbody tr");
            // a click with Ctrl is a checkbox's
            if (!responsive.queries.phone.matches || (tr === null) || event.ctrlKey)
                return;

            open(tr);
        });
        back.addEventListener("click", (_event) => close());
        // the selected tab doesn't collapse the panel
        wrapper.addEventListener("click", (event) => {
            if ((sheet !== null) && event.target.closest("#propertiesTabs li.selected"))
                event.stopPropagation();
        }, true);
        responsive.queries.phone.addEventListener("change", (_event) => close());

        // dragging the header resizes the sheet
        let drag = null;
        header.addEventListener("pointerdown", (event) => {
            if ((sheet === null) || event.target.closest("button, input") || (event.button > 0))
                return;

            drag = { id: event.pointerId, y0: event.clientY, top0: wrapper.getBoundingClientRect().top, moved: false };
        });
        header.addEventListener("pointermove", (event) => {
            if ((drag === null) || (event.pointerId !== drag.id))
                return;

            const dy = event.clientY - drag.y0;
            if (!drag.moved) {
                if (Math.abs(dy) < 6)
                    return;

                drag.moved = true;
                header.setPointerCapture(drag.id);
                wrapper.classList.add("modernSheetHalf", "modernSheetDragging");
            }
            const top = Math.min(Math.max(drag.top0 + dy, 0), root.clientHeight - 80);
            wrapper.style.setProperty("--modern-sheet-top", `${top}px`);
        });
        const endDrag = (event) => {
            if ((drag === null) || (event.pointerId !== drag.id))
                return;

            const moved = drag.moved;
            drag = null;
            if (!moved)
                return;

            wrapper.classList.remove("modernSheetDragging");
            const top = wrapper.getBoundingClientRect().top;
            if (top < (root.clientHeight * 0.12))
                toFull();
            else if (top > (root.clientHeight * 0.8))
                close();
            // the click that ends a mouse's drag (a finger's drag and a cancel end without one)
            if ((event.type === "pointerup") && (event.pointerType !== "touch")) {
                header.addEventListener("click", (clickEvent) => {
                    clickEvent.preventDefault();
                    clickEvent.stopPropagation();
                }, { capture: true, once: true });
            }
        };
        header.addEventListener("pointerup", (event) => endDrag(event));
        header.addEventListener("pointercancel", (event) => endDrag(event));

        // one step for each gesture: scrolling the page fills the screen; at its top, pulling down shrinks or closes
        let lockedUntil = 0;
        const step = (fn) => {
            if (performance.now() < lockedUntil)
                return;

            lockedUntil = performance.now() + SHEET_STEP_TIME;
            fn();
        };
        const atTop = (target) => ((target.closest?.(".dynamicTableDiv") ?? document.getElementById("propertiesPanel"))?.scrollTop ?? 0) <= 0;
        const shrinkOrClose = () => step(() => (isHalf() ? close() : toHalf()));

        wrapper.addEventListener("scroll", (event) => {
            if ((sheet !== null) && isHalf() && !wrapper.classList.contains("modernSheetDragging") && (event.target.scrollTop > 4))
                step(toFull);
        }, true);
        // a wheel's gesture counts once
        let lastWheel = 0;
        wrapper.addEventListener("wheel", (event) => {
            const now = performance.now();
            const newGesture = (now - lastWheel) > 250;
            lastWheel = now;
            if ((sheet === null) || !newGesture)
                return;

            if ((event.deltaY > 0) && isHalf())
                step(toFull);
            else if ((event.deltaY < 0) && atTop(event.target))
                shrinkOrClose();
        }, { passive: true });
        let touchStart = null;
        wrapper.addEventListener("touchstart", (event) => {
            touchStart = ((sheet === null) || header.contains(event.target)) ? null : { y: event.touches[0].clientY, atTop: atTop(event.target) };
        }, { passive: true });
        wrapper.addEventListener("touchmove", (event) => {
            if (touchStart === null)
                return;

            const dy = event.touches[0].clientY - touchStart.y;
            if ((dy < -12) && isHalf()) {
                step(toFull);
                touchStart = null;
            }
            else if ((dy > 60) && touchStart.atTop) {
                shrinkOrClose();
                touchStart = null;
            }
        }, { passive: true });
        wrapper.addEventListener("touchend", (_event) => {
            touchStart = null;
        });
    };

    // peers and trackers are cards on phones too: each cell is tagged with its column
    const initPropertyCards = async () => {
        for (const id of ["torrentPeersTableDiv", "torrentTrackersTableDiv"]) {
            const tableDiv = await responsive.whenElement(id);
            const header = document.querySelector(`#${id.replace(/Div$/, "FixedHeaderDiv")} thead tr`);
            const tag = (rows) => {
                if (!responsive.queries.phone.matches)
                    return;

                const columns = [...header.children].map((th) => [th.className.match(/\bcolumn_(\S+)/)?.[1] ?? "", th.textContent.trim()]);
                for (const tr of rows) {
                    for (const [i, td] of [...tr.children].entries()) {
                        td.dataset.col = columns[i]?.[0] ?? "";
                        td.dataset.label = columns[i]?.[1] ?? "";
                    }
                }
            };
            const body = tableDiv.querySelector("tbody");
            new MutationObserver((mutations) => tag(mutations.flatMap((mutation) => [...mutation.addedNodes]).filter((node) => node.nodeName === "TR"))).observe(body, { childList: true });
            responsive.queries.phone.addEventListener("change", (_event) => tag(body.children));
            tag(body.children);
        }
    };

    // a collapsed properties panel opens to a usable height: client.js stores 0 for it as the window resizes
    const MIN_PROPERTIES_HEIGHT = 60;

    const initPropertiesPanelHeight = async () => {
        await responsive.whenElement("propertiesPanel");
        const panel = MochaUI.Panels.instances.propertiesPanel;
        const storeHeight = () => localPreferences.set("properties_height_rel", panel.oldHeight / root.clientHeight);
        panel.addEvent("collapse", () => {
            if (panel.oldHeight >= MIN_PROPERTIES_HEIGHT)
                return;

            panel.oldHeight = Math.round(document.getElementById("mainColumn").offsetHeight / 2);
            storeHeight();
        });
        // after client.js's own, which waits as long
        window.addEventListener("resize", window.qBittorrent.Misc.createDebounceHandler(500, () => {
            if (panel.isCollapsed && !responsive.queries.small.matches)
                storeHeight();
        }));
    };

    // on phones the cards are sorted, and the filter's field chosen, from a sheet, which also chooses what the cards show
    const SORT_COLUMNS = ["priority", "name", "size", "progress", "status", "dlspeed", "upspeed", "eta", "ratio", "added_on"];
    const CARD_FIELDS = ["priority", "progress", "status", "eta", "size", "dlspeed", "upspeed"];

    const initSortSheet = async () => {
        const tableDiv = await responsive.whenElement("torrentsTableDiv");
        const table = window.torrentsTable;
        const filterSelect = document.getElementById("torrentsFilterSelect");
        const caption = (column) => ((column === "priority") ? "QBT_TR(Queue)QBT_TR[CONTEXT=TransferListWidget]" : table.columns[column].caption);

        const hiddenFields = () => new Set(localPreferences.get("modern_card_hidden_fields", "").split(",").filter(Boolean));
        const applyHiddenFields = () => {
            tableDiv.dataset.hide = [...hiddenFields()].join(" ");
        };
        applyHiddenFields();

        const button = document.createElement("button");
        button.type = "button";
        button.id = "modernSortButton";
        button.title = "QBT_TR(Sort by)QBT_TR[CONTEXT=MainWindow]";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", "modernSortMenu");
        const glyph = document.createElement("span");
        glyph.className = "modernGlyph";
        glyph.dataset.glyph = "sort";
        button.append(glyph);
        document.getElementById("filtersButton").after(button);

        const list = document.createElement("ul");
        list.id = "modernSortMenu";
        list.className = "contextMenu";
        list.setAttribute("aria-label", button.title);
        setUpMenuKeys(list);
        document.body.append(list);

        // an item chosen keeps the sheet open, and the focus on it
        const item = (text, role, checked, choose) => {
            const li = document.createElement("li");
            li.setAttribute("role", "none");
            const link = document.createElement("a");
            link.href = "#";
            link.setAttribute("role", role);
            if (checked !== null)
                link.setAttribute("aria-checked", checked);
            link.append(text);
            link.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                choose();
                render();
            });
            li.append(link);
            return li;
        };
        const heading = (text) => {
            const li = document.createElement("li");
            li.className = "modernSheetHeading";
            li.setAttribute("role", "presentation");
            li.textContent = text;
            return li;
        };

        let cardsOpen = false;
        const render = () => {
            const focused = [...list.querySelectorAll("a")].indexOf(document.activeElement);
            const sortedColumn = table.columns[table.sortedColumn]?.name;
            const sortItems = SORT_COLUMNS.filter((column) => table.columns[column] !== undefined).map((column) => {
                const li = item(caption(column), "menuitemradio", (column === sortedColumn), () => table.setSortedColumn(column));
                if (column === sortedColumn) {
                    const direction = document.createElement("span");
                    direction.className = "modernSortDirection";
                    direction.setAttribute("aria-hidden", "true");
                    direction.textContent = (table.reverseSort === "1") ? "\u2193" : "\u2191";
                    li.firstElementChild.append(direction);
                }
                return li;
            });
            const filterItems = [...filterSelect.options].map((option) => item(option.textContent, "menuitemradio", option.selected, () => {
                filterSelect.value = option.value;
                // the filter bar filters again as it changes (Event is MooTools' DOMEvent here)
                filterSelect.dispatchEvent(new CustomEvent("change", { bubbles: true }));
            }));
            const fold = item("QBT_TR(Show on cards)QBT_TR[CONTEXT=MainWindow]", "menuitem", null, () => {
                cardsOpen = !cardsOpen;
            });
            fold.className = "modernSheetFold";
            fold.firstElementChild.setAttribute("aria-expanded", cardsOpen);
            const hidden = hiddenFields();
            const fieldItems = !cardsOpen ? [] : CARD_FIELDS.map((field) => {
                const li = item(caption(field), "menuitemcheckbox", !hidden.has(field), () => {
                    const fields = hiddenFields();
                    if (fields.has(field))
                        fields.delete(field);
                    else
                        fields.add(field);
                    localPreferences.set("modern_card_hidden_fields", [...fields].join(","));
                    applyHiddenFields();
                });
                li.firstElementChild.classList.add("modernCardField");
                return li;
            });
            const filterHeading = document.querySelector("label[for='torrentsFilterSelect']").textContent.replace(/[:\uFF1A]\s*$/, "");
            const checkboxes = item("QBT_TR(Checkboxes)QBT_TR[CONTEXT=MainWindow]", "menuitemcheckbox", checkboxesOn(), () => switchCheckboxes());
            checkboxes.firstElementChild.classList.add("modernCardField");
            fieldItems.unshift(checkboxes);
            list.replaceChildren(heading(button.title), ...sortItems, heading(filterHeading), ...filterItems, fold, ...fieldItems);
            if (focused >= 0)
                list.querySelectorAll("a")[focused]?.focus();
        };

        const SortMenu = class extends window.qBittorrent.ContextMenu.ContextMenu {
            updateMenuItems() {
                render();
            }
        };
        let releaseFocus = null;
        const menu = new SortMenu({
            targets: "",
            menu: "modernSortMenu",
            onShow: () => {
                button.setAttribute("aria-expanded", "true");
                releaseFocus ??= responsive.trapFocus(list);
            },
            onHide: () => {
                button.setAttribute("aria-expanded", "false");
                releaseFocus?.();
                releaseFocus = null;
            }
        });
        button.addEventListener("click", (event) => {
            // the page's click would close it again
            event.stopPropagation();
            if (list.classList.contains("visible"))
                menu.hide();
            else
                menu.triggerMenu(event, button);
        });
    };

    // a check box before each torrent selects several without Ctrl or Shift; the header's menu, and on phones the sort
    // sheet, switch them off
    const checkboxesOn = () => localPreferences.get("torrents_row_checkboxes") !== "false";

    let switchCheckboxes = () => {};

    const initSelectionCheckboxes = async () => {
        await responsive.whenElement("torrentsTableDiv");
        const table = window.torrentsTable;
        const selectAll = document.getElementById("torrentsSelectAll");
        const bar = selectAll.parentElement;
        const header = document.getElementById("torrentsTableFixedHeaderDiv");

        // select all: above the cards on phones, before the column headers otherwise
        const placeSelectAll = () => {
            if (responsive.queries.phone.matches)
                bar.prepend(selectAll);
            else
                header.prepend(selectAll);
        };
        const apply = () => {
            root.classList.toggle("modernSelectMode", checkboxesOn());
            responsive.updateSelection();
        };
        switchCheckboxes = () => {
            localPreferences.set("torrents_row_checkboxes", (!checkboxesOn()).toString());
            apply();
        };
        responsive.queries.phone.addEventListener("change", (_event) => placeSelectAll());
        placeSelectAll();
        apply();

        // the header's menu, which the list builds anew, shows them checked as it does its columns
        const menu = document.getElementById("torrentsTableDiv_headerMenu");
        const addItem = () => {
            if (menu.querySelector("a[href='#modernCheckboxes']") !== null)
                return;

            const link = document.createElement("a");
            link.href = "#modernCheckboxes";
            const img = document.createElement("img");
            img.src = "images/checked-completed.svg";
            img.alt = "";
            link.append(img, "QBT_TR(Checkboxes)QBT_TR[CONTEXT=MainWindow]");
            // contextmenu.js has no such action
            link.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                switchCheckboxes();
                table.headerContextMenu.hide();
            });
            const item = document.createElement("li");
            item.className = "separator";
            item.append(link);
            menu.append(item);
        };
        addItem();
        new MutationObserver(addItem).observe(menu, { childList: true });
        header.addEventListener("contextmenu", (_event) => {
            menu.querySelector("a[href='#modernCheckboxes'] > img").style.opacity = checkboxesOn() ? "1" : "0";
        }, true);
    };

    // the connection's state in a word, its details on the bar or above it, the alternative limits' switch and the speeds
    const STATE_WORDS = {
        connected: "QBT_TR(Connected)QBT_TR[CONTEXT=MainWindow]",
        firewalled: "QBT_TR(Firewalled)QBT_TR[CONTEXT=MainWindow]",
        disconnected: "QBT_TR(Disconnected)QBT_TR[CONTEXT=MainWindow]"
    };
    // below 340px the switch moves among the details
    const NARROW_BAR = window.matchMedia("(width < 340px)");

    const initStatusBar = () => {
        const footer = document.getElementById("desktopFooter");
        const bar = document.createElement("div");
        bar.id = "modernStatusBar";

        // client.js keeps updating the icons moved here
        const connectionIcon = document.getElementById("connectionStatus");
        const badge = document.createElement("button");
        badge.type = "button";
        badge.className = "modernStatusBadge";
        const pill = document.createElement("span");
        pill.className = "modernStatusPill";
        const stateWord = document.createElement("span");
        stateWord.className = "modernStatusState";
        stateWord.setAttribute("aria-hidden", "true");
        const chevron = document.createElement("span");
        chevron.className = "modernStatusChevron";
        pill.append(connectionIcon, stateWord, chevron);
        badge.append(pill);

        const details = document.createElement("div");
        details.id = "modernStatusDetails";
        details.className = "modernStatusDetails";
        badge.setAttribute("aria-controls", details.id);
        const addItem = (className = null) => {
            const item = document.createElement("span");
            item.className = "modernStatusItem";
            if (className !== null)
                item.classList.add(className);
            details.append(item);
            return item;
        };
        const heading = addItem("modernStatusHeading");
        heading.id = "modernStatusHeading";
        const externalIPs = addItem();
        const freeSpace = addItem();
        const dhtNodes = addItem();
        const addPair = (label) => {
            const value = document.createElement("span");
            value.className = "modernStatusItemValue";
            addItem("modernStatusPair").append(label, value);
            return value;
        };
        const sessionDownloaded = addPair("QBT_TR(Session Downloaded)QBT_TR[CONTEXT=TransferListModel]");
        const sessionUploaded = addPair("QBT_TR(Session Uploaded)QBT_TR[CONTEXT=TransferListModel]");

        // only what changed is written
        const setText = (element, text) => {
            if (element.textContent !== text)
                element.textContent = text;
        };
        // a translated text with its values (%1, %2) in elements of their own
        const itemTexts = new WeakMap();
        const setItem = (item, text, ...values) => {
            const key = [text, ...values].join("\n");
            if (itemTexts.get(item) === key)
                return;

            itemTexts.set(item, key);
            item.replaceChildren(...text.split(/(%\d)/).filter((part) => part !== "").map((part) => {
                const placeholder = /^%(\d)$/.exec(part);
                if (placeholder === null)
                    return part;

                const value = document.createElement("span");
                value.className = "modernStatusItemValue";
                value.textContent = values[Number(placeholder[1]) - 1];
                return value;
            }));
        };

        const altSpeedIcon = document.getElementById("alternativeSpeedLimits");
        const altSpeed = document.createElement("button");
        altSpeed.type = "button";
        altSpeed.className = "modernStatusCell modernStatusAltSpeed";
        const altSpeedLabel = document.createElement("span");
        altSpeedLabel.className = "modernStatusAltSpeedLabel";
        altSpeedLabel.textContent = "QBT_TR(Alternative speed limits)QBT_TR[CONTEXT=MainWindow]";
        altSpeed.append(altSpeedIcon, altSpeedLabel);
        // client.js switches the limits as the icon is clicked
        altSpeed.addEventListener("click", (event) => {
            if (event.target !== altSpeedIcon)
                altSpeedIcon.click();
        });
        const syncAltSpeed = () => {
            altSpeed.title = altSpeedIcon.title;
            altSpeed.setAttribute("aria-pressed", (altSpeedIcon.getAttribute("src") === "images/slow.svg").toString());
        };
        new MutationObserver(syncAltSpeed).observe(altSpeedIcon, { attributes: true, attributeFilter: ["src", "title"] });
        syncAltSpeed();

        const createSpeedCell = (src, alt) => {
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "modernStatusCell modernStatusSpeed";
            cell.title = "QBT_TR(Global Speed Limits)QBT_TR[CONTEXT=MainWindow]";
            const icon = document.createElement("img");
            icon.src = src;
            icon.alt = alt;
            const rate = document.createElement("span");
            rate.className = "modernStatusRate";
            const limit = document.createElement("span");
            limit.className = "modernStatusLimit invisible";
            cell.append(icon, rate, limit);
            return { cell: cell, rate: rate, limit: limit };
        };
        const download = createSpeedCell("images/downloading.svg", "QBT_TR(Download speed icon)QBT_TR[CONTEXT=MainWindow]");
        const upload = createSpeedCell("images/upload.svg", "QBT_TR(Upload speed icon)QBT_TR[CONTEXT=MainWindow]");

        bar.append(badge, details, altSpeed, download.cell, upload.cell);
        footer.append(bar);
        initSpeedLimits([download.cell, upload.cell]);

        // details that don't fit on the line open above it: as a popup, or as a sheet where menus are sheets
        let inlineOpen = localPreferences.get("status_bar_details_open") === "true";
        let popup = null;
        const isPopup = () => bar.classList.contains("modernStatusPopup");
        const syncExpanded = () => {
            badge.setAttribute("aria-expanded", (isPopup() ? (popup !== null) : inlineOpen).toString());
        };

        const closePopup = () => {
            if (popup === null)
                return;

            const { scrim, removePopup, releaseFocus } = popup;
            popup = null;
            scrim?.remove();
            removePopup();
            syncExpanded();
            details.classList.remove("modernSheet");
            releaseFocus();
        };
        const openPopup = () => {
            const sheet = responsive.queries.coarse.matches || responsive.queries.phone.matches;
            details.classList.toggle("modernSheet", sheet);
            popup = {
                scrim: sheet ? responsive.addScrim(() => closePopup(), "modernStatusScrim") : null,
                // the badge closes it itself
                removePopup: addPopup(details, () => closePopup(), { keepOpenFor: ".modernStatusBadge" }),
                releaseFocus: () => {}
            };
            syncExpanded();
            popup.releaseFocus = responsive.trapFocus(details);
        };

        badge.addEventListener("click", (_event) => {
            if (isPopup()) {
                if (popup === null)
                    openPopup();
                else
                    closePopup();
                return;
            }
            inlineOpen = !inlineOpen;
            localPreferences.set("status_bar_details_open", inlineOpen.toString());
            syncExpanded();
        });
        // measured once a frame at most; switching between the line and the popup closes the popup
        let layoutFrame = 0;
        const updateLayout = () => {
            layoutFrame = 0;
            const wasPopup = isPopup();
            bar.classList.remove("modernStatusPopup");
            // on phones the speeds share the line; elsewhere they keep the room their texts need, so details that don't fit
            // are cut off
            const toPopup = responsive.queries.phone.matches || (details.scrollWidth > details.clientWidth);
            bar.classList.toggle("modernStatusPopup", toPopup);
            if (toPopup === wasPopup)
                return;

            closePopup();
            if (toPopup) {
                details.setAttribute("role", "dialog");
                details.setAttribute("aria-labelledby", heading.id);
            }
            else {
                details.removeAttribute("role");
                details.removeAttribute("aria-labelledby");
            }
            syncExpanded();
        };
        const scheduleLayout = () => {
            if (layoutFrame === 0)
                layoutFrame = requestAnimationFrame(() => updateLayout());
        };
        const resizeObserver = new ResizeObserver(() => scheduleLayout());
        resizeObserver.observe(bar);
        resizeObserver.observe(details);
        for (const query of [responsive.queries.coarse, responsive.queries.phone]) {
            query.addEventListener("change", (_event) => {
                closePopup();
                scheduleLayout();
            });
        }
        const placeAltSpeed = () => {
            if (NARROW_BAR.matches)
                details.append(altSpeed);
            else
                details.after(altSpeed);
        };
        placeAltSpeed();
        NARROW_BAR.addEventListener("change", (_event) => {
            closePopup();
            placeAltSpeed();
            scheduleLayout();
        });

        const friendlyUnit = window.qBittorrent.Misc.friendlyUnit;
        // both speeds keep room for a limit once any is set, so nothing moves as limits come and go
        const showSpeed = ({ cell, rate, limit }, speed, rateLimit) => {
            setText(rate, friendlyUnit(speed, true));
            limit.classList.toggle("invisible", !cell.classList.contains("modernStatusLimited"));
            setText(limit, (rateLimit > 0) ? `/ ${friendlyUnit(rateLimit, true)}` : "");
        };

        let layoutKey = "";
        const render = (serverState) => {
            const preferences = window.qBittorrent.Cache.preferences.get();
            const state = serverState.connection_status;
            if (badge.dataset.state !== state) {
                badge.dataset.state = state;
                stateWord.textContent = STATE_WORDS[state] ?? "";
            }
            if (badge.title !== connectionIcon.title)
                badge.title = connectionIcon.title;
            setText(heading, connectionIcon.title);

            // as Classic's status bar shows them
            const showIPs = preferences.status_bar_external_ip === true;
            externalIPs.classList.toggle("invisible", !showIPs);
            if (showIPs) {
                const ipv4 = serverState.last_external_address_v4 ?? "";
                const ipv6 = serverState.last_external_address_v6 ?? "";
                if ((ipv4 !== "") && (ipv6 !== ""))
                    setItem(externalIPs, "QBT_TR(External IPs: %1, %2)QBT_TR[CONTEXT=HttpServer]", ipv4, ipv6);
                else if ((ipv4 !== "") || (ipv6 !== ""))
                    setItem(externalIPs, "QBT_TR(External IP: %1%2)QBT_TR[CONTEXT=HttpServer]", ipv4, ipv6);
                else
                    setItem(externalIPs, "QBT_TR(External IP: N/A)QBT_TR[CONTEXT=HttpServer]");
            }
            setItem(freeSpace, "QBT_TR(Free space: %1)QBT_TR[CONTEXT=HttpServer]", friendlyUnit(serverState.free_space_on_disk));
            dhtNodes.classList.toggle("invisible", !preferences.dht);
            if (preferences.dht)
                setItem(dhtNodes, "QBT_TR(DHT: %1 nodes)QBT_TR[CONTEXT=StatusBar]", serverState.dht_nodes);
            setText(sessionDownloaded, friendlyUnit(serverState.dl_info_data, false));
            setText(sessionUploaded, friendlyUnit(serverState.up_info_data, false));

            const limits = [serverState.dl_rate_limit, serverState.up_rate_limit, preferences.dl_limit, preferences.up_limit, preferences.alt_dl_limit, preferences.alt_up_limit];
            if (limits.some((value) => value > 0)) {
                for (const { cell } of [download, upload])
                    cell.classList.add("modernStatusLimited");
            }
            showSpeed(download, serverState.dl_info_speed, serverState.dl_rate_limit);
            showSpeed(upload, serverState.up_info_speed, serverState.up_rate_limit);

            const key = [...details.children].map((item) => (item.classList.contains("invisible") ? "" : item.textContent.length)).join();
            if (key !== layoutKey) {
                layoutKey = key;
                scheduleLayout();
            }
        };

        window.qBittorrent.Client.addServerStateListener(render);
        syncExpanded();
        scheduleLayout();
    };

    // speed limits in KiB/s, up to the most the server stores: a 32-bit number of bytes per second
    const MAX_SPEED = 2097151;
    const SPEED_UNITS = ["QBT_TR(KiB)QBT_TR[CONTEXT=misc]", "QBT_TR(MiB)QBT_TR[CONTEXT=misc]", "QBT_TR(GiB)QBT_TR[CONTEXT=misc]"]
        .map((unit, i) => ({ name: `${unit}QBT_TR(/s)QBT_TR[CONTEXT=misc]`, factor: 1024 ** i }));
    const unitOf = (kib) => SPEED_UNITS.findLast((unit) => kib >= unit.factor) ?? SPEED_UNITS[0];

    const formatSpeed = (kib) => {
        const unit = unitOf(kib);
        return { value: Number((kib / unit.factor).toFixed(2)).toString(), unit: unit };
    };

    // a note on the card's label line once a speed limit reaches the most the server stores
    const noteSpeedLimit = (card, id, limited) => {
        if (card === null)
            return;

        let note = card.querySelector(":scope > .modernSpeedNote");
        if (!limited) {
            if (note?.dataset.field === id)
                note.remove();
            return;
        }

        if (note === null) {
            note = document.createElement("div");
            note.className = "modernSpeedNote";
            note.setAttribute("role", "alert");
            card.append(note);
        }
        note.dataset.field = id;
        const { value, unit } = formatSpeed(MAX_SPEED);
        note.textContent = "QBT_TR(Speed limits go up to %1)QBT_TR[CONTEXT=SpeedLimit]".replace("%1", `${value} ${unit.name}`);
    };

    // a typed speed ("5", "5 m", "1.5 GiB/s") in KiB/s, not capped; a unit by its first letter, as shown or in English
    const parseSpeed = (text, unit) => {
        const match = /^\s*(\d+(?:[.,]\d*)?|[.,]\d+)\s*(\S?)/.exec(text);
        if (match === null)
            return 0;

        const letter = match[2].toLowerCase();
        const typedUnit = (letter === "") ? unit : (SPEED_UNITS.find((known) => known.name[0].toLowerCase() === letter) ?? SPEED_UNITS[["k", "m", "g"].indexOf(letter)] ?? unit);
        return Math.round(Number(match[1].replace(",", ".")) * typedUnit.factor);
    };

    // slider positions: 0 is no limit, the others speeds with two significant digits in their unit
    const SLIDER_STEPS = 1000;

    const roundSpeed = (kib) => {
        const unit = unitOf(kib);
        const value = kib / unit.factor;
        const precision = (value < 10) ? 0.1 : (10 ** (Math.floor(Math.log10(value)) - 1));
        return Math.max(1, Math.round(Math.round(value / precision) * precision * unit.factor));
    };
    const speedAt = (position) => ((position <= 0) ? 0 : Math.min(MAX_SPEED, roundSpeed(MAX_SPEED ** (position / SLIDER_STEPS))));
    const sliderPosition = (kib) => ((kib <= 0) ? 0 : Math.min(SLIDER_STEPS, Math.max(1, Math.round((Math.log(kib) / Math.log(MAX_SPEED)) * SLIDER_STEPS))));

    // the next speed along the slider, skipping positions that show the same speed
    const stepSpeed = (kib, direction) => {
        let position = sliderPosition(kib) + direction;
        while ((position >= 0) && (position <= SLIDER_STEPS)) {
            const next = speedAt(position);
            if ((direction > 0) ? (next > kib) : (next < kib))
                return next;

            position += direction;
        }
        return kib;
    };

    const STEP_KEYS = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 };

    // a speed field with a unit to pick; the page's own field, hidden, keeps whole KiB/s
    const addSpeedUnitPicker = (input, { limit = true } = {}) => {
        const card = limit ? input.closest("fieldset") : null;
        const picker = document.createElement("span");
        picker.className = "modernSpeedPicker";
        const value = document.createElement("input");
        value.type = "number";
        value.min = "0";
        value.step = "any";
        value.setAttribute("aria-label", input.labels[0]?.textContent.trim() ?? "");
        const unit = document.createElement("select");
        unit.setAttribute("aria-label", "QBT_TR(Unit)QBT_TR[CONTEXT=OptionsDialog]");
        for (const [i, { name }] of SPEED_UNITS.entries())
            unit.add(new Option(name, i.toString()));
        picker.append(value, unit);
        input.hidden = true;
        input.after(picker);

        const write = () => {
            const kib = Number(value.value) * SPEED_UNITS[unit.value].factor;
            // what isn't a speed is left for the page to point out
            input.value = ((value.value !== "") && (kib > 0)) ? Math.min(MAX_SPEED, Math.max(1, Math.round(kib))).toString() : value.value;
            // MooTools replaces window.Event
            input.dispatchEvent(new CustomEvent("input", { bubbles: true }));
            noteSpeedLimit(card, input.id, false);
        };
        value.addEventListener("input", (_event) => write());
        unit.addEventListener("change", (_event) => write());
        // the field is switched on and off with its setting
        const follow = () => {
            value.disabled = input.disabled;
            unit.disabled = input.disabled;
        };
        new MutationObserver(follow).observe(input, { attributes: true, attributeFilter: ["disabled"] });
        follow();

        const show = () => {
            const kib = Number(input.value);
            const index = Math.max(0, SPEED_UNITS.findLastIndex(({ factor }) => (kib > 0) && ((kib % factor) === 0)));
            unit.value = index.toString();
            value.value = (input.value === "") ? "" : (kib / SPEED_UNITS[index].factor).toString();
        };
        // a speed typed beyond the most shows as that most, which is what is saved, once the focus leaves the field and unit
        picker.addEventListener("focusout", (event) => {
            if (picker.contains(event.relatedTarget) || ((Number(value.value) * SPEED_UNITS[unit.value].factor) <= MAX_SPEED))
                return;

            show();
            noteSpeedLimit(card, input.id, true);
        });
        return show;
    };

    // the limits of torrents that have different ones
    const MIXED = "QBT_TR(Mixed)QBT_TR[CONTEXT=PropListDelegate]";

    // a logarithmic slider, with a field beside it whose arrows step it; the page's own field, hidden, keeps KiB/s
    const addSpeedSlider = (slider, input, { mixed = false } = {}) => {
        if (!responsive.isModern())
            return;

        const unitLabel = (input.nextElementSibling?.tagName === "SPAN") ? input.nextElementSibling : null;
        unitLabel?.classList.add("modernSpeedUnit");
        const field = document.createElement("input");
        field.type = "text";
        field.className = "modernSpeedField";
        field.inputMode = "decimal";
        field.setAttribute("aria-label", input.getAttribute("aria-label"));
        field.setAttribute("role", "spinbutton");
        field.setAttribute("aria-valuemin", "0");
        field.setAttribute("aria-valuemax", MAX_SPEED.toString());
        const stepper = document.createElement("span");
        stepper.className = "modernSpeedStepper";

        let kib = mixed ? null : (Number(input.value) || 0);
        if (mixed)
            field.placeholder = MIXED;
        let shown = "";
        // what the page reads: KiB/s, ∞ for no limit, nothing while mixed
        const pageValue = (value) => {
            if (value === null)
                return "";

            return (value === 0) ? "∞" : value.toString();
        };
        const show = () => {
            if (kib === null) {
                field.value = "";
                shown = "";
                field.removeAttribute("aria-valuenow");
                field.setAttribute("aria-valuetext", MIXED);
                slider.setAttribute("aria-valuetext", MIXED);
                if (unitLabel !== null)
                    unitLabel.style.visibility = "hidden";
                input.value = "";
                return;
            }

            const { value, unit } = formatSpeed(kib);
            field.value = (kib === 0) ? "∞" : value;
            shown = field.value;
            const text = (kib === 0) ? field.value : `${value} ${unit.name}`;
            field.setAttribute("aria-valuenow", kib.toString());
            field.setAttribute("aria-valuetext", text);
            slider.setAttribute("aria-valuetext", text);
            if (unitLabel !== null) {
                unitLabel.textContent = unit.name;
                unitLabel.style.visibility = (kib === 0) ? "hidden" : "";
            }
            input.value = pageValue(kib);
        };
        const setSpeed = (value) => {
            kib = value;
            slider.value = sliderPosition(kib);
            show();
        };
        // what the field shows or has typed in, at most what the server stores
        const typed = () => ((field.value === shown) ? kib : Math.min(MAX_SPEED, parseSpeed(field.value, unitOf(kib))));
        const card = slider.closest("fieldset");
        const step = (direction) => {
            setSpeed(stepSpeed(typed(), direction));
            noteSpeedLimit(card, input.id, (kib === MAX_SPEED));
        };

        for (const direction of [-1, 1]) {
            const arrow = document.createElement("span");
            arrow.className = (direction > 0) ? "modernSpeedUp" : "modernSpeedDown";
            arrow.setAttribute("aria-hidden", "true");
            // the focus stays in the field
            arrow.addEventListener("mousedown", (event) => event.preventDefault());
            arrow.addEventListener("click", (_event) => step(direction));
            stepper.append(arrow);
        }
        stepper.firstElementChild.after(field);
        input.before(stepper);
        input.type = "hidden";

        slider.min = 0;
        slider.max = SLIDER_STEPS;
        slider.step = 1;
        // before the page's own handler, which reads the slider as linear
        slider.addEventListener("input", (event) => {
            event.stopImmediatePropagation();
            kib = speedAt(Number(slider.value));
            show();
            noteSpeedLimit(card, input.id, (kib === MAX_SPEED));
        }, true);
        // the page reads its field before the typed speed is shown anew
        field.addEventListener("input", (_event) => {
            input.value = pageValue(typed());
            noteSpeedLimit(card, input.id, false);
        });
        field.addEventListener("change", (_event) => {
            setSpeed(typed());
            noteSpeedLimit(card, input.id, (kib === MAX_SPEED));
        });
        field.addEventListener("keydown", (event) => {
            const steps = STEP_KEYS[event.key];
            if (steps === undefined)
                return;

            event.preventDefault();
            for (let i = 0; i < Math.abs(steps); ++i)
                step(Math.sign(steps));
        });
        setSpeed(kib);
    };

    // the status bar's speeds open the global speed limits above them, as a popup or a sheet, or, detached, in their window
    const SPEED_LIMITS_WINDOW = "globalSpeedLimitsPage";

    const afterWindowsClose = (ids, then) => {
        const open = ids.map((id) => MochaUI.Windows.instances[id]).filter((instance) => instance?.windowEl.isConnected);
        let left = open.length;
        if (left === 0) {
            then();
            return;
        }
        for (const instance of open) {
            instance.addEvent("closeComplete", () => {
                if (--left === 0)
                    then();
            });
            window.qBittorrent.Client.closeWindow(instance.windowEl);
        }
    };

    const initSpeedLimits = (cells) => {
        const popup = document.createElement("div");
        popup.id = "modernSpeedLimits";
        popup.className = "invisible";
        popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-label", "QBT_TR(Global Speed Limits)QBT_TR[CONTEXT=MainWindow]");
        const page = document.createElement("div");
        const detach = document.createElement("button");
        detach.type = "button";
        detach.className = "modernDetachButton";
        detach.title = "QBT_TR(Open in a window)QBT_TR[CONTEXT=MainWindow]";
        detach.setAttribute("aria-label", detach.title);
        popup.append(page, detach);
        // outside the bar, whose icon size would apply
        document.body.append(popup);
        const setExpanded = (expanded) => {
            for (const cell of cells)
                cell.setAttribute("aria-expanded", expanded.toString());
        };
        for (const cell of cells) {
            cell.setAttribute("aria-haspopup", "dialog");
            cell.setAttribute("aria-controls", popup.id);
        }
        setExpanded(false);

        // open from the click on, so what closes it also drops a load still under way
        let loads = 0;
        let shown = null;
        const close = () => {
            ++loads;
            if (shown === null)
                return;

            const { scrim, removePopup, releaseFocus } = shown;
            shown = null;
            popup.classList.add("invisible");
            page.replaceChildren();
            scrim?.remove();
            removePopup();
            setExpanded(false);
            releaseFocus();
        };
        closeSpeedLimitsPopup = close;

        const open = async () => {
            const load = ++loads;
            shown = {
                scrim: null,
                // the speeds close it themselves
                removePopup: addPopup(popup, () => close(), { keepOpenFor: ".modernStatusSpeed" }),
                releaseFocus: () => {}
            };
            setExpanded(true);
            const response = await fetch("views/globalspeedlimits.html?v=${CACHEID}").catch(() => null);
            const text = response?.ok ? await response.text() : null;
            if (load !== loads)
                return;
            if (text === null) {
                close();
                return;
            }

            // the page's module is defined once and set up anew for each opening
            const view = new DOMParser().parseFromString(text, "text/html");
            const script = view.querySelector("script");
            script.remove();
            page.replaceChildren(...view.head.children, ...view.body.childNodes);
            const sheet = responsive.queries.coarse.matches || responsive.queries.phone.matches;
            popup.classList.toggle("modernSheet", sheet);
            popup.classList.remove("invisible");
            if (sheet)
                shown.scrim = responsive.addScrim(() => close(), "modernStatusScrim");
            if (window.qBittorrent.GlobalSpeedLimits === undefined) {
                const run = document.createElement("script");
                run.textContent = script.textContent;
                page.append(run);
            }
            else {
                window.qBittorrent.GlobalSpeedLimits.init();
            }
            // Apply is the main action; after the page's own handler, which reads the limits, it closes the popup
            setUpFooter(page.querySelector(".dialogFooter"), null);
            document.getElementById("applyButton").addEventListener("click", (_event) => close());
            shown.releaseFocus = responsive.trapFocus(popup);
        };

        const isDetached = () => localPreferences.get("speed_limits_detached") === "true";
        const openWindow = () => {
            close();
            afterWindowsClose([TORRENT_SPEED_LIMITS_WINDOW], () => globalLimitFN());
        };
        detach.addEventListener("click", (_event) => {
            localPreferences.set("speed_limits_detached", "true");
            openWindow();
        });
        for (const cell of cells) {
            cell.addEventListener("click", (_event) => {
                if (shown !== null)
                    close();
                else if (isDetached())
                    openWindow();
                else
                    afterWindowsClose([SPEED_LIMITS_WINDOW, TORRENT_SPEED_LIMITS_WINDOW], () => open());
            });
        }
        for (const query of [responsive.queries.coarse, responsive.queries.phone])
            query.addEventListener("change", (_event) => close());

        // the window's button, beside its close button, attaches them back
        responsive.addWindowHook((instance) => {
            if ((instance.options.id !== SPEED_LIMITS_WINDOW) || !instance.controlsEl || (instance.controlsEl.querySelector(".modernAttachButton") !== null))
                return;

            const attach = document.createElement("button");
            attach.type = "button";
            attach.className = "modernAttachButton";
            attach.title = "QBT_TR(Attach to the status bar)QBT_TR[CONTEXT=MainWindow]";
            attach.setAttribute("aria-label", attach.title);
            attach.addEventListener("click", (_event) => {
                localPreferences.set("speed_limits_detached", "false");
                afterWindowsClose([SPEED_LIMITS_WINDOW], () => open());
            });
            instance.controlsEl.append(attach);
        });
    };

    // one Speed limits item in the torrent menu, instead of its two, opens the speed limits page for the selected torrents
    const TORRENT_SPEED_LIMITS_WINDOW = "torrentSpeedLimitsPage";

    // set as the status bar is built
    let closeSpeedLimitsPopup = () => {};

    const openTorrentSpeedLimits = () => {
        const hashes = window.torrentsTable.selectedRowsIds();
        if (hashes.length === 0)
            return;

        closeSpeedLimitsPopup();
        afterWindowsClose([SPEED_LIMITS_WINDOW, TORRENT_SPEED_LIMITS_WINDOW], () => new MochaUI.Window({
            id: TORRENT_SPEED_LIMITS_WINDOW,
            icon: "images/qbittorrent-tray.svg",
            title: "QBT_TR(Speed limits)QBT_TR[CONTEXT=SpeedLimit]",
            // not data, which the window would send in the page's URL
            limitHashes: hashes,
            loadMethod: "xhr",
            contentURL: "views/globalspeedlimits.html?v=${CACHEID}",
            scrollbars: false,
            resizable: false,
            maximizable: false,
            paddingVertical: 0,
            paddingHorizontal: 0,
            width: window.qBittorrent.Dialog.limitWidthToViewport(480),
            height: 150
        }));
    };

    const initTorrentSpeedLimits = () => {
        const downloadLimit = document.querySelector("#torrentsTableMenu a[href='#downloadLimit']").parentElement;
        const link = document.createElement("a");
        link.href = "#speedLimits";
        const img = document.createElement("img");
        img.src = "images/slow_off.svg";
        img.alt = "";
        link.append(img, "QBT_TR(Speed limits)QBT_TR[CONTEXT=SpeedLimit]");
        // the menu has no such action
        link.addEventListener("click", (_event) => openTorrentSpeedLimits());
        const item = document.createElement("li");
        item.className = "separator";
        item.append(link);
        downloadLimit.before(item);
    };

    // settings pointed out get a ring that fades out
    const POINT_OUT_TIME = 2400;
    let pointedOut = [];
    let pointOutTimer = -1;

    const pointOut = (settings) => {
        for (const section of pointedOut)
            section.classList.remove("modernHighlight");
        clearTimeout(pointOutTimer);

        const sections = settings.map((setting) => {
            const row = setting.closest(".formRow, tr");
            const card = row?.closest("fieldset") ?? null;
            if ((card !== null) && (card.querySelectorAll(".formRow, tr").length === 1))
                return { section: card, card: null };
            return (row === null) ? null : { section: row, card: card };
        }).filter(Boolean);
        sections[0]?.section.scrollIntoView({ block: "center" });

        // measured, then set
        const spans = sections.map(({ section, card }) => {
            if (card === null)
                return null;

            const cardBox = card.getBoundingClientRect();
            const box = section.getBoundingClientRect();
            return { left: cardBox.left - box.left, right: box.right - cardBox.right, top: ((box.top - cardBox.top) < 12) ? (cardBox.top - box.top) : 0 };
        });
        for (const [i, { section }] of sections.entries()) {
            if (spans[i] !== null) {
                section.style.setProperty("--modern-highlight-left", `${spans[i].left}px`);
                section.style.setProperty("--modern-highlight-right", `${spans[i].right}px`);
                section.style.setProperty("--modern-highlight-top", `${spans[i].top}px`);
            }
            section.classList.add("modernHighlight");
        }
        pointedOut = sections.map(({ section }) => section);
        pointOutTimer = setTimeout(() => {
            for (const section of pointedOut)
                section.classList.remove("modernHighlight");
            pointedOut = [];
        }, POINT_OUT_TIME);
    };

    // opens Options at a page and points out settings on it, at once or once its window has loaded them
    let showWhenLoaded = null;
    const watchedOptions = new WeakSet();

    const openOptionsPage = (linkId, settingIds) => {
        const show = () => {
            const link = document.getElementById(linkId);
            const settings = settingIds.map((id) => document.getElementById(id));
            if ((link === null) || settings.includes(null))
                return false;

            link.click();
            pointOut(settings);
            return true;
        };
        if (show())
            return;

        showWhenLoaded = show;
        const instance = MochaUI.Windows.instances["preferencesPage"];
        if (instance === undefined)
            document.getElementById("preferencesLink").click();
        else
            watchOptionsWindow(instance);
    };

    // the Options window says when it has loaded its page and its tabs
    const watchOptionsWindow = (instance) => {
        if ((instance.options.id !== "preferencesPage") || (showWhenLoaded === null))
            return;

        const tryShow = () => {
            if ((showWhenLoaded !== null) && showWhenLoaded())
                showWhenLoaded = null;
        };
        tryShow();
        if (watchedOptions.has(instance))
            return;

        watchedOptions.add(instance);
        instance.addEvent("contentLoaded", tryShow);
        instance.addEvent("close", () => {
            showWhenLoaded = null;
        });
    };

    const init = () => {
        if (!responsive.isModern())
            return;

        initPopups();
        initMenubar();
        initPropertiesTabs();
        initDialogs();
        initRemovalQuestions();
        responsive.addWindowHook(placeWindow);
        responsive.addWindowHook(resizeAtCorner);
        initPhoneHeader();
        initPropertiesSheet();
        initPropertyCards();
        initPropertiesPanelHeight();
        initSortSheet();
        initSelectionCheckboxes();
        initStatusBar();
        initTorrentSpeedLimits();
        responsive.addWindowHook(watchOptionsWindow);
    };

    // set up by preferences.html with the functions of its page it uses
    const optionsPage = ({ addWatchFolder, applyPreferences, loadPreferences, updatePeerProxySettings }) => {
        let modernOptions = null;

        // a unit beside a field gets an element of its own, and with the field a box, so they line up with the dropdowns
        const markFieldUnits = (page) => {
            for (const cell of page.querySelectorAll(".PrefTab :is(td, div.formRow):has(> input)")) {
                for (const node of [...cell.childNodes]) {
                    if (node.nodeType !== Node.TEXT_NODE)
                        continue;

                    const text = node.textContent.trim();
                    if (text === "") {
                        if (node.textContent.includes(" "))
                            node.remove();
                        continue;
                    }
                    const unit = document.createElement("span");
                    unit.className = "prefUnit";
                    unit.textContent = text;
                    node.replaceWith(unit);
                    const field = unit.previousElementSibling;
                    if (field?.matches("input")) {
                        const box = document.createElement("span");
                        box.className = "prefField";
                        field.before(box);
                        box.append(field, unit);
                    }
                }
            }
        };

        // the schedule's times, hours and minutes, each on a row with its label
        const splitSchedule = () => {
            const row = document.getElementById("scheduleFromHourLabel").parentElement;
            const toRow = document.createElement("div");
            toRow.className = "formRow";
            row.after(toRow);
            const times = [
                ["scheduleFromHourLabel", "schedule_from_hour", "schedule_from_min", row],
                ["scheduleToHourLabel", "schedule_to_hour", "schedule_to_min", toRow]
            ];
            for (const [label, hour, minute, target] of times) {
                const time = document.createElement("span");
                time.className = "modernTime";
                const colon = document.createElement("span");
                colon.textContent = ":";
                colon.setAttribute("aria-hidden", "true");
                time.append(document.getElementById(hour), colon, document.getElementById(minute));
                target.append(document.getElementById(label), time);
            }
            // the colons left between the fields
            for (const node of [...row.childNodes]) {
                if ((node.nodeType === Node.TEXT_NODE) && (node.textContent.trim() !== ""))
                    node.remove();
            }
        };

        // Enable proxy server: off is the type None, on the type used last
        const addProxySwitch = (state) => {
            const select = document.getElementById("peer_proxy_type_select");
            const box = document.createElement("input");
            box.type = "checkbox";
            box.id = "modernProxyEnabled";
            const label = document.createElement("label");
            label.htmlFor = box.id;
            label.textContent = "QBT_TR(Enable proxy server)QBT_TR[CONTEXT=OptionsDialog]";
            const row = document.createElement("div");
            row.className = "formRow modernEnableRow";
            row.append(box, label);
            select.closest("fieldset").querySelector(":scope > legend").after(row);
            select.closest("table").id = "peerProxyServerTable";

            let lastType = "SOCKS5";
            const sync = () => {
                if (select.value !== "None")
                    lastType = select.value;
                box.checked = (select.value !== "None");
            };
            box.addEventListener("change", (_event) => {
                select.value = box.checked ? lastType : "None";
                updatePeerProxySettings();
            });
            select.addEventListener("change", (_event) => sync());
            state.onFilled.push(sync);
        };

        // Enable I2P: the switch in the heading moves to a row of its own
        const addI2PSwitch = () => {
            const box = document.getElementById("i2pEnabledCheckbox");
            const legend = box.parentElement;
            const label = document.createElement("label");
            label.htmlFor = box.id;
            label.textContent = "QBT_TR(Enable I2P)QBT_TR[CONTEXT=OptionsDialog]";
            const row = document.createElement("div");
            row.className = "formRow modernEnableRow";
            row.append(box, label);
            legend.after(row);
        };

        // classes for the page's structure, set once: as :has() rules, the browser would restyle most of the page whenever a
        // switch changes
        const STRUCTURE_CLASSES = [
            ["modernSwitchEndRow", "tr:has(> td:last-child:not(:first-child) > input[type='checkbox']:only-child)"],
            ["modernFieldWithButton", "div.formRow:has(> input + button)"],
            ["modernSwitchList", "div.formRow:has(> input[type='checkbox']) + div.formRow:has(> textarea)"],
            ["modernSwitchSpan", "div.formRow > span:has(> input[type='checkbox']:first-child + label)"],
            ["modernCardEnd", "> div.formRow:not(:has(+ div.formRow))"],
            ["modernSwitchRow", "tr:has(> td:first-child > input[type='checkbox']:first-child + label)"],
            ["modernSwitchField", "tr:has(> td:first-child > input[type='checkbox']:first-child + label) > td:not(:first-child)"],
            ["modernIconTable", "table:has(td[rowspan])"],
            ["modernSwitchFirstRow", "tr:has(> td:first-child > input[type='checkbox']:only-child)"],
            ["modernSwitchCard", "fieldset:has(> legend input[type='checkbox'])"],
            ["modernCardPart", "fieldset:has(> legend input[type='checkbox'], > .modernEnableRow) > :not(legend, .modernEnableRow)"],
            ["modernSeedingAction", "tr:has(> td > #maxRatioSelect)"],
            ["modernAutorunNotes", "fieldset:has(#autorun_checkbox) > div:not(.formRow)"],
            ["modernApiKeyRow", "tr:has(> td > #WebUIAPIKeyText)"],
            ["modernWideCell", "td:has(> input.pathDirectory, > .listEditor)"]
        ];

        const markStructures = (page) => {
            for (const [name, selector] of STRUCTURE_CLASSES) {
                for (const element of page.querySelectorAll(`.PrefTab ${selector}`))
                    element.classList.add(name);
            }
        };

        // a control wider than the column of controls gets a row of its own below its label
        const WIDE_CONTROLS = ["select:not([multiple]):only-of-type", "input[type='text']:only-of-type"]
            .flatMap((control) => [`.PrefTab tr > td:last-child:not(:first-child) > ${control}`, `.PrefTab tr.modernSettingValue > td > ${control}`])
            .join(", ");

        const splitWideSettings = (state) => {
            const context = document.createElement("canvas").getContext("2d");
            const textWidths = new WeakMap();

            const split = () => {
                const shown = state.page.querySelector(".PrefTab:not(.invisible)");
                if (shown === null)
                    return;

                // samples on the page shown, as most controls are on hidden pages
                const probe = document.createElement("div");
                probe.style.width = "var(--modern-select-width)";
                const field = document.createElement("input");
                const dropdown = document.createElement("select");
                probe.append(field, dropdown);
                shown.append(probe);
                const column = probe.getBoundingClientRect().width;
                const fieldFontSize = Number.parseFloat(getComputedStyle(field).fontSize);
                const style = getComputedStyle(dropdown);
                const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
                const frame = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
                    + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);
                probe.remove();

                const neededWidth = (control) => {
                    if (control.tagName !== "SELECT")
                        return control.style.width.endsWith("em") ? (Number.parseFloat(control.style.width) * fieldFontSize) : 0;

                    let known = textWidths.get(control);
                    if ((known?.options !== control.options.length) || (known.font !== font)) {
                        context.font = font;
                        known = { options: control.options.length, font: font, width: Math.max(0, ...[...control.options].map((option) => context.measureText(option.textContent).width)) };
                        textWidths.set(control, known);
                    }
                    return known.width + frame;
                };

                for (const control of state.page.querySelectorAll(WIDE_CONTROLS)) {
                    const cell = control.parentElement;
                    const row = cell.parentElement;
                    const valueRow = row.classList.contains("modernSettingValue");
                    const labelRow = valueRow ? row.previousElementSibling : row;
                    // a setting the page hides keeps its place
                    if (labelRow.hidden || (labelRow.style.display === "none"))
                        continue;

                    const wide = (column > 0) && (neededWidth(control) > column);
                    if (wide && !valueRow) {
                        const newRow = document.createElement("tr");
                        newRow.className = "modernSettingValue";
                        cell.colSpan = row.cells.length;
                        row.cells[0].colSpan = row.cells.length;
                        row.after(newRow);
                        newRow.append(cell);
                    }
                    else if (!wide && valueRow) {
                        cell.colSpan = 1;
                        labelRow.cells[0].colSpan = 1;
                        labelRow.append(cell);
                        row.remove();
                    }
                }
            };
            const splitSoon = window.qBittorrent.Misc.createDebounceHandler(50, split);

            // first as the filled page is laid out, then as the column's width changes or a dropdown is filled later
            state.onFilled.push(() => {
                let width = null;
                const resizeObserver = new ResizeObserver(() => {
                    if (state.page.clientWidth === width)
                        return;

                    const first = (width === null);
                    width = state.page.clientWidth;
                    if (first)
                        split();
                    else
                        splitSoon();
                });
                resizeObserver.observe(state.page);
                const fillObserver = new MutationObserver(() => splitSoon());
                for (const select of state.page.querySelectorAll(".PrefTab select:not([multiple])"))
                    fillObserver.observe(select, { childList: true });
                state.observers.push(resizeObserver, fillObserver);
            });
        };

        // speeds get a unit to pick, in place of the page's KiB/s
        const SPEED_FIELDS = ["upLimitValue", "dlLimitValue", "altUpLimitValue", "altDlLimitValue", "dlRateThresholdValue", "ulRateThresholdValue"];
        // the slow torrents' thresholds, which aren't limits
        const RATE_THRESHOLDS = ["dlRateThresholdValue", "ulRateThresholdValue"];

        const addSpeedUnits = (state) => {
            for (const id of SPEED_FIELDS) {
                const field = document.getElementById(id);
                if (field.nextSibling?.nodeType === Node.TEXT_NODE)
                    field.nextSibling.remove();
                state.onFilled.push(window.parent.qBittorrent.Modern.addSpeedUnitPicker(field, { limit: !RATE_THRESHOLDS.includes(id) }));
            }
        };

        // lists edited entry by entry; the page's own field, hidden, keeps the list as the page loads and saves it
        const LIST_EDITORS = [
            { id: "banned_IPs_textarea", joiner: "\n", splitter: /\n/, wholeLines: true },
            { id: "add_trackers_textarea", joiner: "\n", splitter: /\n/, tiers: true },
            { id: "bypass_auth_subnet_whitelist_textarea", joiner: "\n", splitter: /[\n,]/ },
            { id: "webuiDomainTextarea", joiner: ";", splitter: /[;\n]/ },
            { id: "webUIReverseProxiesListTextarea", joiner: ";", splitter: /[;\n]/ },
            { id: "dhtBootstrapNodes", joiner: ", ", splitter: /,/ },
            { id: "webUICustomHTTPHeadersTextarea", joiner: "\n", splitter: /\n/, wholeLines: true }
        ];

        const nameOf = (field) => {
            const label = field.labels?.[0] ?? document.getElementById(field.getAttribute("aria-labelledby"));
            return [...(label?.childNodes ?? [])].filter((node) => node.nodeName !== "A").map((node) => node.textContent).join("").trim();
        };

        const addListEditor = (state, { id, joiner, splitter, tiers = false, wholeLines = false }) => {
            const field = document.getElementById(id);
            // null marks a break between tiers
            const parse = (text) => {
                const entries = [];
                for (const value of text.split(splitter).map((entry) => entry.trim())) {
                    if (value !== "")
                        entries.push(value);
                    else if (tiers && (entries.length > 0) && (entries.at(-1) !== null))
                        entries.push(null);
                }
                if (entries.at(-1) === null)
                    entries.pop();
                return entries;
            };
            const join = (entries) => entries.map((entry) => entry ?? "").join(joiner);

            const editor = document.createElement("div");
            editor.className = "listEditor";
            const list = document.createElement("ul");
            list.className = "listEditorItems";
            list.setAttribute("aria-label", nameOf(field));
            const input = document.createElement("input");
            input.type = "text";
            input.autocomplete = "off";
            input.spellcheck = false;
            input.setAttribute("aria-label", nameOf(field));
            input.title = field.title;
            const addButton = document.createElement("button");
            addButton.type = "button";
            addButton.textContent = "QBT_TR(Add)QBT_TR[CONTEXT=HttpServer]";
            const addRow = document.createElement("div");
            addRow.className = "listEditorAdd";
            addRow.append(input, addButton);
            editor.append(list, addRow);
            field.classList.add("hasListEditor");
            field.after(editor);

            const write = (entries) => {
                field.value = join(parse(join(entries)));
                render();
                // MooTools replaces window.Event
                field.dispatchEvent(new CustomEvent("change", { bubbles: true }));
            };
            const render = () => {
                const entries = parse(field.value);
                const items = [];
                for (const [index, entry] of entries.entries()) {
                    if (entry === null)
                        continue;

                    const item = document.createElement("li");
                    const text = document.createElement("span");
                    text.textContent = entry;
                    const remove = document.createElement("button");
                    remove.type = "button";
                    remove.className = "listEditorRemove";
                    remove.title = "QBT_TR(Remove %1)QBT_TR[CONTEXT=OptionsDialog]".replace("%1", () => entry);
                    remove.setAttribute("aria-label", remove.title);
                    remove.disabled = field.disabled;
                    remove.addEventListener("click", (_event) => {
                        const position = items.indexOf(item);
                        entries.splice(index, 1);
                        write(entries);
                        // the focus moves to the entry that took the removed one's place, or to the field
                        const buttons = list.querySelectorAll("button");
                        (buttons[Math.min(position, buttons.length - 1)] ?? input).focus();
                    });
                    item.append(text, remove);
                    items.push(item);
                }
                list.replaceChildren(...items);
                list.hidden = (items.length === 0);
                input.placeholder = (items.length === 0) ? field.placeholder : "";
                input.disabled = field.disabled;
                addButton.disabled = field.disabled;
            };
            const add = (text) => {
                const entries = parse(field.value);
                for (const value of text.split(wholeLines ? /\n/ : (tiers ? /\s+/ : /[\s,;]+/)).map((entry) => entry.trim())) {
                    if ((value !== "") && !entries.includes(value))
                        entries.push(value);
                }
                input.value = "";
                write(entries);
            };

            addButton.addEventListener("click", (_event) => {
                add(input.value);
                input.focus();
            });
            input.addEventListener("keydown", (event) => {
                if (event.key !== "Enter")
                    return;

                event.preventDefault();
                add(input.value);
            });
            // several entries pasted are added at once
            input.addEventListener("paste", (event) => {
                const pasted = event.clipboardData?.getData("text") ?? "";
                if (!(wholeLines ? /\n/ : /[\s,;]/).test(pasted.trim()))
                    return;

                event.preventDefault();
                add(input.value.slice(0, input.selectionStart) + pasted + input.value.slice(input.selectionEnd));
            });
            // what was typed but not added is saved too
            state.beforeSave.push(() => {
                if (input.value.trim() !== "")
                    add(input.value);
            });
            // the field is switched on and off with its setting
            const observer = new MutationObserver(render);
            observer.observe(field, { attributes: true, attributeFilter: ["disabled"] });
            state.observers.push(observer);
            state.onFilled.push(render);
            render();
        };

        // the monitored folders: a button each that removes it, the last, empty one with Add
        const editWatchedFolders = (state) => {
            const table = document.getElementById("watched_folders_tab");
            const [folderName, locationName] = [...table.tHead.rows[0].cells].map((cell) => cell.textContent.trim());
            const update = () => {
                const rows = [...table.tBodies[0].rows];
                for (const [i, row] of rows.entries()) {
                    const folder = row.cells[0].querySelector("input");
                    folder.placeholder = folderName;
                    folder.setAttribute("aria-label", folderName);
                    row.cells[1].querySelector("select").setAttribute("aria-label", locationName);
                    const last = (i === (rows.length - 1));
                    const cell = row.querySelector(":scope > td.modernWatchedFolderButton") ?? row.insertCell();
                    cell.className = "modernWatchedFolderButton";
                    let button = cell.firstElementChild;
                    if ((button === null) || (button.classList.contains("listEditorRemove") === last)) {
                        button = document.createElement("button");
                        button.type = "button";
                        if (last) {
                            button.textContent = "QBT_TR(Add)QBT_TR[CONTEXT=HttpServer]";
                            button.addEventListener("click", (_event) => {
                                addWatchFolder();
                                table.tBodies[0].rows[table.tBodies[0].rows.length - 1].cells[0].querySelector("input").focus();
                            });
                        }
                        else {
                            button.className = "listEditorRemove";
                            button.addEventListener("click", (_event) => {
                                folder.value = "";
                                row.classList.add("invisible");
                                folder.dispatchEvent(new CustomEvent("input", { bubbles: true }));
                                // the focus stays in the list
                                const next = [...table.tBodies[0].rows].find((other) => (other.rowIndex > row.rowIndex) && !other.classList.contains("invisible"));
                                next?.querySelector("td.modernWatchedFolderButton > button").focus();
                            });
                        }
                        cell.replaceChildren(button);
                    }
                    if (!last) {
                        button.title = "QBT_TR(Remove %1)QBT_TR[CONTEXT=OptionsDialog]".replace("%1", () => folder.value.trim());
                        button.setAttribute("aria-label", button.title);
                    }
                    button.disabled = last && (folder.value.trim() === "");
                }
            };
            const observer = new MutationObserver(update);
            observer.observe(table.tBodies[0], { childList: true });
            state.observers.push(observer);
            table.addEventListener("input", (_event) => update(), { signal: state.listening.signal });
            update();
        };

        // a switch for the alternative speed limits, saved with the page; unusable until their mode has been read
        const addSpeedLimitsSwitch = (state) => {
            const box = document.createElement("input");
            box.type = "checkbox";
            box.id = "modernAltSpeedLimits";
            box.disabled = true;
            const label = document.createElement("label");
            label.htmlFor = box.id;
            label.textContent = "QBT_TR(Alternative speed limits)QBT_TR[CONTEXT=MainWindow]";
            const row = document.createElement("div");
            row.className = "formRow";
            row.append(box, label);
            document.getElementById("altUpLimitValue").closest("fieldset").querySelector(":scope > legend").after(row);

            const showIcon = () => {
                const icon = document.querySelector("#PrefSpeedLink img");
                if (icon !== null)
                    icon.src = box.checked ? "images/slow.svg" : "images/slow_off.svg";
            };
            box.addEventListener("change", (_event) => showIcon());
            state.speedLimitsMode = null;
            fetch("api/v2/transfer/speedLimitsMode", {
                    method: "GET",
                    cache: "no-store",
                    signal: state.listening.signal
                })
                .then(async (response) => {
                    if (!response.ok)
                        return;

                    state.speedLimitsMode = (await response.text()) === "1";
                    box.checked = state.speedLimitsMode;
                    box.disabled = false;
                    showIcon();
                })
                .catch(() => {});
        };

        // accent colors, below the display mode
        const ACCENT_COLORS = [
            ["blue", "QBT_TR(Blue)QBT_TR[CONTEXT=OptionsDialog]"],
            ["indigo", "QBT_TR(Indigo)QBT_TR[CONTEXT=OptionsDialog]"],
            ["purple", "QBT_TR(Purple)QBT_TR[CONTEXT=OptionsDialog]"],
            ["pink", "QBT_TR(Pink)QBT_TR[CONTEXT=OptionsDialog]"],
            ["red", "QBT_TR(Red)QBT_TR[CONTEXT=OptionsDialog]"],
            ["orange", "QBT_TR(Orange)QBT_TR[CONTEXT=OptionsDialog]"],
            ["green", "QBT_TR(Green)QBT_TR[CONTEXT=OptionsDialog]"],
            ["teal", "QBT_TR(Teal)QBT_TR[CONTEXT=OptionsDialog]"]
        ];

        const addAccentColor = () => {
            const select = document.createElement("select");
            select.id = "modernAccentColor";
            for (const [value, name] of ACCENT_COLORS)
                select.add(new Option(name, value));
            select.value = window.parent.qBittorrent.ClientData.get("accent_color") ?? "blue";
            const label = document.createElement("label");
            label.htmlFor = select.id;
            label.textContent = "QBT_TR(Accent color:)QBT_TR[CONTEXT=OptionsDialog]";
            const row = document.createElement("div");
            row.className = "formRow";
            row.append(label, select);
            document.getElementById("displayModeSelect").parentElement.after(row);
        };

        // Cancel, Apply and OK in place of Save; Apply saves while there are changes
        const addDialogButtons = (state) => {
            const footer = state.page.querySelector(":scope > .dialogFooter");
            const ok = footer.querySelector(":scope > input[type='button']");
            ok.value = "QBT_TR(OK)QBT_TR[CONTEXT=HttpServer]";
            ok.classList.add("dialogPrimary");
            const apply = document.createElement("button");
            apply.type = "button";
            apply.textContent = "QBT_TR(Apply)QBT_TR[CONTEXT=HttpServer]";
            apply.disabled = true;
            apply.addEventListener("click", (_event) => applyPreferences(false));
            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "dialogCancel";
            cancel.textContent = "QBT_TR(Cancel)QBT_TR[CONTEXT=MainWindow]";
            cancel.addEventListener("click", (_event) => window.parent.qBittorrent.Client.closeWindow(document.getElementById("preferencesPage")));
            labelButton(apply);
            labelButton(cancel);
            state.applyButton = apply;

            const phone = window.parent.qBittorrent.Responsive.queries.phone;
            const place = () => {
                if (phone.matches)
                    footer.append(ok, apply, cancel);
                else
                    footer.append(cancel, apply, ok);
            };
            phone.addEventListener("change", (_event) => place(), { signal: state.listening.signal });
            place();

            for (const type of ["input", "change"])
                state.page.addEventListener(type, (_event) => { apply.disabled = false; }, { signal: state.listening.signal });
        };

        // what a switch shows or hides slides open and shut; the sizes are measured, as not every browser animates a height
        // to auto
        const slideWithSwitches = (state) => {
            const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
            const measure = (element) => {
                const style = getComputedStyle(element);
                return { height: style.height, opacity: style.opacity, paddingBottom: style.paddingBottom, paddingTop: style.paddingTop, visibility: style.visibility };
            };
            state.page.addEventListener("change", (event) => {
                const box = event.target;
                const table = box.closest("table");
                if (!box.matches("input[type='checkbox']") || (table === null) || reducedMotion.matches)
                    return;

                const elements = [...table.querySelectorAll("tr, td")];
                box.checked = !box.checked;
                const before = elements.map(measure);
                box.checked = !box.checked;
                for (const [i, element] of elements.entries()) {
                    const after = measure(element);
                    if ((after.visibility !== before[i].visibility) && (after.height !== before[i].height))
                        element.animate([before[i], after], { duration: 200, easing: "ease" });
                }
            }, { signal: state.listening.signal });
        };

        const fadeAboveFooter = (state) => {
            const wrapper = state.instance.contentWrapperEl;
            const footer = state.page.querySelector(":scope > .dialogFooter");
            const update = () => {
                const fade = Number.parseFloat(getComputedStyle(footer, "::before").height) || 1;
                const left = wrapper.scrollHeight - wrapper.clientHeight - wrapper.scrollTop;
                footer.style.setProperty("--modern-more-below", Math.min(1, Math.max(0, left / fade)).toString());
            };
            wrapper.addEventListener("scroll", (_event) => update(), { passive: true, signal: state.listening.signal });
            const resizeObserver = new ResizeObserver(() => update());
            resizeObserver.observe(state.page);
            resizeObserver.observe(wrapper);
            state.observers.push(resizeObserver);
        };

        const setupModern = () => {
            if (!window.parent.qBittorrent.Responsive.isModern())
                return;

            const instance = window.MUI.Windows.instances["preferencesPage"];
            const state = {
                instance: instance,
                page: instance.contentEl,
                listening: new AbortController(),
                observers: [],
                // what comes before the page is saved
                beforeSave: [],
                // what follows once the page is filled
                onFilled: []
            };
            modernOptions = state;
            instance.addEvent("close", () => {
                state.listening.abort();
                for (const observer of state.observers)
                    observer.disconnect();
                if (modernOptions === state)
                    modernOptions = null;
                if (state.reloadOnClose)
                    window.parent.location.reload();
            });

            splitSchedule();
            addSpeedUnits(state);
            markFieldUnits(state.page);
            addProxySwitch(state);
            addI2PSwitch();
            addAccentColor();
            addSpeedLimitsSwitch(state);
            for (const editor of LIST_EDITORS)
                addListEditor(state, editor);
            editWatchedFolders(state);
            markStructures(state.page);
            splitWideSettings(state);
            slideWithSwitches(state);
            fadeAboveFooter(state);
            addDialogButtons(state);
        };

        // once loadPreferences() has filled the page
        const modernFilled = () => {
            if (modernOptions === null)
                return;

            for (const filled of modernOptions.onFilled)
                filled();
            modernOptions.onFilled = [];
        };

        // as applyPreferences() begins
        const modernBeforeSave = () => {
            for (const save of modernOptions?.beforeSave ?? [])
                save();
        };

        // as applyPreferences() gathers the client data: the accent color, none for blue
        const modernSaveLook = (clientData) => {
            if (modernOptions === null)
                return;

            const accent = document.getElementById("modernAccentColor").value;
            clientData.accent_color = (accent === "blue") ? null : accent;
        };

        // as applyPreferences() saves: the alternative speed limits' mode, where the switch changed it
        const modernSaveSpeedLimitsMode = async () => {
            if (modernOptions === null)
                return;

            const state = modernOptions;
            const enabled = document.getElementById("modernAltSpeedLimits").checked;
            if ((state.speedLimitsMode === null) || (enabled === state.speedLimitsMode))
                return;

            const response = await fetch("api/v2/transfer/setSpeedLimitsMode", {
                method: "POST",
                body: new URLSearchParams({
                    mode: enabled ? "1" : "0"
                })
            });
            if (!response.ok) {
                // the server's message, as cache.js marks it
                const error = new Error(await response.text());
                error.name = "ServerError";
                throw error;
            }
            state.speedLimitsMode = enabled;
        };

        // after a save: OK reloads the page; Apply keeps Options open and has the page reload as Options closes. False where
        // applyPreferences() goes on as in Classic
        const modernSaved = (close) => {
            if (modernOptions === null)
                return false;

            modernOptions.reloadOnClose = !close;
            if (close)
                return false;

            modernOptions.applyButton.disabled = true;
            window.parent.qBittorrent.ColorScheme.applyClientData();
            return true;
        };

        return { setupModern: setupModern, modernFilled: modernFilled, modernBeforeSave: modernBeforeSave, modernSaved: modernSaved, modernSaveLook: modernSaveLook, modernSaveSpeedLimitsMode: modernSaveSpeedLimitsMode };
    };

    // set up by rssDownloader.html with the parts of its page it uses
    const rssDownloaderPage = ({ feedList, rulesList, rssDownloaderFeedSelectionTable, rssDownloaderRulesTable, loadFeeds, saveSettings, showRule, updateRulesList }) => {
        const setupModern = () => {
            if (!window.qBittorrent.Responsive.isModern())
                return;

            const optionsButton = document.createElement("button");
            optionsButton.type = "button";
            optionsButton.textContent = "QBT_TR(Options...)QBT_TR[CONTEXT=MainWindow]";
            optionsButton.addEventListener("click", (_event) => {
                window.qBittorrent.Modern.openOptionsPage("PrefRSSLink", ["enable_fetching_rss_feeds_checkbox", "enable_auto_downloading_rss_torrents_checkbox"]);
            });
            document.getElementById("rssDownloaderDisabled").append(optionsButton);

            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.id = "rssDownloaderCancel";
            cancel.textContent = "QBT_TR(Cancel)QBT_TR[CONTEXT=MainWindow]";
            cancel.addEventListener("click", (_event) => window.qBittorrent.Client.closeWindow(document.getElementById("rssdownloaderpage")));
            document.getElementById("saveButton").before(cancel);

            const page = document.getElementById("RssDownloader");
            const saveButton = document.getElementById("saveButton");
            const updateDimmed = () => page.classList.toggle("modernNoRule", saveButton.disabled);
            new MutationObserver(updateDimmed).observe(saveButton, { attributes: true, attributeFilter: ["disabled"] });
            updateDimmed();

            setupWizard();
        };

        // the guided new rule, a step at a time on the page's own fields: the rule is made disabled at the first step, so the
        // articles it matches can be shown before it downloads anything
        const WIZARD_STEPS = [
            ["QBT_TR(Name the rule)QBT_TR[CONTEXT=AutomatedRssDownloader]", "QBT_TR(A name to recognize it by in the list of rules.)QBT_TR[CONTEXT=AutomatedRssDownloader]"],
            ["QBT_TR(What to match)QBT_TR[CONTEXT=AutomatedRssDownloader]", "QBT_TR(Articles whose title contains these words are downloaded. Leave the other fields empty unless you need them.)QBT_TR[CONTEXT=AutomatedRssDownloader]"],
            ["QBT_TR(Which feeds)QBT_TR[CONTEXT=AutomatedRssDownloader]", "QBT_TR(Tick the feeds this rule watches.)QBT_TR[CONTEXT=AutomatedRssDownloader]"],
            ["QBT_TR(What to do with matches)QBT_TR[CONTEXT=AutomatedRssDownloader]", "QBT_TR(Optional: the defaults are fine to start with.)QBT_TR[CONTEXT=AutomatedRssDownloader]"]
        ];
        const WIZARD_MATCH_SETTINGS = ["useRegEx", "mustContainText", "mustNotContainText", "episodeFilterText", "useSmartFilter"];
        const WIZARD_OPTION_SETTINGS = ["assignCategoryCombobox", "ruleAddTags", "savetoDifferentDir", "saveToText", "ignoreDaysValue", "addStoppedCombobox", "contentLayoutCombobox"];

        let wizard = null;

        const wizardPage = () => document.getElementById("RssDownloader");

        const reportFailure = async (response) => {
            alert((response === null) ? "QBT_TR(Could not contact qBittorrent.)QBT_TR[CONTEXT=OptionsDialog]" : `QBT_TR(Error:)QBT_TR[CONTEXT=HttpServer] ${await response.text()}`);
        };

        // Next only where the step has what it needs, and not while a request is out
        const updateWizardNext = () => {
            if (wizard === null)
                return;

            const ready = [
                () => (document.getElementById("rssWizardNameInput").value.trim() !== ""),
                () => (document.getElementById("mustContainText").value.trim() !== ""),
                () => [...rssDownloaderFeedSelectionTable.getRowValues()].some((row) => row.full_data.checked) || (document.getElementById("rssWizardFeedUrl").value.trim() !== ""),
                () => true
            ][wizard.step];
            document.getElementById("rssWizardNext").disabled = wizard.busy || !ready();
        };

        const showWizardStep = (step) => {
            wizard.step = step;
            wizardPage().dataset.step = (step + 1).toString();
            document.getElementById("rssWizardProgress").textContent = "QBT_TR(Step %1 of %2)QBT_TR[CONTEXT=AutomatedRssDownloader]".replace("%1", (step + 1)).replace("%2", WIZARD_STEPS.length);
            document.getElementById("rssWizardTitle").textContent = WIZARD_STEPS[step][0];
            document.getElementById("rssWizardHint").textContent = WIZARD_STEPS[step][1];
            document.getElementById("rssWizardNext").textContent = (step === (WIZARD_STEPS.length - 1))
                ? "QBT_TR(Create rule)QBT_TR[CONTEXT=AutomatedRssDownloader]"
                : "QBT_TR(Next)QBT_TR[CONTEXT=AutomatedRssDownloader]";
            if (step === 2)
                renderWizardFeeds();
            updateWizardNext();
            const first = ["rssWizardNameInput", "mustContainText", null, "assignCategoryCombobox"][step];
            ((first !== null) ? document.getElementById(first) : (document.querySelector("#rssWizardFeedsList input") ?? document.getElementById("rssWizardFeedUrl"))).focus();
        };

        const wizardBusy = async (request) => {
            wizard.busy = true;
            updateWizardNext();
            try {
                return await request();
            }
            catch {
                await reportFailure(null);
                return false;
            }
            finally {
                if (wizard !== null) {
                    wizard.busy = false;
                    updateWizardNext();
                }
            }
        };

        const selectRule = (name) => {
            const row = [...rssDownloaderRulesTable.getRowValues()].find((r) => r.full_data.name === name);
            if (row === undefined)
                return false;

            rssDownloaderRulesTable.deselectAll();
            rssDownloaderRulesTable.selectRow(row.rowId);
            return true;
        };

        // the first step: the rule, disabled, under a name no rule has now
        const createWizardRule = async () => {
            const name = document.getElementById("rssWizardNameInput").value.trim();
            await updateRulesList();
            if (Object.hasOwn(rulesList(), name)) {
                alert("QBT_TR(A rule with this name already exists, please choose another name.)QBT_TR[CONTEXT=AutomatedRssDownloader]");
                return false;
            }

            const response = await fetch("api/v2/rss/setRule", {
                method: "POST",
                body: new URLSearchParams({
                    ruleName: name,
                    ruleDef: JSON.stringify({ enabled: false })
                })
            });
            if (!response.ok) {
                await reportFailure(response);
                return false;
            }

            wizard.rule = name;
            await updateRulesList();
            return selectRule(name);
        };

        const renderWizardFeeds = () => {
            const items = [...rssDownloaderFeedSelectionTable.getRowValues()].map((row) => {
                const item = document.createElement("li");
                const box = document.createElement("input");
                box.type = "checkbox";
                box.id = `rssWizardFeed${row.rowId}`;
                box.checked = row.full_data.checked;
                box.addEventListener("change", (_event) => {
                    rssDownloaderFeedSelectionTable.updateRowData({
                        rowId: row.rowId,
                        checked: box.checked
                    });
                    updateWizardNext();
                });
                const label = document.createElement("label");
                label.htmlFor = box.id;
                label.textContent = row.full_data.name;
                label.title = row.full_data.url;
                item.append(box, label);
                return item;
            });
            document.getElementById("rssWizardFeedsList").replaceChildren(...items);
        };

        const addWizardFeed = async () => {
            const input = document.getElementById("rssWizardFeedUrl");
            const url = input.value.trim();
            if (url === "")
                return true;

            const response = await fetch("api/v2/rss/addFeed", {
                method: "POST",
                body: new URLSearchParams({
                    url: url,
                    path: ""
                })
            });
            if (!response.ok) {
                await reportFailure(response);
                return false;
            }

            input.value = "";
            window.qBittorrent.Rss?.updateRssFeedList();
            const ticked = new Set([...rssDownloaderFeedSelectionTable.getRowValues()]
                .filter((row) => row.full_data.checked)
                .map((row) => row.full_data.url));
            ticked.add(url);
            await loadFeeds();
            rssDownloaderFeedSelectionTable.clear();
            let rowID = -1;
            for (const feed of feedList()) {
                rssDownloaderFeedSelectionTable.updateRowData({
                    rowId: ++rowID,
                    checked: ticked.has(feed.url),
                    name: feed.name,
                    url: feed.url
                });
            }
            rssDownloaderFeedSelectionTable.updateTable(false);
            renderWizardFeeds();
            return true;
        };

        const nextWizardStep = async () => {
            if ((wizard === null) || wizard.busy)
                return;

            switch (wizard.step) {
                case 0:
                    if (await wizardBusy(createWizardRule))
                        showWizardStep(1);
                    break;
                case 1:
                    showWizardStep(2);
                    break;
                case 2:
                    // a feed typed but not added yet is added; with a feed ticked, the rule, still disabled, is saved, which shows the
                    // articles it matches
                    if (!await wizardBusy(addWizardFeed) || ![...rssDownloaderFeedSelectionTable.getRowValues()].some((row) => row.full_data.checked))
                        break;
                    if (await wizardBusy(() => saveSettings(false)))
                        showWizardStep(3);
                    break;
                case 3: {
                    const rule = wizard.rule;
                    rulesList()[rule].enabled = true;
                    if (!await wizardBusy(() => saveSettings(false))) {
                        rulesList()[rule].enabled = false;
                        break;
                    }
                    endWizard();
                    await updateRulesList();
                    selectRule(rule);
                    break;
                }
            }
        };

        const endWizard = () => {
            wizard = null;
            // also as the window closes
            const page = wizardPage();
            if (page === null)
                return;

            page.classList.remove("rssWizard");
            delete page.dataset.step;
        };

        // the rule made so far is removed
        const cancelWizard = () => {
            const rule = wizard?.rule ?? null;
            endWizard();
            if (rule === null)
                return;

            fetch("api/v2/rss/removeRule", {
                    method: "POST",
                    body: new URLSearchParams({
                        ruleName: rule
                    })
                })
                .then(() => {
                    // the window may be closed by now
                    if (wizardPage() === null)
                        return;

                    rssDownloaderRulesTable.deselectAll();
                    showRule("");
                    updateRulesList();
                });
        };

        const startWizard = () => {
            if (wizard !== null)
                cancelWizard();
            wizard = { step: 0, rule: null, busy: false };
            rssDownloaderRulesTable.deselectAll();
            showRule("");
            document.getElementById("rssWizardNameInput").value = "";
            document.getElementById("rssWizardFeedUrl").value = "";
            wizardPage().classList.add("rssWizard");
            showWizardStep(0);
            updateRulesList().then(() => {
                const items = Object.keys(rulesList()).map((name) => {
                    const item = document.createElement("li");
                    item.textContent = name;
                    return item;
                });
                document.getElementById("rssWizardRulesList").replaceChildren(...items);
                document.getElementById("rssWizardRules").classList.toggle("invisible", (items.length === 0));
            });
        };

        const setupWizard = () => {
            const parts = document.getElementById("rssWizardTemplate").content.cloneNode(true);
            wizardPage().append(parts.getElementById("rssWizardFooter"));
            document.getElementById("rssDownloaderDisabled").after(parts);
            for (const id of WIZARD_MATCH_SETTINGS)
                document.getElementById(id).closest("tr, .formRow").classList.add("rssWizardMatch");
            for (const id of WIZARD_OPTION_SETTINGS)
                document.getElementById(id).closest("tr, .formRow").classList.add("rssWizardOption");

            document.getElementById("rssWizardNext").addEventListener("click", (_event) => nextWizardStep());
            document.getElementById("rssWizardBack").addEventListener("click", (_event) => showWizardStep(wizard.step - 1));
            document.getElementById("rssWizardCancel").addEventListener("click", (_event) => cancelWizard());
            document.getElementById("rssWizardFeedAdd").addEventListener("click", (_event) => wizardBusy(addWizardFeed));
            for (const id of ["rssWizardNameInput", "mustContainText", "rssWizardFeedUrl"])
                document.getElementById(id).addEventListener("input", (_event) => updateWizardNext());
            document.getElementById("rssWizardNameInput").addEventListener("keydown", (event) => {
                if (event.key !== "Enter")
                    return;

                event.preventDefault();
                nextWizardStep();
            });
            document.getElementById("rssWizardFeedUrl").addEventListener("keydown", (event) => {
                if (event.key !== "Enter")
                    return;

                event.preventDefault();
                wizardBusy(addWizardFeed);
            });
            // Cancel at the row's start, on phones at its end, as in dialogs
            const phone = window.qBittorrent.Responsive.queries.phone;
            const listening = new AbortController();
            const placeCancel = () => {
                const cancel = document.getElementById("rssWizardCancel");
                if (phone.matches)
                    cancel.parentElement.append(cancel);
                else
                    cancel.parentElement.prepend(cancel);
            };
            placeCancel();
            phone.addEventListener("change", (_event) => placeCancel(), { signal: listening.signal });
            // closed in the middle: as Cancel
            MochaUI.Windows.instances["rssdownloaderpage"]?.addEvent("close", () => {
                listening.abort();
                if (wizard !== null)
                    cancelWizard();
            });
        };

        return { setupModern: setupModern, startWizard: startWizard };
    };

    // set up by rss.html with the parts of its page it uses
    const rssPage = ({ openRssDownloader, rssArticleTable, rssFeedTable }) => {
        const setupModern = () => {
            if (!window.qBittorrent.Responsive.isModern())
                return;

            const optionsButton = document.createElement("button");
            optionsButton.type = "button";
            optionsButton.textContent = "QBT_TR(Options...)QBT_TR[CONTEXT=MainWindow]";
            optionsButton.addEventListener("click", (_event) => {
                window.qBittorrent.Modern.openOptionsPage("PrefRSSLink", ["enable_fetching_rss_feeds_checkbox", "enable_auto_downloading_rss_torrents_checkbox"]);
            });
            document.getElementById("rssFetchingDisabled").append(optionsButton);
            window.qBittorrent.Modern.trimEllipsis(document.getElementById("rssView"));

            const guided = document.createElement("button");
            guided.type = "button";
            guided.id = "rssWizardButton";
            const icon = document.createElement("img");
            icon.src = "images/list-add.svg";
            icon.alt = "";
            icon.width = 16;
            icon.height = 16;
            guided.append(icon, "QBT_TR(New rule (guided))QBT_TR[CONTEXT=AutomatedRssDownloader]");
            guided.addEventListener("click", (_event) => openRssDownloader(true));
            document.getElementById("newSubscriptionButton").after(guided);

            const hint = document.createElement("div");
            hint.id = "rssDetailsHint";
            hint.textContent = "QBT_TR(Select an article to see its details.)QBT_TR[CONTEXT=RSSWidget]";
            document.getElementById("rssDetailsView").before(hint);

            setupPhoneSteps();
        };

        // phones: the feeds, a feed's articles or an article, one at a time
        const setupPhoneSteps = () => {
            const view = document.getElementById("rssView");
            const phone = window.qBittorrent.Responsive.queries.phone;
            const bar = document.createElement("div");
            bar.id = "rssPhoneBar";
            const back = document.createElement("button");
            back.type = "button";
            back.id = "rssPhoneBack";
            back.className = "modernSheetBack";
            back.title = "QBT_TR(Back)QBT_TR[CONTEXT=MainWindow]";
            back.setAttribute("aria-label", back.title);
            const title = document.createElement("span");
            title.id = "rssPhoneTitle";
            bar.append(back, title);
            document.getElementById("rssTopBar").prepend(bar);
            view.dataset.phoneStep = "feeds";

            const selectedRow = (table) => table.getTrByRowId(table.getSelectedRowId()) ?? null;
            const show = (step, focus) => {
                view.dataset.phoneStep = step;
                focus?.focus({ preventScroll: true });
            };
            const goOn = (event, table, step) => {
                const tr = event.target.closest("tbody tr");
                if (!phone.matches || (tr === null))
                    return;

                // as a tap does
                if (!table.isRowSelected(tr.rowId)) {
                    table.deselectAll();
                    table.selectRow(tr.rowId);
                }
                if (step === "articles")
                    title.textContent = table.getRow(tr.rowId).full_data.name;
                show(step, back);
            };
            const nextSteps = [
                [rssFeedTable, "articles"],
                [rssArticleTable, "details"]
            ];
            for (const [table, step] of nextSteps) {
                table.dynamicTableDiv.addEventListener("click", (event) => goOn(event, table, step));
                table.dynamicTableDiv.addEventListener("keydown", (event) => {
                    if (event.key !== "Enter")
                        return;

                    // not Back's Enter as well, which has the focus by then
                    event.preventDefault();
                    goOn(event, table, step);
                });
            }
            back.addEventListener("click", (_event) => {
                if (view.dataset.phoneStep === "details")
                    show("articles", selectedRow(rssArticleTable));
                else
                    show("feeds", selectedRow(rssFeedTable));
            });
        };

        // the description's frame gets the page's font, text color and accent, without Modern's stylesheet
        const modernDescriptionStyle = () => {
            const page = getComputedStyle(document.body);
            const accent = getComputedStyle(document.documentElement).getPropertyValue("--modern-accent-text");
            return `<style>:root, :root.dark { --color-background-popup: transparent; } body { color: ${page.color}; font-family: ${page.fontFamily}; font-size: ${page.fontSize}; margin: 0; } a { color: ${accent}; }</style>`;
        };

        return { setupModern: setupModern, modernDescriptionStyle: modernDescriptionStyle };
    };

    // the torrents' upload and download limits; where the torrents' limits differ the field is mixed
    const initTorrentLimits = (hashes, setupSlider) => {
        document.getElementById("altUploadValue").closest("fieldset").classList.add("invisible");
        const applyButton = document.getElementById("applyButton");
        applyButton.disabled = true;
        const directions = [
            { input: document.getElementById("uploadValue"), slider: "uploadSlider", method: "uploadLimit", setMethod: "setUploadLimit" },
            { input: document.getElementById("downloadValue"), slider: "downloadSlider", method: "downloadLimit", setMethod: "setDownloadLimit" }
        ];

        // the limit the torrents share, in bytes/s, else null
        const loadLimit = async ({ method }) => {
            const response = await fetch(`api/v2/torrents/${method}`, {
                method: "POST",
                body: new URLSearchParams({
                    hashes: hashes.join("|")
                })
            });
            if (!response.ok)
                throw new Error(response.statusText);

            const limits = Object.values(await response.json()).map((limit) => Math.max(limit, 0));
            return limits.every((limit) => limit === limits[0]) ? limits[0] : null;
        };
        Promise.all(directions.map(loadLimit))
            .then((limits) => {
                for (const [i, direction] of directions.entries()) {
                    direction.limit = limits[i];
                    setupSlider(direction.slider, direction.input, ((limits[i] ?? 0) / 1024), (limits[i] === null));
                }
                applyButton.disabled = false;
            })
            .catch(console.error);

        applyButton.addEventListener("click", (_event) => {
            const requests = [];
            for (const { input, limit, setMethod } of directions) {
                // still mixed
                if (input.value === "")
                    continue;

                const newLimit = Number(input.value) * 1024 || 0;
                if (newLimit === limit)
                    continue;

                requests.push(fetch(`api/v2/torrents/${setMethod}`, {
                    method: "POST",
                    body: new URLSearchParams({
                        hashes: hashes.join("|"),
                        limit: newLimit
                    })
                }));
            }
            Promise.all(requests)
                .then((responses) => responses.every((response) => response.ok), () => false)
                .then((applied) => {
                    if (!applied)
                        alert("QBT_TR(Failed to set speed limits)QBT_TR[CONTEXT=SpeedLimit]");

                    window.parent.updateMainData();
                    window.parent.qBittorrent.Client.closeWindow(applyButton.closest(".mocha"));
                });
        });
    };

    // set up by searchplugins.html with the parts of its page it uses
    const searchPluginsPage = ({ searchPluginsTable, uninstallPlugin }) => {
        const setupModern = () => {
            if (!window.qBittorrent.Responsive.isModern())
                return;

            const setEnabled = (enable) => {
                fetch("api/v2/search/enablePlugin", {
                    method: "POST",
                    body: new URLSearchParams({
                        names: searchPluginsTable().selectedRowsIds().join("|"),
                        enable: enable
                    })
                });
            };
            // a button is easier to hit than the menu's item: it asks first
            const uninstall = () => {
                if (confirm("QBT_TR(Are you sure you want to uninstall the selected plugins?)QBT_TR[CONTEXT=PluginSelectDlg]"))
                    uninstallPlugin();
            };

            const buttons = [
                ["searchPluginsEnableButton", "QBT_TR(Enable)QBT_TR[CONTEXT=PluginSelectDlg]", () => setEnabled(true)],
                ["searchPluginsDisableButton", "QBT_TR(Disable)QBT_TR[CONTEXT=PluginSelectDlg]", () => setEnabled(false)],
                ["searchPluginsUninstallButton", "QBT_TR(Uninstall)QBT_TR[CONTEXT=PluginSelectDlg]", uninstall]
            ];
            const actions = document.createElement("div");
            actions.id = "searchPluginsActions";
            for (const [id, label, action] of buttons) {
                const button = document.createElement("button");
                button.type = "button";
                button.id = id;
                button.textContent = label;
                button.disabled = true;
                button.addEventListener("click", (_event) => action());
                actions.append(button);
            }
            document.getElementById("searchPluginsTable").before(actions);
            document.querySelector("#searchPluginsContainer > .dialogFooter > button").classList.add("dialogPrimary");
            searchPluginsTable().onSelectedRowChanged = () => updateActions();
        };

        // search.js updates the table while the window is closed as well
        const updateActions = () => {
            if (document.getElementById("searchPluginsActions") === null)
                return;

            const plugins = searchPluginsTable().selectedRowsIds().map((name) => window.qBittorrent.Search.getPlugin(name)).filter(Boolean);
            document.getElementById("searchPluginsEnableButton").disabled = !plugins.some((plugin) => !plugin.enabled);
            document.getElementById("searchPluginsDisableButton").disabled = !plugins.some((plugin) => plugin.enabled);
            document.getElementById("searchPluginsUninstallButton").disabled = (plugins.length === 0);
        };

        return { setupModern: setupModern, updateActions: updateActions };
    };

    // set up by search.js with the function of its page it uses
    const searchPage = ({ manageSearchPlugins }) => {
        const setupModern = () => {
            if (!window.qBittorrent.Responsive.isModern())
                return;

            const label = "QBT_TR(Search plugins...)QBT_TR[CONTEXT=SearchEngineWidget]";
            const pluginsButton = (id) => {
                const button = document.createElement("button");
                button.type = "button";
                button.id = id;
                const icon = document.createElement("img");
                icon.src = "images/plugins.svg";
                // the button is named by its label
                icon.alt = "";
                icon.width = 16;
                icon.height = 16;
                button.append(icon);
                button.addEventListener("click", (_event) => manageSearchPlugins());
                return button;
            };

            // moved in the page, so the tab order follows
            const barButton = pluginsButton("searchPluginsBarButton");
            barButton.title = label;
            barButton.setAttribute("aria-label", label);
            const phone = window.qBittorrent.Responsive.queries.phone;
            const placeButtons = () => {
                document.getElementById(phone.matches ? "searchPattern" : "pluginsSelect").after(document.getElementById("startSearchButton"), barButton);
            };
            placeButtons();
            phone.addEventListener("change", (_event) => placeButtons());

            const notice = document.querySelector("#searchResultsNoPlugins td");
            const hintStart = notice.querySelector("br");
            while (hintStart.nextSibling !== null)
                hintStart.nextSibling.remove();
            const noPluginsButton = pluginsButton("searchNoPluginsButton");
            noPluginsButton.append(label);
            hintStart.replaceWith(noPluginsButton);
            window.qBittorrent.Modern.trimEllipsis(notice);
        };

        return { setupModern: setupModern };
    };

    // phones: the first four pages and More as tiles, the others in a second row while More is open
    const setUpOptionsTabs = () => {
        if (!responsive.isModern())
            return;

        const tabs = document.getElementById("preferencesTabs");
        const pages = [...tabs.children];
        const more = document.createElement("button");
        more.type = "button";
        const glyph = document.createElement("span");
        glyph.className = "modernGlyph";
        glyph.dataset.glyph = "chevron";
        glyph.setAttribute("aria-hidden", "true");
        more.append(glyph, "QBT_TR(More)QBT_TR[CONTEXT=OptionsDialog]");
        const tile = document.createElement("li");
        tile.className = "modernPrefsMore";
        tile.append(more);
        pages[3].after(tile);

        const expand = (expanded) => {
            tabs.classList.toggle("modernExpanded", expanded);
            more.setAttribute("aria-expanded", expanded.toString());
        };
        more.addEventListener("click", (_event) => expand(!tabs.classList.contains("modernExpanded")));
        for (const page of pages.slice(4))
            page.addEventListener("click", (_event) => expand(true));
        expand(false);

        // the heights More opens and closes, measured again as a tile's size changes
        const measure = () => {
            const top = tabs.getBoundingClientRect().top;
            const below = Number.parseFloat(getComputedStyle(tabs).paddingBottom);
            const bottom = (tiles) => Math.max(...tiles.map((tile) => tile.getBoundingClientRect().bottom));
            const tiles = [...tabs.children];
            tabs.style.setProperty("--modern-prefs-strip", `${bottom(tiles.slice(0, 5)) - top + below}px`);
            tabs.style.setProperty("--modern-prefs-strip-expanded", `${bottom(tiles) - top + below}px`);
        };
        const sizes = new ResizeObserver((_entries) => measure());
        for (const tile of tabs.children)
            sizes.observe(tile);
        window.MUI.Windows.instances["preferencesPage"].addEvent("close", () => sizes.disconnect());
        // measured now, not by the observer: the list shrinking would change the toolbar's size, which responsive.js observes
        // too, and the browser would report a loop
        measure();
    };

    return exports();
})();
Object.freeze(window.qBittorrent.Modern);
