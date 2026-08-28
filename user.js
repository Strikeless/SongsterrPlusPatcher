// ==UserScript==
// @name Songsterr Plus Patcher
// @namespace https://github.com/Strikeless
// @version 1.5.1
// @description Trick Songsterr to unlock plus features.
// @license MIT
// @supportURL https://github.com/Strikeless/SongsterrPlusPatcher
// @match *://*.songsterr.com/*
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
        this.warn("Issue detected: " + msg);
        console.error("[SongsterrPlusPatcher] Broken:", msg);
    }
};

if (typeof GM.xmlHttpRequest == "undefined") {
    window.alert("SongsterrPlusPatcher is definitely incompatible with your userscript manager. Please make sure you are on a recent version, or switch to Violentmonkey.");
    return;
}

const win = (typeof unsafeWindow !== "undefined" && unsafeWindow) ? unsafeWindow : window;

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
    common.log("Hello from patched appClient entry hook!");

    function patchStateData(state) {
        if (!state) state = {};
        state.demo = {
            active: true,
            enabled: true
        };
        if (!state.query) state.query = {};
        state.query.demo = "enabled";

        if (!state.queryContent) state.queryContent = {};
        state.queryContent.demo = "enabled";

        if (!state.bonus) state.bonus = {};
        state.bonus.activatingPlus = true;

        if (!state.user) state.user = {};
        state.user.hasPlus = true;
        if (!state.user.profile) {
            state.user.profile = { plan: "plus" };
        } else {
            state.user.profile.plan = "plus";
        }

        if (state.player) {
            state.player.constraints = null;
            state.player.playbackAvailable = true;
        }

        return state;
    }

    function applyStateDataPatch() {
        const stateJsonElement = document.getElementById("state");
        if (stateJsonElement && stateJsonElement.innerHTML) {
            try {
                const stateData = JSON.parse(stateJsonElement.innerHTML);
                const stateDataPatched = patchStateData(stateData);
                stateJsonElement.innerHTML = JSON.stringify(stateDataPatched);
            } catch (e) {
                common.warn("Failed to patch state data:", e);
            }
        }
    }

    if (common.cfg.enablePlusPatches) {
        applyStateDataPatch();
        document.getElementById("app")?.remove();
    }
};

const appClientContextHook = async function (common, ctx, store) {
    common.log("Hello from patched appClient context hook!");

    function lateUiHook() {
        if (!common.cfg.enableLateFixes) return;

        const state = store.get?.() || {};
        const isPanelOpen = state.route?.isPanel;
        const hasActiveLayer = !!state.layer?.layer;

        // Panel veya katman kapalıyken ekranda kalan sahipsiz overlay elemanlarını temizle
        if (!isPanelOpen) {
            const sidebarOverlay = document.getElementById("sidebar-overlay");
            if (sidebarOverlay && !document.body.classList.contains("panel-opened")) {
                sidebarOverlay.remove();
            }
        }

        if (!hasActiveLayer) {
            const layerOverlay = document.getElementById("hide-layer-overlay");
            if (layerOverlay) {
                layerOverlay.remove();
            }
        }

        const headerRegenerateElement = document.getElementById("header-regenerate");
        headerRegenerateElement?.remove();

        const headerPrintElement = document.getElementById("header-print");
        headerPrintElement?.remove();
    }

    const genuineStoreDispatchFunc = store.dispatch;
    function storeDispatchHook(eventIdentifier, ...eventDataArgs) {
        if (common.cfg.debugSiteEvents != null && common.cfg.debugSiteEvents.test(eventIdentifier)) {
            const stringifiedEventDataArgsObjectRefs = new WeakSet();
            const stringifiedEventDataArgs = JSON.stringify(
                eventDataArgs,
                (_key, value) => {
                    if (typeof value != "object" || value == null) return value;
                    if (stringifiedEventDataArgsObjectRefs.has(value)) return "<...>";
                    stringifiedEventDataArgsObjectRefs.add(value);
                    return value;
                }
            );

            common.log(`[DISPATCH DEBUG] "${eventIdentifier}": ${stringifiedEventDataArgs}`);
        }

        switch (eventIdentifier) {
            case "layer/show": {
                const layerObj = eventDataArgs[0];
                const layerName = typeof layerObj === "string" ? layerObj : (layerObj?.layer || "");
                if (layerName.startsWith("plus_") || layerName === "constraints_modal" || layerName === "upgrade_to_pro_modal") {
                    common.log(`Suppressed paywall layer: "${layerName}"`);
                    return;
                }
                break;
            }
            case "player/setConstraints": {
                // Orijinal sesin duraklatılmasını engelle
                return genuineStoreDispatchFunc("player/setConstraints", null);
            }
            case "experiments/activate": {
                const experimentName = eventDataArgs[0]?.experimentName;
                if (experimentName == "plus_freeriders") {
                    common.log("Experiment plus_freeriders intercepted and suppressed.");
                } else if (common.cfg.cancelSiteExperiments) {
                    common.log(`Rejecting experiment "${experimentName}" to deter script breakage.`);
                } else {
                    common.log(`Experiment "${experimentName}" was activated`);
                }
                return;
            }
            case "demo/deactivate": {
                common.log("demo/deactivate intercepted and ignored to preserve plus features.");
                return;
            }
            case "route/change": {
                setTimeout(lateUiHook, 50);
                break;
            }
            case "@changed": {
                const changedState = eventDataArgs[0];
                if (changedState && (changedState.screen != null || changedState.player != null || changedState.layer != null || changedState.route != null)) {
                    setTimeout(lateUiHook, 50);
                }
                break;
            }
            default: {
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
    src = src.replaceAll(
        /["'`](\.+\/[^"'`]+.js)["'`]/g,
        (match, capturedPath) => {
            const canonicalPath = new URL(capturedPath, scriptOriginalSourceUrl).href;
            if (common.cfg.debugSourcePatcher) common.log(`Canonicalized relative script URL in patched script: ${capturedPath} -> ${canonicalPath}`);
            return `"${canonicalPath}"`;
        }
    );
    return src;
}

async function patchAppClientScriptSource(src, originalSourceUrl) {
    /***** Plus patches *****/
    if (common.cfg.enablePlusPatches) {
        src = src
            .replaceAll("===27", "===27 || true")
            .replaceAll("!==27", "!==27 && false");

        // Kısıtlama fonksiyonlarını override ederek tüm Plus yetkilerini aktif et
        const symbolsToOverride = ['wi', 'cr', 'ci', 'Da', 'En', 'il'];
        symbolsToOverride.forEach(sym => {
            src = src.replace(new RegExp(`(\\w+)\\s+as\\s+${sym}\\b`), `$1 as _orig_${sym}`);
        });

        const firstImportEnd = src.lastIndexOf('from"./');
        const endOfImports = firstImportEnd !== -1 ? (src.indexOf(';', firstImportEnd) + 1) : 0;

        const stubs = `

const wi = () => true;
const cr = () => true;
const ci = () => true;
const Da = () => true;
const En = () => true;
const il = () => true;
`;
src = src.substring(0, endOfImports) + stubs + src.substring(endOfImports);
}

    /***** Hook injections *****/
    if (src.includes("async function sA(){")) {
        src = src.replace(
            /async function sA\(\)\{/,
            `async function sA(){ await ( ${appClientEntryHook.toString()} )(window.${commonObjectGlobalIdentifier}); `
        );
    } else {
        src = `
            await ( ${appClientEntryHook.toString()} )(window.${commonObjectGlobalIdentifier});
            ${src}
        `;
    }

    // Context ve Store nesnelerini bağlama
    let ctxVariableIdentifier = null;
    let storeVariableIdentifier = null;

    const storeMatch = src.match(/(\w+)=(\w+)\.get\(\w+\.Store\)/);
    if (storeMatch) {
        storeVariableIdentifier = storeMatch[1];
        ctxVariableIdentifier = storeMatch[2];
    } else {
        ctxVariableIdentifier = src.match(/(\w+)=\w+\({state:JSON\.parse/)?.[1];
        if (ctxVariableIdentifier) {
            storeVariableIdentifier = src.match(new RegExp(String.raw`(\w+)=${ctxVariableIdentifier}\.get\(\w+\.Store\)`))?.[1];
        }
    }

    if (ctxVariableIdentifier == null || storeVariableIdentifier == null) {
        common.broken(`Didn't find parameter(s) for context hook (ctx: ${ctxVariableIdentifier}, store: ${storeVariableIdentifier})`);
    }

    let appliedHook = false;
    src = src.replace(
        new RegExp(String.raw`(?<=${storeVariableIdentifier}=${ctxVariableIdentifier}\.get\(\w+\.Store[^;]+);`),
        () => {
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

    throw new Error("Stopping execution of original script prematurely. THIS IS INTENTIONAL BEHAVIOR, YOU MAY DISREGARD.");
}

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
            }

            return appInitializedValue;
        },
        set(value) {
            appInitializedValue = value;
        }
    }
);

})();
