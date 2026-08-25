// ==UserScript==
// @name Songsterr Plus Patcher
// @namespace https://github.com/Strikeless
// @version 1.3.0
// @description Trick Songsterr to unlock plus features.
// @license MIT
// @supportURL https://github.com/Strikeless/SongsterrPlusPatcher
// @match http*://*.songsterr.com/*
// @run-at document-start
// @grant unsafeWindow
// ==/UserScript==

/*
Copyright 2026, https://github.com/Strikeless

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

(function () {
    'use strict';

    // unsafeWindow refers to "the original window object of the webpage that allows reading or modifying global variables",
    // which we must use if we want to modify things when running in a userscript manager with sandboxing (probably all the major ones?).
    // https://violentmonkey.github.io/api/gm/#unsafewindow
    const win = unsafeWindow || window;

    function patchStateData(state) {
        /*
         * Fake demo mode for plus features.
         * This has become easier than faking a plus profile, which would now require nulling a signature check (with asymmetric keys) and a bunch of request spoofing.
         */
        state.demo = {
            active: true,
            enabled: true
        };
        /*
        state.query = {
            demo: "enabled"
        }
        state.queryContent = {
            demo: "enabled"
        }
        */

        return state;
    }

    let appMutationObserverApplied = false;
    /// Whenever the tab viewer is switched by the site, it gets reset to the non-demo version.
    /// This function starts an observer that will try to detect that and reload the site to get demo mode again.
    // TODO: This is stupid, the reloads are annoying. Would be great if we figured out how to get the demo mode to stay without a full page reload.
    function applyAppMutationObserver() {
        if (appMutationObserverApplied) return;
        appMutationObserverApplied = true;

        const appElement = document.getElementById("app");
        if (appElement == null) {
            console.log("SongsterrPlusPatcher: Didn't find app element, manual reloads will be necessary.");
            return;
        }

        const appElementObserverCallback = (mutationList, observer) => {
            for (const mutation of mutationList) {
                if (mutation.type != "childList") continue;

                let lockIconElements = document.getElementsByClassName("_8e144G_lock");
                if (lockIconElements.length == 0) continue;

                console.log("SongsterrPlusPatcher: Lost demo mode, reloading.");
                window.location.reload();
            }
        };
        new MutationObserver(appElementObserverCallback).observe(appElement, { childList: true });
    }

    function appClientEarlyHook() {
        console.log("SongsterrPlusPatcher: Running appClient early hook");

        const stateJsonElement = document.getElementById("state");
        const stateData = JSON.parse(stateJsonElement.innerHTML);
        const stateDataPatched = patchStateData(stateData);
        stateJsonElement.innerHTML = JSON.stringify(stateDataPatched);

        // The apptab has already been populated with buttons for free users, so remove this "stale" version.
        // The site should create the apptab again, now with patched state.
        document.getElementById("apptab").remove();

        // Initial patching done, but we still have some UI fixing to do once the new apptab is ready.
        // Observe for the added apptab, and run the late hook once the new apptab has been added.
        const apptabAddedObserverCallback = (mutationList, observer) => {
            for (const mutation of mutationList) {
                if (mutation.type != "childList") continue;

                for (const addedChildNode of mutation.addedNodes) {
                    if (addedChildNode.id != "apptab") continue;
                    observer.disconnect();
                    apptabLateHook();
                }
            }
        };
        const apptabParentElement = document.getElementById("app");
        new MutationObserver(apptabAddedObserverCallback).observe(apptabParentElement, { childList: true });

        applyAppMutationObserver();
    }

    function apptabLateHook() {
        console.log("SongsterrPlusPatcher: Running apptab late hook");

        // Since the site thinks we're in demo mode, some links have ?demo=enabled appended to them.
        // We don't need that nor do we really want to confuse the server with demo mode when it disagrees.
        const demoLinkElements = document.querySelectorAll("a[href*='?demo=']");
        for (const demoLinkElement of demoLinkElements) {
            demoLinkElement.outerHTML = demoLinkElement.outerHTML
                .replaceAll("?demo=enabled", "")
                .replaceAll("?demo=disabled", "");
        }

        const demoSongMarkerElement = document.querySelector("a[class*='_demo']");
        if (demoSongMarkerElement != null) demoSongMarkerElement.remove();

        const topBarPlusButtonElement = document.querySelector("div:has(> #menu-plus)");
        if (topBarPlusButtonElement != null) topBarPlusButtonElement.remove();

        const headerRegenerateElement = document.getElementById("header-regenerate");
        if (headerRegenerateElement != null) headerRegenerateElement.remove();
    }

    // The site's appClient script reads __APP_INITIALIZED very early on (before it has read state or anything like that).
    // Hook a getter in front of that variable, where we will run our early patching code, before appClient gets a chance to do anything meaningful.
    let appInitializedValue = false;
    Object.defineProperty(
        win,
        "__APP_INITIALISED",
        {
            get() {
                appClientEarlyHook();
                return appInitializedValue;
            },
            set(value) {
                appInitializedValue = value;
            }
        }
    );
})();
