// ==UserScript==
// @name Songsterr Plus Patcher
// @namespace https://github.com/Strikeless
// @version 1.1.0
// @description Trick Songsterr to unlock plus features.
// @license The Unlicense
// @supportURL https://github.com/Strikeless/SongsterrPlusPatcher
// @match http*://*.songsterr.com/*
// @run-at document-start
// @grant unsafeWindow
// ==/UserScript==

(function () {
    function notifyError(err) {
        alert(
            "Songsterr Plus Patcher encountered an error."
            + "\nfeel free to report this issue at https://github.com/Strikeless/SongsterrPlusPatcher ."
            + "\nIf the issue persists, you can disable the userscript and try some of the other userscripts for Songsterr on Greasyfork."
            + "\n    (alternatively, consider subscribing Songsterr plus, if you have the money to throw and you enjoy their service.)"
            + "\n\n" + err
        );
    }

    try {
        const fetchParent = unsafeWindow || window; // unsafeWindow required to wrap the fetch function in the same context that the actual site uses.
        const innerFetch = fetchParent.fetch;

        function mockProfile(profile) {
            if (profile.plan == "plus") {
                console.log("Songsterr Plus Patcher: You already have Songsterr plus!");
                return profile;
            }

            profile.plan = "plus";
            profile.subscription = {
                plan: {
                    id: "plus"
                }
            };

            return profile;
        }

        /*
         * Wrap the fetch function in our own version that intercepts requests to the profile detail endpoint, mocking plus status.
         */
        function interceptingFetch(resource, options) {
            var resource_url = JSON.stringify(resource); // Not really sure if JSON.stringify is the right tool for the job, but it works. (unlike toString)

            if (resource_url.includes("/auth/profile")) {
                console.log("Songsterr Plus Patcher: Intercepting /auth/profile request to " + resource_url + ".");

                return innerFetch(resource, options)
                    .then(response => response.json())
                    .then(responseProfile => mockProfile(responseProfile))
                    .then(mockedProfile => new Response(JSON.stringify(mockedProfile)))
                    .catch(err => notifyError(err));
            } else {
                return innerFetch(resource, options);
            }
        }

        Object.defineProperty(fetchParent, "fetch", {
            value: function () {
                return interceptingFetch(...arguments);
            },
            configurable: true,
            enumerable: false,
            writable: true,
        });

        document.addEventListener("DOMContentLoaded", () => {
            try {
                /*
                 * Additionally change use.hasPlus to true in the state JSON. This is the old way things were done, and
                 * no longer seems to be necessary with mocked profile responses, but probably wont do any harm either.
                 */
                const stateElement = document.getElementById("state");
                const stateJson = JSON.parse(stateElement.innerHTML);

                stateJson.user.hasPlus = true;
                stateElement.innerHTML = JSON.stringify(stateJson);
            } catch (err) {
                notifyError(err);
            }
        });
    } catch (err) {
        notifyError(err);
    }
})();
