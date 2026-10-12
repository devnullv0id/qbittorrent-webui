/*
 * Bittorrent Client using Qt and libtorrent.
 * Copyright (C) 2024  sledgehammer999 <hammered999@gmail.com>
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
window.qBittorrent.ColorScheme ??= (() => {
    const exports = () => {
        return {
            update,
            applyClientData,
        };
    };

    const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const clientData = window.parent.qBittorrent.ClientData;
    const isMainWindow = window.parent === window;

    const LOOK_SETTINGS = ["color_scheme", "display_density", "display_mode"];
    const localPreferences = isMainWindow ? new window.qBittorrent.LocalPreferences.LocalPreferences() : null;
    const readStoredLook = () => {
        try {
            const look = JSON.parse(localPreferences.get("display_look", "null"));
            return (look?.display_mode === "modern") ? look : null;
        }
        catch (error) {
            return null;
        }
    };
    // null once the client data has arrived
    let storedLook = isMainWindow ? readStoredLook() : null;
    const setting = (key) => ((storedLook !== null) ? storedLook[key] : clientData.get(key));

    const update = () => {
        const root = document.documentElement;
        const colorScheme = setting("color_scheme");
        const validScheme = (colorScheme === "light") || (colorScheme === "dark");
        const isDark = colorSchemeQuery.matches;
        root.classList.toggle("dark", ((!validScheme && isDark) || (colorScheme === "dark")));
    };

    const storeLook = () => {
        if (clientData.get("display_mode") === "modern")
            localPreferences.set("display_look", JSON.stringify(Object.fromEntries(LOOK_SETTINGS.map((key) => [key, clientData.get(key) ?? null]))));
        else if (localPreferences.get("display_look") !== null)
            localPreferences.remove("display_look");
    };

    // called by client.js with the client data, and by Options as it saves them; the display mode changes only on reload
    let displayModeSet = false;
    const applyClientData = () => {
        storedLook = null;
        update();
        if (!displayModeSet) {
            displayModeSet = true;
            window.qBittorrent.Responsive.setDisplayMode(clientData.get("display_mode") === "modern");
        }
        storeLook();
    };

    colorSchemeQuery.addEventListener("change", (_event) => update());
    // Apply immediately: framed windows already have parent's ClientData loaded;
    // main window falls back to system preference (in Modern, to the stored look) until client.js calls applyClientData()
    // after fetch
    update();
    if (storedLook !== null) {
        window.qBittorrent.Responsive.setDisplayMode(true);
        document.documentElement.classList.toggle("compact", (storedLook.display_density === "compact"));
    }

    // dialog frames take the responsive layout from the main window
    if (window.parent !== window)
        window.parent.qBittorrent.Responsive?.addFrame(document);

    return exports();
})();
Object.freeze(window.qBittorrent.ColorScheme);
