// ==UserScript==
// @name Songsterr Plus Patcher
// @namespace https://github.com/Strikeless
// @version 1.0.0
// @description Trick Songsterr to unlock plus features.
// @license The Unlicense
// @supportURL https://github.com/Strikeless/SongsterrPlusPatcher
// @match http*://*.songsterr.com/*
// @run-at document-end
// ==/UserScript==

(function () {
    try {
        // Get the state element and parse it.
        const state = window.document.getElementById("state");
        const stateJson = JSON.parse(state.innerHTML);

        // Apply patches to the state JSON.
        stateJson.user.hasPlus = true;

        // Write the patches back to the state.
        state.innerHTML = JSON.stringify(stateJson);

        // Delete the tab viewer so that the website creates a new one, now with our patches.
        window.document.getElementById("apptab").remove();

        // Occasionally the tab viewer doesn't seem to be recreated, so just reload the site if it doesn't exist by the time the load event is fired.
        // Bit hacky but the problem doesn't occur all that often and this works well enough when it does.
        window.addEventListener("load", (event) => {
            if (window.document.getElementById("apptab") == null) {
                window.location.reload();
            }
        });
    } catch (err) {
        window.alert("Songsterr Plus Patcher error:\n    " + err + "\n\nMake sure the userscript is updated. If the issue persists, feel free to report it to https://github.com/Strikeless/SongsterrPlusPatcher");
    }
})();