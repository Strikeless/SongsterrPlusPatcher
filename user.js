// ==UserScript==
// @name Songsterr Plus Patcher
// @namespace https://github.com/Strikeless
// @version 1.2.1
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
                 * Additionally change user.hasPlus to true and user.profile.plan to "plus" in the state JSON.
                 */
                const stateElement = document.getElementById("state");
                const stateJson = JSON.parse(stateElement.innerHTML);

                stateJson.user.hasPlus = true;
                if (stateJson.user.profile != null) {
                    stateJson.user.profile.plan = "plus";
                } else {
                    // Logged out user, faking a whole profile here to circumvent problems.
                    stateJson.user.profile = {
                        id: 100000000,
                        uid: 100000000,
                        email: "fakeforplus@example.com",
                        name: "fakeforplus",
                        plan: "plus",
                        permissions: [],
                        subscription: null,
                        sra_license: "none",
                        bonus: {
                            activeStart: null,
                            activeEnd: null,
                            balance: 0,
                            balanceMinutes: 0
                        },
                        bonusPurchasedFeatures: [],
                        signature: "invalid_signature_with_no_purpose_other_than_to_exist",
                        created_at: "2025-00-00T00:00:00.000Z",
                        last_signin_date: "2025-00-00T00:00:00.000Z",
                        hadPlusBeforeSE: false,
                        password_change_required: false,
                        preferencesNotifications: {
                            notificationsEmails: false,
                            researchEmails: false
                        }
                    };
                }
                stateElement.innerHTML = JSON.stringify(stateJson);

                /*
                 * For some reason when reloading or opening a tab directly via URL, the tab viewer doesn't load the actual tablature.
                 * This attempts to fix the issue by removing the parent apptab element, hopefully resulting in the site recreating it with the tablature.
                 */
                if (document.getElementById("tablature") == null) {
                    console.log("Songsterr Plus Patcher: tablature element doesn't exist, attempting to fix by removing entire apptab element and letting site recreate it.");
                    document.getElementById("apptab").remove();
                }
            } catch (err) {
                notifyError(err);
            }
        });
    } catch (err) {
        notifyError(err);
    }
})();
