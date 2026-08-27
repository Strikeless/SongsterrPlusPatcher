// ==UserScript==
// @name Songsterr Plus Patcher
// @namespace https://github.com/Strikeless
// @version 1.3.2
// @description Trick Songsterr to unlock plus features.
// @author       Stalker2284835, temporary solution inspired by GoulagmanYt
// @match        *://*.songsterr.com/*
// @grant        unsafeWindow
// @grant        GM_addStyle
// @run-at       document-start
// @license      MIT
// ==/UserScript==

/*
Copyright 2026, https://github.com/Strikeless

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/


(function () {
    'use strict';

    console.log('%c[Songsterr Plus Patcher] Active v1.3.2', 'color:#4caf50;font-weight:bold');

    try {
        localStorage.removeItem('persist:root');
        localStorage.removeItem('painTextTopbar');
    } catch (e) { }

    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const MAGIC_ID = Math.floor(9e8 * Math.random()) + 1e8;
    const PREMIUM_FEATURES = ['print', 'export', 'download', 'speed', 'loop', 'solo', 'mute', 'pitchshift', 'retune', 'slowdown'];

    const MAGIC_PROFILE = {
        id: MAGIC_ID,
        uid: MAGIC_ID,
        email: `plususer${MAGIC_ID}@songsterr.com`,
        name: 'Songsterr User',
        plan: 'plus',
        hasPlus: true,
        permissions: [],
        subscription: { plan: { id: 'plus' } },
        bonus: {
            activeStart: new Date(Date.now() - 60000).toISOString(),
            activeEnd: new Date(Date.now() + 86400000).toISOString(),
            balanceMinutes: 999999
        },
        bonusPurchasedFeatures: [],
        signature: 'patched_signature',
        hadPlusBeforeSE: true
    };

    function buildMagicProfile(songId) {
        const features = songId ? [{ songId: Number(songId), features: PREMIUM_FEATURES }] : [];
        return { ...MAGIC_PROFILE, bonusPurchasedFeatures: features };
    }

    function getSongIdFromUrl(url) {
        const m = String(url || location.href).match(/\/s(\d+)(?:\/|$)/) ||
            String(url || location.href).match(/\/(?:songs?|meta)\/(\d+)/);
        return m ? m[1] : null;
    }

    function patchPremiumAccess(data, fallbackSongId) {
        if (!data || typeof data !== 'object') return data;
        const songId = data.meta?.current?.songId || data.meta?.songId ||
            data.current?.songId || data.songId || data.id || fallbackSongId;
        const profile = buildMagicProfile(songId);

        if (data.user) {
            data.user.hasPlus = true;
            data.user.isLoggedIn = true;
            data.user.profile = profile;
            data.user.bonusPurchasedFeatures = profile.bonusPurchasedFeatures;
        }
        if (data.meta) {
            data.meta.allowedByLicense = true;
            if (data.meta.current) {
                data.meta.current.allowedByLicense = true;
                data.meta.current.isAllowDownload = true;
            }
        }
        if ('allowedByLicense' in data) data.allowedByLicense = true;
        if ('isAllowDownload' in data) data.isAllowDownload = true;
        if (data.current) {
            data.current.allowedByLicense = true;
            data.current.isAllowDownload = true;
        }
        if (data.bonus) data.bonus.activatingPlus = true;
        if (data.player) {
            data.player.locks = [];
            data.player.constraints = null;
        }
        if (data.painTextTopbar) {
            data.painTextTopbar.pain = null;
            data.painTextTopbar.closedAt = null;
        }
        if (data.print) data.print.pending = false;
        return data;
    }

    function jsonResponse(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    function getMockedResponse(url, method) {
        let path;
        try { path = new URL(String(url), location.origin).pathname; }
        catch { path = String(url); }

        if (/\/api\/preferences?$/.test(path)) {
            return jsonResponse(method === 'GET' ? { multirestEnabled: true, writtenPitchNotation: false } : {});
        }
        if (/\/api\/(user-playlist|playlist)$/.test(path)) {
            return jsonResponse({ songs: [], playlists: [] });
        }
        if (/\/api\/favorites$/.test(path)) {
            return jsonResponse([]);
        }
        if (/\/api\/contributions\/available-tracks$/.test(path)) {
            return jsonResponse({
                availableTracks: [],
                soloQuotaAvailable: true,
                backingQuotaAvailable: true,
                updatedAt: Date.now()
            });
        }
        if (/\/api\/contributions\//.test(path)) {
            return jsonResponse([]);
        }
        return null;
    }

    // ========== FETCH HOOK ==========
    const originalFetch = win.fetch;

    const hookedFetch = async function (resource, options) {
        const url = (typeof resource === 'object' && resource instanceof Request) ? resource.url : String(resource || '');
        const method = String(options?.method || (resource?.method) || 'GET').toUpperCase();

        if (url.includes('/auth/profile')) {
            return jsonResponse(buildMagicProfile(getSongIdFromUrl(location.href)));
        }

        const mocked = getMockedResponse(url, method);
        if (mocked) return mocked;

        if (url.includes('/api/meta/') || url.includes('/api/songs/') ||
            url.includes('/api/tab/') || url.includes('/api/song/')) {
            try {
                const response = await originalFetch(resource, options);
                const data = await response.clone().json().catch(() => null);
                if (!data || typeof data !== 'object') return response;

                patchPremiumAccess(data, data.songId || data.id || getSongIdFromUrl(url));

                const headers = new Headers(response.headers);
                headers.delete('content-encoding');
                headers.delete('content-length');
                headers.set('Content-Type', 'application/json');

                return new Response(JSON.stringify(data), {
                    status: response.status,
                    statusText: response.statusText,
                    headers
                });
            } catch (e) {
                return originalFetch(resource, options);
            }
        }

        if (/(sentry|logs|analytics|useraudio)/i.test(url)) {
            return new Response('{}', { status: 200 });
        }

        return originalFetch(resource, options);
    };

    try {
        Object.defineProperty(win, 'fetch', {
            value: hookedFetch,
            writable: false,
            configurable: false
        });
        console.log('%c[Songsterr Plus Patcher] fetch hook installed', 'color:#4caf50');
    } catch (e) {
        win.fetch = hookedFetch;
        console.log('%c[Songsterr Plus Patcher] fetch hook installed (fallback)', 'color:#4caf50');
    }

    // ========== STATE PATCH ==========
    function patchState() {
        const el = document.getElementById('state');
        if (!el) return false;
        try {
            const text = el.textContent.trim();
            if (!text) return false;
            const data = JSON.parse(text);
            const songId = data.meta?.current?.songId || data.meta?.songId || data.part?.songId;
            data.user = data.user || {};
            data.bonus = data.bonus || {};
            patchPremiumAccess(data, songId);
            data.consent = { loading: false, suite: 'tcf', view: 'none' };
            const patched = JSON.stringify(data);
            if (el.textContent !== patched) {
                el.textContent = patched;
                console.log('%c[Songsterr Plus Patcher] #state patched', 'color:#4caf50');
                return true;
            }
        } catch (e) { }
        return false;
    }

    const stateObs = new MutationObserver(() => {
        if (patchState()) stateObs.disconnect();
    });
    if (document.documentElement) {
        stateObs.observe(document.documentElement, { childList: true, subtree: true });
    }
    setTimeout(patchState, 50);
    setTimeout(patchState, 400);
    setTimeout(patchState, 1200);

    // ========== CSS ==========
    GM_addStyle(`
        #promo, #menu-plus, a[href="/plus"], a[href^="/plus?"],
        #menu-account [class*="hasPlusSurface"] {
            display: none !important; visibility: hidden !important;
        }
        #tuning-button-location [class*="_lock"],
        #tuning-button-location [class*="_wrapper"],
        button[id^="mixer-solo-"] svg[class*="_lock"],
        button[id^="mixer-mute-"] svg[class*="_lock"],
        button[id^="mixer-solo-"] svg[class*="_plus"],
        button[id^="mixer-mute-"] svg[class*="_plus"] {
            display: none !important; visibility: hidden !important;
        }

        /* Fix the BPM button on touch devices */
        .uRMlwq_bpm button:before,
        [class*="_bpm"] button:before {
            position: absolute;
            width: 100%;
            height: 100%;
            z-index: 1;
            content: '';
            scale: 2;
        }

        .uRMlwq_bpm:before {
            content: '';
            position: absolute;
            width: 60%;
            height: 100%;
            top: -10%;
            left: 20%;
            scale: 3;
        }
    `);

    // ========== MIXER FIX (the missing part) ==========
    function unlockMixer() {
        document.querySelectorAll('button[id^="mixer-solo-"], button[id^="mixer-mute-"]').forEach(btn => {
            btn.removeAttribute('disabled');
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
            btn.querySelectorAll('svg use[href*="lock"], svg use[*|href*="lock"], svg use[href*="addtrack"]').forEach(use => {
                const svg = use.closest('svg');
                if (svg) svg.style.setProperty('display', 'none', 'important');
            });
        });
    }

    // Force synth source when needed
    function forceSynth() {
        const input = document.querySelector('#control-source input[value="synth"]');
        if (input && !input.checked) {
            const label = input.closest('label');
            if (label) label.click();
            else input.click();
        }
    }

    // Catch clicks on mixer buttons
    document.addEventListener('click', e => {
        const btn = e.target.closest('button[id^="mixer-solo-"], button[id^="mixer-mute-"]');
        if (!btn) return;

        // Always force synth + unlock before the click goes through
        forceSynth();
        unlockMixer();
    }, true);

    // ========== CONTINUOUS UNLOCK ==========
    setInterval(() => {
        // Main controls
        ['control-speed', 'control-loop', 'control-solo', 'control-mute',
            'control-pitchshift', 'control-print', 'control-export',
            'control-metronome', 'control-transpose', 'control-voice-practice'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.querySelectorAll('svg use[href*="lock"]').forEach(u => {
                    const s = u.closest('svg');
                    if (s) s.style.setProperty('display', 'none', 'important');
                });
                el.removeAttribute('disabled');
                el.removeAttribute('aria-disabled');
                el.classList.remove('Cny223');
                el.style.pointerEvents = 'auto';
            });

        // Mixer
        unlockMixer();

        // Hide upsells
        document.querySelectorAll('#promo, #menu-plus, a[href="/plus"]').forEach(el => {
            el.style.setProperty('display', 'none', 'important');
        });
    }, 800);
})();