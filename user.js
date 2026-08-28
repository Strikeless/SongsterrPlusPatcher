// ==UserScript==
// @name Songsterr Plus Patcher
// @namespace https://github.com/Strikeless
// @version 1.4.0
// @description Trick Songsterr to unlock plus features.
// @license MIT
// @supportURL https://github.com/Strikeless/SongsterrPlusPatcher
// @match http*://*.songsterr.com/*
// @run-at document-start
// @grant unsafeWindow
// @grant GM.xmlHttpRequest
// ==/UserScript==

/*
Copyright 2026, https://github.com/Strikeless

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

(function () {
    'use strict';

    /// Common object accessible to both internal and injected functions.
    const common = {
        cfg: {
            enablePlusPatches: true,
            enableLateFixes: true,
            debugSourcePatcher: false,
            debugSiteEvents: null,
            cancelSiteEventCuriosity: false,
            cancelSiteOtherCuriosity: true,
            cancelSitePromo: true,
            cancelSiteExperiments: true
        },
        log: function (...args) {
            console.log("[SongsterrPlusPatcher] " + args.join(" "));
        },
        warn: function (...args) {
            console.warn("[SongsterrPlusPatcher] " + args.join(" "));
        },
        broken: function (msg) {
            this.log("Broken: " + msg);
            window.alert("SongsterrPlusPatcher has detected it is broken due to site changes. Please disable the userscript until an update has been published to avoid problems, after which you may reload the page.");
            window.location.reload();
        }
    };

    if (typeof GM.xmlHttpRequest == "undefined") {
        window.alert("SongsterrPlusPatcher is definitely incompatible with your userscript manager. Please make sure you are on a recent version, or switch to Violentmonkey.");
        return;
    }

    // unsafeWindow refers to "the original window object of the webpage that allows reading or modifying global variables",
    // which we must use if we want to modify things when running in a userscript manager with sandboxing (probably all the major ones?).
    // https://violentmonkey.github.io/api/gm/#unsafewindow
    const win = unsafeWindow || window;

    // Expose the common object globally so that it can be referred to as a parameter in hook function injects.
    const commonObjectGlobalIdentifier = "_" + crypto.randomUUID().replaceAll("-", "");
    Object.defineProperty(
        win,
        commonObjectGlobalIdentifier,
        {
            value: common,
            writable: false,
            configurable: false,
            enumerable: false
        }
    );

    const appClientEntryHook = async function (common) {
        // NOTE: This function gets injected to appClient source with .toString(), so we don't have the script's lexical scope in here.

        common.log("Hello from patched appClient entry hook!");

        function patchStateData(state) {
            /*
            * Fake demo mode for plus features.
            * This has become easier than faking a plus profile, which would now require nulling a signature check (with asymmetric keys) and a bunch of request spoofing.
            */
            state.demo = {
                active: true,
                enabled: true
            };
            state.query = {
                demo: "enabled"
            }
            state.queryContent = {
                demo: "enabled"
            }
            // This is a stupid hack to get plus controls in the UI. For some reason demo mode isn't enough here, so we must still be missing something on that front.
            // This is 99% the first thing that will get this script patched because it's blatantly incorrect, but it'll do for now.
            state.bonus.activatingPlus = true;

            return state;
        }
        function applyStateDataPatch() {
            const stateJsonElement = document.getElementById("state");
            const stateData = JSON.parse(stateJsonElement.innerHTML);
            const stateDataPatched = patchStateData(stateData);
            stateJsonElement.innerHTML = JSON.stringify(stateDataPatched);
        }

        if (common.cfg.enablePlusPatches) {
            applyStateDataPatch();

            // The app element has already been populated with buttons for free users, so remove this "stale" version.
            // The site should create it again, now with (hopefully) fixed state.
            document.getElementById("app")?.remove();
        }
    };

    const appClientContextHook = async function (common, ctx, store) {
        // NOTE: This function gets injected to appClient source with .toString(), so we don't have the script's lexical scope in here.

        common.log("Hello from patched appClient context hook!");

        function lateUiHook() {
            common.log("Running late UI hook");

            if (common.cfg.enableLateFixes) {
                // Remove ?demo=enabled from the URL (without reloading or ruining history though!), since the site may add that (given we are in demo mode).
                const url = new URL(window.location.href);
                if (url.searchParams.has("demo")) {
                    url.searchParams.delete("demo");
                    window.history.replaceState({}, "", url);
                }

                // Since the site thinks we're in demo mode, some links have ?demo=enabled appended to them (e.g. the mixer parts).
                // We don't need that nor do we really want to confuse the server with demo mode when it disagrees.
                const demoLinkElements = document.querySelectorAll("a[href*='?demo=']");
                for (const demoLinkElement of demoLinkElements) {
                    demoLinkElement.outerHTML = demoLinkElement.outerHTML
                        .replaceAll("?demo=enabled", "")
                        .replaceAll("?demo=disabled", "");
                }

                const demoSongMarkerElement = document.querySelector("a[class*='_demo']");
                demoSongMarkerElement?.remove();

                /*
                const topBarPlusButtonElement = document.querySelector("div:has(> #menu-plus)");
                if (topBarPlusButtonElement != null) topBarPlusButtonElement.remove();
                */

                const headerRegenerateElement = document.getElementById("header-regenerate");
                // headerRegenerateElement?.remove();

                const headerPrintElement = document.getElementById("header-print");
                // headerPrintElement?.remove();
            }
        }

        const genuineStoreDispatchFunc = store.dispatch;
        function storeDispatchHook(eventIdentifier, ...eventDataArgs) {
            if (common.cfg.debugSiteEvents != null && common.cfg.debugSiteEvents.test(eventIdentifier)) {
                const stringifiedEventDataArgsObjectRefs = new WeakSet();
                const stringifiedEventDataArgs = JSON.stringify(
                    eventDataArgs,
                    (_key, value) => {
                        if (typeof value != "object" || value == null) return value;

                        // Avoid stringifying repeats as a cheap way to prevent cyclic object values that would cause errors.
                        if (stringifiedEventDataArgsObjectRefs.has(value)) return "<...>";
                        stringifiedEventDataArgsObjectRefs.add(value);

                        return value;
                    }
                );

                common.log(`[DISPATCH DEBUG] "${eventIdentifier}": ${stringifiedEventDataArgs}`);
            }

            switch (eventIdentifier) {
                case "experiments/activate": {
                    const experimentName = eventDataArgs[0]?.experimentName;

                    if (experimentName == "plus_freeriders") {
                        common.broken("Experiment plus_freeriders was activated");
                    } else if (common.cfg.cancelSiteExperiments) {
                        common.log(`Rejecting experiment "${experimentName}" to deter script breakage. Please subscribe to Songsterr Plus if you want to experience their experimental features.`);
                    } else {
                        common.log(`Experiment "${experimentName}" was activated`);
                    }

                    return;
                }
                case "demo/deactivate": {
                    common.broken("demo/deactivate event was dispatched");
                    return;
                }
                case "@changed": {
                    const changedState = eventDataArgs[0];

                    if (changedState.screen != null || changedState.player != null || changedState.layer != null) {
                        // Incredibly fucking stupid hook for UI patches. This is here with that delay because I couldn't find the right place to hook this to.
                        // Let's just hope that all the DOM we want to mess with has loaded by 50ms from now on... TODO: Fix this shit
                        setTimeout(lateUiHook, 50);
                    }

                    break;
                }
                default: {
                    // I wish javascript had modern switch/match statements with pattern matching...
                    if (eventIdentifier.startsWith("curiosity")) {
                        if (common.cfg.cancelSiteEventCuriosity && eventIdentifier == "curiosity/event") return;
                        if (common.cfg.cancelSiteOtherCuriosity) return;
                    } else if (eventIdentifier.startsWith("promo")) {
                        if (common.cfg.cancelSitePromo) return;
                    }

                    break;
                }
            }

            return genuineStoreDispatchFunc(eventIdentifier, ...eventDataArgs);
        }
        Object.defineProperty(
            store,
            "dispatch",
            { value: storeDispatchHook }
        );
    };

    function fixRelocatedScriptRelatives(src, scriptOriginalSourceUrl) {
        // Since a patched script isn't being loaded from it's original URL, we must resolve any relative javascript imports manually to the right URL.
        src = src.replaceAll(
            // I know I know, I should be burned alive for using regex to parse this. Don't really care all that much to be honest.
            /["'`](\.+\/[^"'`]+.js)["'`]/g,
            (match, capturedPath, ..._args) => {
                const canonicalPath = new URL(capturedPath, scriptOriginalSourceUrl).href;
                if (common.cfg.debugSourcePatcher) common.log(`Canonicalized relative script URL in patched script: ${capturedPath} -> ${canonicalPath}`);
                return `"${canonicalPath}"`;
            }
        );

        return src;
    }

    /*
    UNUSED FOR NOW, but better keep this around in case we need to do more source patching outside of appClient.
    async function getScriptSourceWithPatchedImport(src, originalSourceUrl, importUrl, importedSourcePatcher) {
        // The import URL is most likely relative to the URL of the script that is importing it.
        // Canonicalize it to the original URL of the importing script (which should already be absolute!).
        const importedUrlCanonical = new URL(importedUrl, originalSourceUrl).href;

        common.log(`fetching script for patching from: ${importedUrlCanonical} (in source: ${importedUrl})`);
        const scriptSourceResponse = await GM.xmlHttpRequest({ url: importedUrlCanonical, anonymous: true });
        if ((scriptSourceResponse.status < 200 || scriptSourceResponse.status > 299) && (scriptSourceResponse.status < 500 || scriptSourceResponse.status > 599)) {
            common.broken(`imported script fetch responded with status ${scriptSourceResponse.status}: ${importedUrlCanonical}`);
        }

        const scriptSource = scriptSourceResponse.responseText;
        const scriptSourceFixed = fixRelocatedScriptRelatives(scriptSource, importedUrlCanonical);
        const scriptSourcePatched = await importedSourcePatcher(scriptSource, importedUrlCanonical);

        // We now a patched version of the imported script. We still need to modify this script to import the patched version instead of the original.
        const scriptSourcePatchedBlobUrl = URL.createObjectURL(new Blob([scriptSourcePatched], { type: "text/javascript" }));
        src = src.replaceAll(importedUrl, scriptSourcePatchedBlobUrl);
        return src;
    }
    */

    async function patchAppClientScriptSource(src, originalSourceUrl) {
        /***** Plus patches *****/
        if (common.cfg.enablePlusPatches) {
            // This is so stupid. We are patching hardcoded demo song id checks with this.
            src = src
                .replaceAll("===27", "===27 || true")
                .replaceAll("!==27", "!==27 && false")
                .replace(/\w+\(window\.location\.pathname\)/g, '27');
        }

        /***** Hook injections for running code in the context of this script *****/
        // Inject our entry hook as the very first thing in the script.
        src = `
            await ( ${appClientEntryHook.toString()} )(window.${commonObjectGlobalIdentifier});
            ${src}
        `;

        /*
         * Inject our context hook after the context object is created in the initializer function.
         * On second thought, maybe they actually should burn me alive for writing these regexes. Jesus fucking christ.
         * The proper way to do this would be to parse the script to an AST, make our modifications using that, and then reconstruct the script from the AST. Don't use these regexes as an example, please.
         * Regex isn't thaaat bad, right?
         */
        const match = src.match(
            /(\w+)=(\w+)\.get\(\w+\.Store\)[^;]*;/
        );

        if (!match) {
            common.broken("Didn't find context/store variables");
            return src;
        }

        const [, storeVar, ctxVar] = match;

        const hook = `await (${appClientContextHook})(
            window.${commonObjectGlobalIdentifier},${ctxVar},${storeVar});`;

        src = src.replace(match[0], `${match[0]}${hook}`);

        /***** Patching of imported scripts *****/
        //src = await getScriptSourceWithPatchedImport(src, originalSourceUrl, commonScriptSourceUrl, patchCommonScriptSource);

        return src;
    }
    function patchAndDivertAppClient() {
        const appClientElement = document.querySelector("script[src*='appClient']");
        const appClientSrcUrl = appClientElement?.src;
        common.log("Fetching appClient from: " + appClientSrcUrl);

        GM.xmlHttpRequest({
            url: appClientSrcUrl,
            anonymous: true,
            onload: async scriptSourceResponse => {
                if ((scriptSourceResponse.status < 200 || scriptSourceResponse.status > 299) && (scriptSourceResponse.status < 500 || scriptSourceResponse.status > 599)) {
                    common.broken("appClient fetch responded with status " + scriptSourceResponse.status);
                }

                const scriptSource = scriptSourceResponse.responseText;
                const scriptSourceFixed = fixRelocatedScriptRelatives(scriptSource, appClientSrcUrl);
                const scriptSourcePatched = await patchAppClientScriptSource(scriptSourceFixed, appClientSrcUrl);

                /*
                Alternative method which seems to have some problems. Didn't bother looking more into it, as the method below is sure to work.
                const patchedAppClientObjectUrl = URL.createObjectURL(new Blob([sourcePatched], { type: "text/javascript" }));
                await import(patchedAppClientObjectUrl);
                URL.revokeObjectURL(patchedAppClientObjectUrl);
                common.log("Patched appClient exited")
                */
                let patchedScriptElement = document.createElement("script");
                patchedScriptElement.async = true;
                patchedScriptElement.type = "module";
                patchedScriptElement.crossOrigin = "anonymous";
                patchedScriptElement.textContent = scriptSourcePatched;
                document.body.appendChild(patchedScriptElement);
            },
            onerror: err => {
                common.log("Error fetching appClient: " + err);
            }
        });

        // We'll continue in the async world of xmlHttpRequest's onload. In this scope, we're done, and should prevent anything more from executing.
        throw new Error("Stopping execution of original script prematurely. THIS IS INTENTIONAL BEHAVIOR, YOU MAY DISREGARD.");
    }

    // The site's appClient script reads __APP_INITIALIZED very early on (before it has read state or anything like that).
    // Hook a getter in front of that variable, where we will run our early patching code, before appClient gets a chance to do anything meaningful.
    let appInitializedValue = null;
    let appClientPatched = false;
    Object.defineProperty(
        win,
        "__APP_INITIALISED",
        {
            get() {
                if (!appClientPatched) {
                    appClientPatched = true;
                    patchAndDivertAppClient();
                    // unreachable();
                }

                return appInitializedValue;
            },
            set(value) {
                appInitializedValue = value;
            }
        }
    );
})();
