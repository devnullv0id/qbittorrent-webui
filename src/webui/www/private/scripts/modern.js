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
            trimEllipsis: trimEllipsis,
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
            if ((event.key === "Escape") && (event.target.closest?.("select")?.matches(":open") === true))
                event.stopPropagation();
        }, true);
    };

    const initPopups = () => {
        keepEscapeInLists(window);
        document.addEventListener("pointerdown", (event) => {
            for (const popup of popups.toReversed()) {
                if (popup.element.contains(event.target) || ((popup.keepOpenFor !== null) && ((event.target.closest?.(popup.keepOpenFor) ?? null) !== null)))
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
            if ((event.key !== "Escape") || (popups.length === 0) || ((event.target.closest?.(".mocha") ?? null) !== null))
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
            if (event.target.closest("li li") !== null)
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
            if ((event.key === "Enter") && (event.target.matches?.(ENTER_TARGETS) === true))
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
            "QBT_TR(Are you sure you want to remove the category %1?)QBT_TR[CONTEXT=CategoryFilterWidget]".replace("%1", () => `"${category}"`),
            () => removeCategory(category));
        const removeUnusedCategories = deleteUnusedCategoriesFN;
        deleteUnusedCategoriesFN = () => askToRemove("QBT_TR(Remove unused categories)QBT_TR[CONTEXT=CategoryFilterWidget]",
            "QBT_TR(Are you sure you want to remove all unused categories?)QBT_TR[CONTEXT=CategoryFilterWidget]",
            () => removeUnusedCategories());
        const removeTag = removeTagFN;
        removeTagFN = (tag) => askToRemove("QBT_TR(Remove tag)QBT_TR[CONTEXT=TagFilterWidget]",
            "QBT_TR(Are you sure you want to remove the tag %1?)QBT_TR[CONTEXT=TagFilterWidget]".replace("%1", () => `"${tag}"`),
            () => removeTag(tag));
        const removeUnusedTags = deleteUnusedTagsFN;
        deleteUnusedTagsFN = () => askToRemove("QBT_TR(Remove unused tags)QBT_TR[CONTEXT=TagFilterWidget]",
            "QBT_TR(Are you sure you want to remove all unused tags?)QBT_TR[CONTEXT=TagFilterWidget]",
            () => removeUnusedTags());
    };

    // every window: no empty strip below its page; then the windows whose pages aren't framed
    const setUpWindow = (instance) => {
        if (instance.iframeEl !== undefined)
            return;

        const footer = instance.contentEl.querySelector(".dialogFooter");
        if ((footer !== null) && !footers.has(footer))
            setUpFooter(footer, null);
        trimEllipsis(instance.contentEl);
        labelFooterButtons(footer);
        if (instance.windowEl.id === "confirmDeletionPage")
            setUpRemoveDialog(instance);
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

        // not creation options: MochaUI has none for its drags
        for (const drag of [instance.windowDrag, instance.resizable1, instance.resizable2, instance.resizable3, instance.resizable4, instance.resizable5]) {
            drag?.addEvent("start", () => setMoved(instance, true));
            drag?.addEvent("complete", () => savePlace(instance));
        }

        if (instance.controlsEl === undefined)
            return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "modernCenterButton";
        button.title = "QBT_TR(Center window)QBT_TR[CONTEXT=MainWindow]";
        button.setAttribute("aria-label", button.title);
        button.addEventListener("click", (_event) => centerWindow(instance));
        instance.controlsEl.append(button);
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

    const init = () => {
        if (!responsive.isModern())
            return;

        initPopups();
        initMenubar();
        initPropertiesTabs();
        initDialogs();
        initRemovalQuestions();
        responsive.addWindowHook(placeWindow);
        initPhoneHeader();
    };

    return exports();
})();
Object.freeze(window.qBittorrent.Modern);
