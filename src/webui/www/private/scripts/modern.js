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

    // every window: no empty strip below its page; then the windows whose pages aren't framed
    const setUpWindow = (instance) => {
        if (instance.iframeEl !== undefined)
            return;

        const footer = instance.contentEl.querySelector(".dialogFooter");
        if ((footer !== null) && !footers.has(footer))
            setUpFooter(footer, null);
        trimEllipsis(instance.contentEl);
        labelFooterButtons(footer);
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

    const init = () => {
        if (!responsive.isModern())
            return;

        initPopups();
        initMenubar();
        initPropertiesTabs();
        initDialogs();
    };

    return exports();
})();
Object.freeze(window.qBittorrent.Modern);
