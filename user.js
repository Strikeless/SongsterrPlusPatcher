// ==UserScript==
// @name Songsterr Plus Patcher
// @namespace https://github.com/Strikeless
// @version 1.4.1-DEV
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
            enablePlusPatches: false,
            enableLateFixes: true,
            debugSourcePatcher: false,
            debugSiteEvents: null,
            cancelSiteEventCuriosity: true,
            cancelSiteOtherCuriosity: true,
            cancelSitePromo: true,
            cancelSiteExperiments: true
        },
        log: (...args) => console.log("[SongsterrPlusPatcher] " + args.join(" ")),
        warn: (...args) => console.warn("[SongsterrPlusPatcher] " + args.join(" ")),
        error: (...args) => console.error("[SongsterrPlusPatcher] " + args.join(" ")),
        broken: function (msg) {
            this.error("Broken: " + msg);
            const alertConfirmed = window.confirm("SongsterrPlusPatcher has detected it is broken due to site changes. Please disable the userscript until an update has been published to avoid problems. The page will reload when you confirm.");
            if (alertConfirmed) window.location.reload();
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

    /***** Source-injected hooks *****/

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
                // Since we're in demo mode, some links have ?demo=enabled appended to them (e.g. the mixer parts).
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
                headerRegenerateElement?.remove();

                const headerPrintElement = document.getElementById("header-print");
                headerPrintElement?.remove();
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

                    if (changedState.layer != null) {
                        // Some layers have content that is dynamically added to the DOM. We'll have to rerun the late hook to apply any patches to those.
                        setTimeout(lateUiHook, 50);
                    } else if (changedState.runningThunks != null) {
                        // This is javascriptism for a working "changedState.runningThunks == {}" by value.
                        if (Object.keys(changedState.runningThunks).length == 0) {
                            // All thunks finished running. We're using this as a trigger for when the whole tab viewer DOM has loaded.
                            // This is even more stupid than the previous stupid, but somehow it's more reliable than the other things I tried...
                            setTimeout(lateUiHook, 50);
                        }
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

    /***** Script Source patchers *****/

    const sourcePatchAppClient = async (src, scriptOriginUrl) => {
        common.log("src: " + src + ", origin: " + scriptOriginUrl);

        if (common.cfg.enablePlusPatches) {
            // This is so stupid. We are patching hardcoded demo song id checks with this.
            src = src
                .replaceAll("===27", "===27 || true")
                .replaceAll("!==27", "!==27 && false");
        }

        // Inject our entry hook as the very first thing in the script.
        src = `
            await ( ${appClientEntryHook.toString()} )(window.${commonObjectGlobalIdentifier});
            ${src}
        `;

        /*
         * Inject our context hook after the context object is created in the initializer function.
         * On second thought, maybe they actually should burn me alive for writing these regexes. Jesus fucking christ.
         * The proper way to do this would be to parse the script to an AST, make our modifications using that, and then reconstruct the script from the AST. Don't use these regexes as an example, please.
         */
        const [_match, ctxVariableIdentifier, storeVariableIdentifier] = src.match(/let\s*(\w+)\s*=[^,]+,\s*(\w+)\s*=\s*\w+\.get\([^.]+\.Store\)/)
            ?? common.broken(`Didn't find parameter(s) for context hook (ctx: ${ctxVariableIdentifier}, store: ${storeVariableIdentifier})`);

        let appliedHook = false;
        src = src.replace(
            new RegExp(String.raw`(?<=${storeVariableIdentifier}=${ctxVariableIdentifier}\.get\(\w+\.Store[^;]+);`),
            (..._args) => {
                appliedHook = true;
                return `; await ( ${appClientContextHook.toString()} )(window.${commonObjectGlobalIdentifier}, ${ctxVariableIdentifier}, ${storeVariableIdentifier});`;
            }
        );
        if (appliedHook) {
            common.log(`Found context hook injection point (ctx: ${ctxVariableIdentifier}, store: ${storeVariableIdentifier})`);
        } else {
            common.broken(`Didn't find injection point for context hook (ctx: ${ctxVariableIdentifier}, store: ${storeVariableIdentifier})`);
        }

        return src;
    }
    const sourcePatchCommon = async (src, originalSourceUrl) => {
        // Don't add the demo=enabled URL parameter since we're in demo mode.
        src = src.replaceAll(".searchParams.set(`demo`, `enabled`)", ";");

        return src;
    }

    /***** Source-patching framework *****/

    const sourcePatcherRegistry = [
        [/.*appClient-.*\.js/, sourcePatchAppClient],
        [/.*common-.*\.js/, sourcePatchCommon],
    ];

    const sourcePatcherCache = new Map();

    async function downloadScriptSource(url) {
        const response = await GM.xmlHttpRequest({
            url,
            anonymous: true
        });

        if ((response.status < 200 || response.status > 299) && (response.status < 500 || response.status > 599)) {
            common.broken(`Script fetch responded with status ${response.status}: ${url}`);
        }

        return response.responseText;
    }
    function downloadScriptSourceSync(url, onDownloaded) {
        GM.xmlHttpRequest({
            url: appClientSrcUrl,
            anonymous: true,
            onload: async (response) => {
                if ((response.status < 200 || response.status > 299) && (response.status < 500 || response.status > 599)) {
                    common.broken(`Script fetch responded with status ${response.status}: ${url}`);
                }

                const scriptSource = response.responseText;
                await onDownloaded(scriptSource);
            },
            onerror: (err) => {
                common.error("Downloading script source: " + err);
            }
        });
    }

    async function sourcePatch(src, srcOriginUrlCanonical) {
        async function sourcePatchImport(importUrl) {
            // Canonicalize the import URL against this script's origin URL, so that relative URLs get resolved correctly.
            const importUrlCanonical = new URL(importUrl, srcOriginUrlCanonical).href;

            // Download the imported script, patch it and return the object URL of the patched script for the import.
            const importScriptSource = await downloadScriptSource(importUrlCanonical);
            return await sourcePatch(importScriptSource, importUrlCanonical);
        }

        async function asyncReplaceAll(haystack, pattern, substitutionProvider) {
            const patternMatches = Array.from(haystack.matchAll(pattern));
            const patternMatchSubstitutions = await Promise.all(patternMatches.map(substitutionProvider));

            let substitutedHaystackBuffer = "";
            let prevMatchEndIndex = 0;
            for (const [i, match] of patternMatches.entries()) {
                const matchStartIndex = match.index;

                // Add everything from between the end of the previous match and the start of this match.
                // This way we leave out only the matches, adding their substitutions after this slice.
                substitutedHaystackBuffer += haystack.slice(prevMatchEndIndex, matchStartIndex);
                substitutedHaystackBuffer += patternMatchSubstitutions[i];

                // Match[0] means the entire capture of the match. Subsequent indices would be captured groups.
                prevMatchEndIndex = matchStartIndex + match[0].length;
            }

            // Still have the remainder of haystack after the last match to add.
            substitutedHaystackBuffer += haystack.slice(prevMatchEndIndex);

            return substitutedHaystackBuffer;
        }

        if (sourcePatcherCache.has(srcOriginUrlCanonical)) {
            // There already exists a patched instance of this script, use that.
            // This is not just an optimization, but a requirement for getting correct behavior when the same module script is imported many times.
            return sourcePatcherCache.get(srcOriginUrlCanonical);
        }

        // Patch all module imports. This serves two purposes: recursive module patching, but more importantly, getting rid of relative import URLs
        // which would resolve incorrectly in the patched script, because the patched script is not located at it's original URL.
        src = await asyncReplaceAll(
            src,
            /import\s*\(\s*["'`]([^"'`]*)["'`]\s*\)/g,
            async ([match, importUrl]) => {
                if (common.cfg.debugSourcePatcher) common.log(`Extracted import URL "${importUrl}": ${match}`);
                const sourcePatchedImportUrl = await sourcePatchImport(importUrl);
                return `import("${sourcePatchedImportUrl}")`;
            }
        );
        src = await asyncReplaceAll(
            src,
            // This is unreadable even for a regex. Hope it works.
            /from\s*["'`]((?:(?:https?)?:\/\/[^\/]*)?\.?\/[%\-./0-9A-z]*)["'`]/g,
            async ([match, importUrl]) => {
                if (common.cfg.debugSourcePatcher) common.log(`Extracted import URL "${importUrl}": ${match}`);
                const sourcePatchedImportUrl = await sourcePatchImport(importUrl);
                return `from "${sourcePatchedImportUrl}"`;
            }
        );

        // Run matching source patchers from the registry.
        for (const [patcherMatcher, patcher] of sourcePatcherRegistry.values()) {
            if (!patcherMatcher.test(srcOriginUrlCanonical)) continue;
            src = await patcher(src, srcOriginUrlCanonical);
        }

        // We now a patched version of the script source. We must still create a blob object URL out of it.
        // This way we can easily update `import` calls to the patched script, and since we're caching these object URLs
        // we also get the expected "single execution" behavior when it is imported multiple times, just like with the original scripts.
        const patchedSourceBlobUrl = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
        sourcePatcherCache.set(srcOriginUrlCanonical, patchedSourceBlobUrl);

        if (common.cfg.debugSourcePatcher) {
            common.log(`Source-patched "${srcOriginUrlCanonical.split('/').at(-1)}": ${patchedSourceBlobUrl}`);
        }

        return patchedSourceBlobUrl;
    }

    async function createSourcePatchedScriptElementFromScriptElement(scriptElement) {
        let scriptSource = scriptElement.src != null
            ? await downloadScriptSource(scriptElement.src)
            : scriptElement.textContent;

        let scriptOriginUrlCanonical = scriptElement.src != null
            ? new URL(scriptElement.src, window.location.href).href
            : window.location.href;

        const patchedScriptBlobUrl = await sourcePatch(scriptSource, scriptOriginUrlCanonical);

        const patchedScriptElement = document.createElement("script");
        patchedScriptElement.src = patchedScriptBlobUrl;
        patchedScriptElement.type = scriptElement.type;
        patchedScriptElement.async = scriptElement.async;
        patchedScriptElement.crossOrigin = scriptElement.crossOrigin;
        document.body.appendChild(patchedScriptElement);
    }

    /***** Initial source-patch hook *****/

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

                    // Source-patch the appClient script and add it as a script element so it'll start running soon.
                    const appClientElement = document.querySelector("script[src*='appClient']") ?? common.broken("Didn't find appClient script element");
                    createSourcePatchedScriptElementFromScriptElement(appClientElement);

                    // We should currently be running in the original appClient script.
                    // We don't want this original script to continue running and interfere with the patched script, so just throw an error to stop it dead on its tracks.
                    throw new Error("Stopping execution of original appClient prematurely. THIS IS INTENTIONAL BEHAVIOR, YOU MAY DISREGARD.")
                }

                return appInitializedValue;
            },
            set(value) {
                appInitializedValue = value;
            }
        }
    );
})();
