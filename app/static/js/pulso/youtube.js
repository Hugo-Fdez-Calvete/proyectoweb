/* ============================================================
   PULSO · YouTube
   - El inicio de sesión con Google lo hace el servidor (Flask):
     guarda el permiso y renueva el token solo, así cada usuario
     queda enlazado con su YouTube / YouTube Music en cada visita.
   - Este archivo habla con /pulso/api/* y maneja el reproductor IFrame.
   ============================================================ */
(function () {
    'use strict';

    var P = window.Pulso = window.Pulso || {};
    var scripts = {};

    function loadScript(src) {
        if (!scripts[src]) {
            scripts[src] = new Promise(function (res, rej) {
                var s = document.createElement('script');
                s.src = src; s.async = true;
                s.onload = res;
                s.onerror = function () { delete scripts[src]; rej(new Error('script')); };
                document.head.appendChild(s);
            });
        }
        return scripts[src];
    }

    /* Extrae vídeo o lista de un enlace de YouTube / YouTube Music */
    P.parseYouTube = function (text) {
        text = (text || '').trim();
        if (/^[\w-]{11}$/.test(text)) return { video: text };
        var u;
        try { u = new URL(text.indexOf('http') === 0 ? text : 'https://' + text); } catch (e) { return null; }
        if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/.test(u.hostname)) return null;
        var v = u.searchParams.get('v'), list = u.searchParams.get('list');
        if (!v && u.hostname.indexOf('youtu.be') >= 0) v = u.pathname.slice(1, 12);
        var m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
        if (!v && m) v = m[1];
        if (v && !/^[\w-]{11}$/.test(v)) v = null;
        if (!v && !list) return null;
        return { video: v || null, list: list || null };
    };

    P.YouTube = function (opts, h) {
        h = h || {};
        var base = opts.apiBase, loginUrl = opts.loginUrl, logoutUrl = opts.logoutUrl;
        var player = null, playerReady = null, mode = 'video', cancelPending = null;

        /* ---------- API del servidor ---------- */
        function get(path) {
            return fetch(base + path, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
                .then(function (r) {
                    return r.json().catch(function () { return {}; }).then(function (j) {
                        if (!r.ok) {
                            var e = new Error(j.message || j.error || ('HTTP ' + r.status));
                            e.status = r.status; e.reason = j.error;
                            throw e;
                        }
                        return j;
                    });
                });
        }

        /* Abre Google en una ventana emergente para que la música no se corte.
           La página de Google aísla la ventana (Cross-Origin-Opener-Policy), así que no se
           vigila window.closed: al terminar, la página de vuelta (de este mismo dominio)
           avisa por BroadcastChannel / localStorage. */
        function login() {
            var w = window.open(loginUrl + '?popup=1', 'pulso-google',
                'width=520,height=680,left=' + Math.max(0, (screen.width - 520) / 2) + ',top=' + Math.max(0, (screen.height - 680) / 2));
            if (!w) { window.location.href = loginUrl; return new Promise(function () { }); }
            if (cancelPending) cancelPending('superseded');
            return new Promise(function (res, rej) {
                var done = false, bc = null, timer = 0;
                cancelPending = function (why) { finish(why); };
                function finish(result) {
                    if (done) return;
                    done = true;
                    window.removeEventListener('message', onMsg);
                    window.removeEventListener('storage', onStorage);
                    if (bc) bc.close();
                    clearTimeout(timer);
                    cancelPending = null;
                    if (result === 'ok') res(); else rej(new Error(result));
                }
                function onMsg(e) {
                    if (e.origin === window.location.origin && e.data && e.data.pulso === 'google') finish(e.data.result);
                }
                function onStorage(e) {
                    if (e.key === 'pulso-google' && e.newValue) {
                        try { finish(JSON.parse(e.newValue).result); } catch (err) { }
                    }
                }
                window.addEventListener('message', onMsg);
                window.addEventListener('storage', onStorage);
                if ('BroadcastChannel' in window) {
                    bc = new BroadcastChannel('pulso-google');
                    bc.onmessage = function (e) { if (e.data && e.data.result) finish(e.data.result); };
                }
                // si nadie contesta en 10 minutos, se deja de esperar (sin avisos falsos)
                timer = setTimeout(function () { finish('timeout'); }, 600000);
            });
        }

        function logout() {
            return fetch(logoutUrl, { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } });
        }

        /* ---------- Reproductor IFrame ---------- */
        function loadPlayerAPI() {
            if (window.YT && window.YT.Player) return Promise.resolve();
            return new Promise(function (res) {
                var prev = window.onYouTubeIframeAPIReady;
                window.onYouTubeIframeAPIReady = function () { if (prev) prev(); res(); };
                loadScript('https://www.youtube.com/iframe_api');
            });
        }

        function ensurePlayer() {
            if (playerReady) return playerReady;
            playerReady = loadPlayerAPI().then(function () {
                return new Promise(function (res) {
                    player = new YT.Player('pl-yt-frame', {
                        width: '100%', height: '100%',
                        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
                        events: {
                            onReady: function () {
                                if (h.onReady) h.onReady(player);
                                res(player);
                            },
                            onStateChange: function (e) { if (h.onState) h.onState(e.data); },
                            onError: function (e) { if (h.onError) h.onError(e.data); }
                        }
                    });
                });
            });
            return playerReady;
        }

        return {
            login: login,
            logout: logout,
            me: function () { return get('me'); },
            playlists: function () { return get('playlists'); },
            playlistItems: function (id) { return get('playlists/' + encodeURIComponent(id)); },
            search: function (q) { return get('search?q=' + encodeURIComponent(q)); },
            version: function (id, want, title, artist) {
                return get('version/' + encodeURIComponent(id) + '?' + new URLSearchParams({
                    want: want, title: title || '', artist: artist || ''
                }).toString()).then(function (j) { return j.version; });
            },

            /* reproductor */
            playVideo: function (id, start) {
                mode = 'video';
                return ensurePlayer().then(function (p) {
                    p.loadVideoById({ videoId: id, startSeconds: start || 0 });
                });
            },
            playList: function (list) {
                mode = 'list';
                return ensurePlayer().then(function (p) {
                    p.loadPlaylist({ list: list, listType: 'playlist', index: 0 });
                });
            },
            get mode() { return mode; },
            pause: function () { if (player && player.pauseVideo) player.pauseVideo(); },
            resume: function () { if (player && player.playVideo) player.playVideo(); },
            next: function () { if (player && player.nextVideo) player.nextVideo(); },
            prev: function () { if (player && player.previousVideo) player.previousVideo(); },
            seek: function (s) { if (player && player.seekTo) player.seekTo(s, true); },
            setVolume: function (v) {
                if (player && player.setVolume) { player.setVolume(v); if (v > 0 && player.unMute) player.unMute(); }
            },
            get state() { return player && player.getPlayerState ? player.getPlayerState() : -1; },
            get time() { return player && player.getCurrentTime ? player.getCurrentTime() || 0 : 0; },
            get duration() { return player && player.getDuration ? player.getDuration() || 0 : 0; },
            get videoData() { return player && player.getVideoData ? player.getVideoData() : null; }
        };
    };
})();
