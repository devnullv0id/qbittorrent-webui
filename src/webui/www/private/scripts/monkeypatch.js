/*
 * Bittorrent Client using Qt and libtorrent.
 * Copyright (C) 2025  bolshoytoster <toasterbig@gmail.com>
 * Copyright (C) 2025  Mike Tzou (Chocobo1)
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
window.qBittorrent.MonkeyPatch ??= (() => {
    const exports = () => {
        return {
            patch: patch
        };
    };

    const patch = () => {
        patchMootoolsDocumentId();
        patchMochaGetAsset();
        patchMochaWindowOptions();
        patchMochaFocusWindow();
    };

    const patchMootoolsDocumentId = () => {
        // Override MooTools' `document.id` (used for `$(id)`), which prevents it
        // from allocating a `uniqueNumber` for elements that don't need it.
        // MooTools and MochaUI use it internally.

        if (document.id === undefined)
            return;

        document.id = (el) => {
            if ((el === null) || (el === undefined))
                return null;

            switch (typeof el) {
                case "object":
                    return el;
                case "string":
                    return document.getElementById(el);
            }

            return null;
        };
    };

    /**
     * Modified to support specifying an asset with a version query param (`?v=`) for cache busting
     */
    const patchMochaGetAsset = () => {
        MUI.Require.prototype.getAsset = (source, onload) => {
            // If the asset is loaded, fire the onload function.
            if (MUI.files[source] === "loaded") {
                if (typeof onload === "function")
                    onload();
                return true;
            }

            // If the asset is loading, wait until it is loaded and then fire the onload function.
            // If asset doesn't load by a number of tries, fire onload anyway.
            else if (MUI.files[source] === "loading") {
                let tries = 0;
                const checker = (function() {
                    ++tries;
                    if ((MUI.files[source] === "loading") && (tries < "100"))
                        return;
                    $clear(checker);
                    if (typeof onload === "function")
                        onload();
                }).periodical(50);
            }

            // If the asset is not yet loaded or loading, start loading the asset.
            else {
                MUI.files[source] = "loading";

                const properties = {
                    onload: onload
                };

                // Add to the onload function
                const oldonload = properties.onload;
                properties.onload = () => {
                    MUI.files[source] = "loaded";
                    if (oldonload)
                        oldonload();
                };

                switch (source.match(/(\.\w+)(?:\?v=\w+)?$/)[1]) {
                    case ".js": {
                        const script = Asset.javascript(source, properties);
                        // a script that fails to load would keep whatever requires it from ever loading:
                        // go on without it, and load it again when it's required again
                        script.addEventListener("error", (event) => {
                            delete MUI.files[source];
                            if (typeof oldonload === "function")
                                oldonload();
                        });
                        return script;
                    }
                    case ".css":
                        return Asset.css(source, properties);
                    case ".jpg":
                    case ".png":
                    case ".gif":
                        return Asset.image(source, properties);
                }

                alert(`The required file "${source}" could not be loaded`);
            }
        };
    };

    /**
     * Disable canvas in MochaUI windows
     */
    const patchMochaWindowOptions = () => {
        const options = MUI.Window.prototype.options;
        options.shadowBlur = 0;
        options.shadowOffset = { x: 0, y: 0 };
        options.useCanvas = false;
        options.useCanvasControls = false;
    };

    /**
     * Keep windows below menus: MochaUI raises the z-index by 2 for every focused window and never lowers it,
     * so once it passes 1400, number the windows anew from 100 in their stacking order;
     * modals and notifications keep their z-index of 11000 and 11001
     */
    const patchMochaFocusWindow = () => {
        const focusWindow = MUI.focusWindow;
        MUI.focusWindow = (windowEl, fireEvent) => {
            focusWindow.call(MUI, windowEl, fireEvent);
            if (MUI.Windows.indexLevel <= 1400)
                return;

            const windows = Object.values(MUI.Windows.instances)
                .filter((instance) => (instance.options.type === "window"))
                .map((instance) => instance.windowEl)
                .sort((a, b) => (Number(a.style.zIndex) - Number(b.style.zIndex)));
            MUI.Windows.indexLevel = 100;
            for (const element of windows) {
                MUI.Windows.indexLevel += 2;
                element.style.zIndex = `${MUI.Windows.indexLevel}`;
            }
            document.getElementById("windowUnderlay").style.zIndex = `${MUI.Windows.indexLevel - 1}`;
        };
    };

    return exports();
})();
Object.freeze(window.qBittorrent.MonkeyPatch);

// execute now
window.qBittorrent.MonkeyPatch.patch();
