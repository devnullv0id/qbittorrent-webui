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

// Modern, the display mode Options offers besides Classic: what its stylesheet can't do. responsive.js holds the
// screen's conditions and fits the windows; client.js calls init() once the main window is built
window.qBittorrent ??= {};
window.qBittorrent.Modern ??= (() => {
    const exports = () => {
        return {
            init: init,
        };
    };

    const responsive = window.qBittorrent.Responsive;
    const root = document.documentElement;

    /* Popups */

    // Modern's open popups, the latest last: Escape closes the latest, a press outside one closes it. A press on what
    // keepOpenFor matches leaves it open; a popup over the list swallows the press that closes it, so it doesn't also
    // select a torrent
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

    const initPopups = () => {
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
        // capturing, so a drawer below the popup keeps its own Escape; a window above it keeps its own
        document.addEventListener("keydown", (event) => {
            if ((event.key !== "Escape") || (popups.length === 0) || event.target.closest?.(".mocha"))
                return;

            event.stopPropagation();
            popups.at(-1).close();
        }, true);
    };

    /* Menubar */

    // a menu opens on a click, and with one open, the mouse over another opens that one; in the phones' menu drawer the
    // menus open below their names instead (responsive.js)
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

    /* Properties tabs */

    // their strip scrolls sideways where they don't fit (modern.css); the selected tab stays in view, also when the
    // Content tab's filter, shown with that tab, narrows the strip
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
        // the window's width, the filter shown or hidden, the panel opened: the strip's width changes
        new ResizeObserver(keepSelectedInView).observe(strip);
        // a tab chosen: client.js selects it on this click
        strip.addEventListener("click", (_event) => requestAnimationFrame(keepSelectedInView));
    };

    /* Dialogs */

    // a label that opens a window ends in "...", which beside Modern's fields reads as cut off: buttons drop it, as each
    // page loads
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

    // the button rows Modern has set up, while their pages are shown
    const footers = new Set();

    // a dialog's Cancel comes before its main action, at the row's start; on phones, where the buttons stack, after it.
    // Moved in the page, so the keyboard goes through them in the order they are shown
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
        doc.defaultView.addEventListener("keydown", (event) => {
            if ((event.key === "Enter") && event.target.matches?.(ENTER_TARGETS))
                event.stopImmediatePropagation();
        }, true);
        trimEllipsis(doc.body);
    };

    // windows whose pages are loaded into them, not framed
    const setUpWindow = (instance) => {
        if (instance.iframeEl)
            return;

        const footer = instance.contentEl.querySelector(".dialogFooter");
        if ((footer !== null) && !footers.has(footer))
            setUpFooter(footer, null);
        trimEllipsis(instance.contentEl);
    };

    const initDialogs = () => {
        responsive.addFrameHook(setUpFrame);
        responsive.addWindowHook(setUpWindow);
        responsive.queries.phone.addEventListener("change", (_event) => {
            for (const footer of footers) {
                if (footer.isConnected && (footer.ownerDocument.defaultView !== null))
                    placeCancel(footer);
                else
                    footers.delete(footer);
            }
        });
    };

    /* Window places */

    // a window the user moved or resized opens where it was left (Add Torrent's windows, named by their source, share
    // one place); a button beside Close centers it again
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

    /* Phone header */

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
            const link = document.createElement("a");
            link.href = `#${target}`;
            const img = document.createElement("img");
            img.src = icon;
            img.alt = "";
            link.append(img, label);
            item.append(link);
            list.append(item);
            actions[target] = (_element, _menu) => document.getElementById(target).click();
        }
        list.querySelector("a[href='#torrentCreatorButton']").parentElement.classList.add("separator");
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

    /* Torrent cards and the properties sheet */

    // on phones a tap on a card opens its torrent's properties as a sheet over the list, half the screen's height; its
    // header dragged up, or its page scrolled, makes it fill the screen, dragged down or Back closes it
    const SHEET_STEP_TIME = 450;

    const initPropertiesSheet = async () => {
        const wrapper = await responsive.whenElement("propertiesPanel_wrapper");
        const header = await responsive.whenElement("propertiesPanel_header");
        const tableDiv = await responsive.whenElement("torrentsTableDiv");
        const collapseToggle = () => document.getElementById("propertiesPanel_collapseToggle");

        // Back and the torrent's name, above the tabs
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

    // peers and trackers are cards on phones too: each cell is tagged with its column, read from the list's header
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

    const init = () => {
        if (!responsive.isModern())
            return;

        initPopups();
        initMenubar();
        initPropertiesTabs();
        initDialogs();
        responsive.addWindowHook(placeWindow);
        initPhoneHeader();
        initPropertiesSheet();
        initPropertyCards();
        initPropertiesPanelHeight();
    };

    return exports();
})();
Object.freeze(window.qBittorrent.Modern);
