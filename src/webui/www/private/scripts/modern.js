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
            cell.addEventListener("click", (_event) => globalLimitFN());
            return { cell: cell, rate: rate, limit: limit };
        };
        const download = createSpeedCell("images/downloading.svg", "QBT_TR(Download speed icon)QBT_TR[CONTEXT=MainWindow]");
        const upload = createSpeedCell("images/upload.svg", "QBT_TR(Upload speed icon)QBT_TR[CONTEXT=MainWindow]");

        bar.append(badge, details, altSpeed, download.cell, upload.cell);
        footer.append(bar);

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
        initPropertiesSheet();
        initPropertyCards();
        initPropertiesPanelHeight();
        initSortSheet();
        initSelectionCheckboxes();
        initStatusBar();
    };

    return exports();
})();
Object.freeze(window.qBittorrent.Modern);
