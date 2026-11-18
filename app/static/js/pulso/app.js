/* ============================================================
   PULSO · App
   Une el visual, el motor de audio y YouTube con la interfaz.
   ============================================================ */
(function () {
    'use strict';

    var P = window.Pulso;
    var root = document.getElementById('pulso');
    if (!root || !P) return;

    function $(id) { return document.getElementById(id); }

    var YS = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 };

    var audio = P.Audio();
    var yt = P.YouTube({
        apiBase: root.getAttribute('data-api'),
        loginUrl: root.getAttribute('data-login-url'),
        logoutUrl: root.getAttribute('data-logout-url')
    }, { onState: onYtState, onError: onYtError, onReady: function () { applyVol(); } });
    var googleReady = root.getAttribute('data-google-ready') === '1';
    var visual = P.Visual(root, function (dt) { return audio.getLevels(dt); });

    /* ---------- Datos ---------- */
    var API = root.getAttribute('data-api');
    var mine = [];            // canciones de la nube del usuario (se cargan del servidor)
    var demos = audio.presets.map(function (p, i) {
        return { type: 'synth', index: i, title: p.name, sub: p.style };
    });

    var cur = { queue: null, index: -1, item: null };
    var started = false, fileErrors = 0, me = null, syncDeclined = false;

    /* preferencias del usuario (se recuerdan en este navegador) */
    function pref(k, def) { try { var v = localStorage.getItem('pl-' + k); return v === null ? def : v; } catch (e) { return def; } }
    function setPref(k, v) { try { localStorage.setItem('pl-' + k, v); } catch (e) { } }
    var ytMode = pref('ytmode', 'audio');          // 'audio' = solo canción · 'video' = con vídeo
    var autoSync = pref('autosync', '1') === '1';

    /* ---------- Elementos ---------- */
    var intro = $('pl-intro'), dock = $('pl-dock'), lib = $('pl-lib'), libBtn = $('pl-lib-btn');
    var playBtn = $('pl-play'), seek = $('pl-seek'), vol = $('pl-vol'), chip = $('pl-react');
    var ytBox = $('pl-yt-box'), syncBtn = $('pl-sync'), toastEl = $('pl-toast');
    var vizBtn = $('pl-viz'), chipText = chip.querySelector('span');

    /* ---------- Utilidades ---------- */
    var toastTimer = 0;
    function toast(msg, ms) {
        toastEl.textContent = msg;
        toastEl.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, ms || 3600);
    }

    function fmt(s) {
        if (!isFinite(s) || s < 0) s = 0;
        var m = Math.floor(s / 60), r = Math.floor(s % 60);
        return m + ':' + (r < 10 ? '0' : '') + r;
    }

    function isYt(it) { return it && (it.type === 'yt' || it.type === 'ytlist'); }

    function isPlaying() {
        var it = cur.item;
        if (!it) return false;
        if (it.type === 'file') return !audio.el.paused && !audio.el.ended;
        if (it.type === 'synth') return audio.synthPlaying;
        return yt.state === YS.PLAYING || yt.state === YS.BUFFERING;
    }

    function same(a, b) {
        if (!a || !b || a.type !== b.type) return false;
        if (a.type === 'file') return a.url === b.url;
        if (a.type === 'synth') return a.index === b.index;
        return a.id === b.id;
    }

    /* ---------- Reproducción ---------- */
    var mixTimer = 0;
    function playItem(queue, i) {
        var it = queue && queue[i];
        if (!it) return;
        if (!started) start(true);
        audio.unlock();
        cur = { queue: queue, index: i, item: it };
        clearTimeout(mixTimer);

        if (!isYt(it)) { yt.pause(); ytBox.hidden = true; setTheater(false); }
        setTimeout(syncRing, 0);
        if (it.type !== 'file') audio.pauseFile();
        if (it.type !== 'synth') audio.stopSynth();
        if (it.type === 'file') {
            audio.playFile(it.url).then(function () { fileErrors = 0; }).catch(function (err) {
                if (err && err.name === 'NotAllowedError') toast('El navegador ha bloqueado el sonido: pulsa ▶', 5000);
                // los fallos de carga los explica el evento «error» del <audio>
            });
        } else if (it.type === 'synth') {
            audio.playSynth(it.index);
        } else {
            ytBox.hidden = false;
            maybeAutoSync();
            if (it.type === 'yt') playYtVersion(it, 0);
            else yt.playList(it.list).catch(function () { toast('No se pudo cargar el reproductor de YouTube'); });
            // si un mix no arranca, suena al menos la canción de la que sale
            if (it.seed) {
                mixTimer = setTimeout(function () {
                    if (cur.item === it && !isPlaying()) yt.playVideo(it.seed);
                }, 5000);
            }
        }
        updateNow();
        markActive();
    }

    /* Como en YouTube Music: «Canción» carga la pista oficial de audio (canal «- Topic»,
       portada fija) y «Vídeo» carga el videoclip. Si no existe la otra versión, suena la original. */
    var playToken = 0;
    function playYtVersion(it, start) {
        var token = ++playToken;
        var original = { id: it.id, title: it.title, sub: it.sub, thumb: it.thumb, topic: !!it.topic };
        function load(v) {
            if (token !== playToken || cur.item !== it) return;
            cur.playing = v;
            yt.playVideo(v.id, start).catch(function () { toast('No se pudo cargar el reproductor de YouTube'); });
            updateNow();
        }
        var wantSong = ytMode === 'audio';
        var canLookup = me && me.linked && !it.link;
        if (wantSong === original.topic || !canLookup) { load(original); return; }

        var key = wantSong ? '_song' : '_video';
        if (it[key] !== undefined) { load(it[key] || original); return; }
        $('pl-sub').textContent = wantSong ? 'Buscando la versión canción…' : 'Buscando el videoclip…';
        yt.version(it.id, wantSong ? 'song' : 'video', it.title, it.sub).then(function (v) {
            it[key] = v || null;
            if (!v && token === playToken) {
                toast(wantSong ? 'Esta canción no tiene versión solo audio en YouTube Music: se reproduce el vídeo en miniatura'
                               : 'No hay videoclip oficial de esta canción: sigue la versión canción', 4000);
            }
            load(v || original);
        }).catch(function () { load(original); });
    }

    /* Primera canción de su nube; si no tiene, abre la biblioteca (la demo nunca suena sola) */
    function playFirst() {
        if (mine.length) { playItem(mine, 0); return; }
        openLib(true);
        openTab(me && me.linked ? 'yt' : 'mine');
        toast(me && me.linked ? 'Elige algo de tu YouTube o sube canciones a tu nube'
                              : 'Sube canciones a tu nube, conecta Google o prueba la Demo', 5000);
    }

    function toggle() {
        var it = cur.item;
        if (!it) { if (!started) start(); else playFirst(); return; }
        audio.unlock();
        if (it.type === 'file') {
            if (audio.el.paused) audio.el.play().catch(function () { }); else audio.el.pause();
        } else if (it.type === 'synth') {
            if (audio.synthPlaying) audio.stopSynth(); else audio.playSynth(it.index);
        } else {
            if (isPlaying()) yt.pause(); else yt.resume();
        }
        setTimeout(refresh, 60);
    }

    function step(dir) {
        var it = cur.item;
        if (!it) return;
        if (it.type === 'ytlist') { if (dir > 0) yt.next(); else yt.prev(); return; }
        if (dir < 0 && it.type === 'file' && audio.el.currentTime > 3) { audio.el.currentTime = 0; return; }
        var n = cur.queue.length;
        playItem(cur.queue, (cur.index + dir + n) % n);
    }

    function start(silent) {
        if (started) return;
        started = true;
        audio.unlock();
        intro.classList.add('is-out');
        setTimeout(function () { intro.hidden = true; }, 700);
        dock.hidden = false;
        requestAnimationFrame(function () { dock.classList.add('is-in'); });
        // espera a que llegue la lista de su nube (si pulsó muy rápido)
        if (!silent) mineReady.then(function () { if (!cur.item) playFirst(); });
        // si el navegador sigue sin dejar sonar, avisa
        setTimeout(function () {
            if (audio.state === 'suspended' && cur.item && cur.item.type === 'synth') {
                toast('Tu navegador ha bloqueado el sonido: haz clic otra vez en la página', 6000);
            } else if (audio.state === 'none') {
                toast('La música suena, pero este navegador no permite el visualizador', 6000);
            }
        }, 1500);
    }

    /* Cualquier clic o tecla desbloquea el sonido (los navegadores exigen una interacción),
       pero no reproduce nada por su cuenta */
    function firstGesture() { audio.unlock(); }
    document.addEventListener('pointerdown', firstGesture, true);
    document.addEventListener('keydown', function (e) {
        if (e.target.closest && e.target.closest('input, textarea, select')) return;
        if (started) audio.unlock();
    }, true);

    /* eventos del <audio> */
    audio.on('ended', function () { if (cur.item && cur.item.type === 'file') step(1); });
    audio.on('play', refresh);
    audio.on('pause', refresh);
    audio.on('error', function () {
        if (!cur.item || cur.item.type !== 'file') return;
        fileErrors++;
        var code = audio.el.error ? audio.el.error.code : 0;
        var why = {
            2: 'se cortó la conexión con el servidor',
            3: 'el archivo está dañado o usa un códec no compatible',
            4: 'el servidor no lo ha entregado (¿sesión caducada?) o el formato no es compatible'
        }[code] || 'error desconocido';
        toast('No se pudo reproducir «' + cur.item.title + '»: ' + why, 7000);
        if (window.console) console.warn('[Pulso] error de audio', code, audio.el.src);
        // si fallan todas, se para (la demo nunca arranca sola)
        if (fileErrors >= cur.queue.length) { fileErrors = 0; refresh(); }
        else setTimeout(function () { step(1); }, 900);
    });

    audio.onRecover = function (why) {
        toast(why === 'fail'
            ? (audio.native ? 'El motor de audio del navegador está fallando: la música sigue, pero el visualizador puede no reaccionar'
                            : 'El dispositivo de audio está fallando: revisa los altavoces o auriculares y recarga la página')
            : 'Ha cambiado el dispositivo de audio: visualizador reiniciado', 6000);
        setTimeout(refresh, 100);
    };

    /* eventos de YouTube */
    function onYtState(s) {
        if (!isYt(cur.item)) return;
        if (s === YS.ENDED && cur.item.type === 'yt' && cur.queue.length > 1) step(1);
        if (s === YS.PLAYING && cur.item.type === 'ytlist') updateNow();
        refresh();
    }

    function onYtError(code) {
        var it = cur.item;
        if (it && it.seed && yt.mode === 'list') {      // el mix no se pudo cargar: canción semilla
            yt.playVideo(it.seed);
            return;
        }
        var msg = {
            2: 'Enlace de YouTube no válido',
            5: 'Este vídeo no se puede reproducir aquí',
            100: 'El vídeo no existe o es privado',
            101: 'El autor no permite reproducir este vídeo fuera de YouTube',
            150: 'El autor no permite reproducir este vídeo fuera de YouTube'
        }[code] || 'Error de YouTube (' + code + ')';
        toast(msg + (cur.queue && cur.queue.length > 1 ? ' · saltando…' : ''));
        if (it && it.type === 'yt' && cur.queue.length > 1) setTimeout(function () { step(1); }, 1500);
    }

    /* ---------- Interfaz del dock ---------- */
    function updateNow() {
        var it = cur.item;
        if (!it) return;
        var title = it.title, sub = it.sub, thumb = it.thumb;
        if (it.type === 'yt' && !cur.playing) sub = 'Cargando…';
        if (it.type === 'yt' && cur.playing) {
            thumb = cur.playing.thumb || thumb;
            sub = sub + (cur.playing.topic ? ' · Canción' : ' · Vídeo');
        }
        if (it.type === 'ytlist') {
            var vd = yt.videoData;
            if (vd && vd.title) {
                title = vd.title;
                sub = (vd.author || 'YouTube') + (it.seed ? ' · ' + it.title : '');
                thumb = vd.video_id ? 'https://i.ytimg.com/vi/' + vd.video_id + '/mqdefault.jpg' : thumb;
            }
        }
        $('pl-title').textContent = title;
        $('pl-sub').textContent = sub;
        var cover = $('pl-cover');
        cover.textContent = '';
        if (thumb) {
            var img = new Image(); img.src = thumb; img.alt = '';
            cover.appendChild(img);
        } else {
            var ic = document.createElement('i');
            ic.className = it.type === 'synth' ? 'fa-solid fa-wand-magic-sparkles' : 'fa-solid fa-music';
            cover.appendChild(ic);
        }
        if ('mediaSession' in navigator && !isYt(it)) {
            try { navigator.mediaSession.metadata = new MediaMetadata({ title: title, artist: sub, album: 'Pulso' }); } catch (e) { }
        }
    }

    var dragging = false;
    function refresh() {
        var it = cur.item, playing = isPlaying();
        playBtn.innerHTML = playing ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
        playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
        root.classList.toggle('is-playing', playing);

        var t = 0, d = 0, live = false;
        if (it && it.type === 'file') { t = audio.el.currentTime; d = audio.el.duration || 0; }
        else if (it && it.type === 'synth') { t = audio.synthElapsed; live = true; }
        else if (isYt(it)) { t = yt.time; d = yt.duration; }
        $('pl-time').textContent = fmt(t);
        $('pl-dur').textContent = live ? '∞' : fmt(d);
        seek.disabled = live || !d;
        if (!dragging) seek.value = d ? Math.round(t / d * 1000) : 0;
        seek.style.setProperty('--v', (seek.value / 10) + '%');

        // sin audio real no hay visualizador (no se inventa ningún ritmo)
        var mode, label;
        if (!playing) { mode = 'idle'; label = 'En pausa'; }
        else if (audio.capturing) { mode = 'live'; label = 'Audio real · pestaña'; }
        else if (isYt(it)) { mode = 'off'; label = 'Visualizador apagado'; }
        else if (audio.state !== 'running') { mode = 'off'; label = 'Sin visualizador'; }
        else { mode = 'live'; label = 'Audio real'; }
        if (mode === 'off' && isYt(it)) label = audio.canCapture ? 'Activar audio real' : 'Sin visualizador';
        chipText.textContent = label;
        chip.className = 'pl-chip is-' + mode;
        chip.disabled = mode !== 'off' || !isYt(it) || !audio.canCapture;
        chip.title = mode === 'off'
            ? 'YouTube no deja leer su audio: pulsa para que el visualizador lo escuche'
            : label;
    }
    setInterval(refresh, 250);

    seek.addEventListener('input', function () {
        dragging = true;
        seek.style.setProperty('--v', (seek.value / 10) + '%');
    });
    seek.addEventListener('change', function () {
        dragging = false;
        var it = cur.item, f = seek.value / 1000;
        if (it && it.type === 'file' && audio.el.duration) audio.el.currentTime = f * audio.el.duration;
        else if (isYt(it) && yt.duration) yt.seek(f * yt.duration);
    });

    playBtn.addEventListener('click', toggle);
    $('pl-next').addEventListener('click', function () { step(1); });
    $('pl-prev').addEventListener('click', function () { step(-1); });

    var savedVol = 80;
    try { savedVol = Number(localStorage.getItem('pl-vol') || 80); } catch (e) { }
    if (!(savedVol >= 5)) savedVol = 80;            // nunca empezar en silencio
    vol.value = savedVol;
    function applyVol() {
        var v = Number(vol.value);
        audio.setVolume(v / 100);
        yt.setVolume(v);
        vol.style.setProperty('--v', v + '%');
        try { localStorage.setItem('pl-vol', v); } catch (e) { }
    }
    vol.addEventListener('input', applyVol);
    applyVol();

    chip.addEventListener('click', function () {
        if (chip.classList.contains('is-off')) startSync();
    });

    /* ---------- Visualizador encendido / apagado ---------- */
    function setViz(on, silent) {
        visual.setFigure(on);
        vizBtn.setAttribute('aria-pressed', String(on));
        vizBtn.title = on ? 'Visualizador activado (V)' : 'Visualizador desactivado (V)';
        setPref('viz', on ? '1' : '0');
        if (!silent) toast(on ? 'Visualizador activado' : 'Visualizador desactivado: solo queda la animación del fondo', 2400);
    }
    vizBtn.addEventListener('click', function () { setViz(!visual.figure); });
    if (pref('viz', '1') === '0') setViz(false, true);

    /* ---------- YouTube: solo canción o con vídeo ---------- */
    /* Vídeo ampliado: ocupa todo el hueco libre (bajo el menú, sobre los controles,
       respetando la biblioteca si está abierta) */
    var expandBtn = $('pl-yt-expand');
    function setTheater(on) {
        on = !!on && ytMode === 'video';
        ytBox.classList.toggle('is-theater', on);
        root.classList.toggle('yt-theater', on);
        expandBtn.setAttribute('aria-pressed', String(on));
        expandBtn.innerHTML = on ? '<i class="fa-solid fa-compress"></i>' : '<i class="fa-solid fa-expand"></i>';
        expandBtn.title = on ? 'Reducir el vídeo (T)' : 'Ampliar el vídeo (T)';
    }
    expandBtn.addEventListener('click', function () { setTheater(!ytBox.classList.contains('is-theater')); });

    function setYtMode(mode, silent) {
        ytMode = mode === 'video' ? 'video' : 'audio';
        ytBox.setAttribute('data-mode', ytMode);
        if (ytMode === 'audio') setTheater(false);
        syncRing();
        root.querySelectorAll('[data-ytmode]').forEach(function (b) {
            b.setAttribute('aria-checked', String(b.getAttribute('data-ytmode') === ytMode));
        });
        setPref('ytmode', ytMode);
        if (silent) return;
        var it = cur.item;
        if (it && it.type === 'yt' && cur.playing) {
            var wantSong = ytMode === 'audio';
            if (wantSong !== !!cur.playing.topic) playYtVersion(it, yt.time);
        } else if (it && it.type === 'ytlist') {
            toast('En mixes y listas solo cambia el tamaño del reproductor', 3000);
            return;
        }
        toast(ytMode === 'video' ? 'Modo vídeo' : 'Modo canción', 1800);
    }
    root.querySelectorAll('[data-ytmode]').forEach(function (b) {
        b.addEventListener('click', function () { setYtMode(b.getAttribute('data-ytmode')); });
    });
    setYtMode(ytMode, true);

    var autoBox = $('pl-autosync');
    autoBox.checked = autoSync;
    autoBox.addEventListener('change', function () {
        autoSync = autoBox.checked;
        setPref('autosync', autoSync ? '1' : '0');
        if (autoSync) syncDeclined = false;
    });

    $('pl-start').addEventListener('click', function () { start(); });

    if (window.ResizeObserver) {
        new ResizeObserver(function () {
            if (dock.offsetHeight) root.style.setProperty('--dock-h', dock.offsetHeight + 'px');
        }).observe(dock);
    }

    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.setActionHandler('play', toggle);
            navigator.mediaSession.setActionHandler('pause', toggle);
            navigator.mediaSession.setActionHandler('nexttrack', function () { step(1); });
            navigator.mediaSession.setActionHandler('previoustrack', function () { step(-1); });
        } catch (e) { }
    }

    /* ---------- Biblioteca ---------- */
    function openLib(open) {
        if (open === undefined) open = lib.hidden;
        lib.hidden = !open;
        libBtn.setAttribute('aria-expanded', String(open));
        root.classList.toggle('lib-open', open);
    }
    libBtn.addEventListener('click', function () { openLib(); });

    function openTab(name) {
        lib.querySelectorAll('[role="tab"]').forEach(function (b) {
            b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === name));
        });
        lib.querySelectorAll('.pl-pane').forEach(function (p) {
            p.hidden = p.getAttribute('data-pane') !== name;
        });
    }
    lib.querySelectorAll('[role="tab"]').forEach(function (b) {
        b.addEventListener('click', function () { openTab(b.getAttribute('data-tab')); });
    });

    /* lista con título de sección opcional; cada sección es su propia cola */
    function renderList(ul, items, opts) {
        if (!opts.append) ul.textContent = '';
        if (opts.header) {
            var h = document.createElement('li');
            h.className = 'pl-head';
            var hs = document.createElement('span'); hs.textContent = opts.header;
            h.appendChild(hs);
            if (opts.note) { var hn = document.createElement('small'); hn.textContent = opts.note; h.appendChild(hn); }
            ul.appendChild(h);
        }
        if (!items.length) {
            var e = document.createElement('li');
            e.className = 'pl-empty';
            e.textContent = opts.empty || 'Nada por aquí';
            ul.appendChild(e);
            return;
        }
        items.forEach(function (it, i) {
            var li = document.createElement('li');
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'pl-item' + (it.type === 'ytlist' ? ' is-mix' : '');
            b._item = it;

            var th = document.createElement('span');
            th.className = 'pl-thumb';
            if (it.thumb) {
                var img = new Image(); img.src = it.thumb; img.alt = ''; img.loading = 'lazy';
                th.appendChild(img);
            } else {
                var ic = document.createElement('i');
                ic.className = opts.icon || 'fa-solid fa-music';
                th.appendChild(ic);
            }
            var tx = document.createElement('span');
            tx.className = 'pl-txt';
            var st = document.createElement('strong'); st.textContent = it.title;
            var sm = document.createElement('small'); sm.textContent = it.sub || '';
            tx.appendChild(st); tx.appendChild(sm);
            var eq = document.createElement('span');
            eq.className = 'pl-eqi';
            eq.innerHTML = it.type === 'pl' ? '<i class="fa-solid fa-chevron-right"></i>' : '<i></i><i></i><i></i>';

            b.appendChild(th); b.appendChild(tx); b.appendChild(eq);
            b.addEventListener('click', function () { opts.onPick(items, i); });
            li.appendChild(b);
            if (opts.onDelete) {
                var del = document.createElement('button');
                del.type = 'button';
                del.className = 'pl-del';
                del.title = 'Borrar de tu nube';
                del.setAttribute('aria-label', 'Borrar «' + it.title + '» de tu nube');
                del.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                del.addEventListener('click', function () { opts.onDelete(it); });
                li.className = 'has-del';
                li.appendChild(del);
            }
            ul.appendChild(li);
        });
        markActive();
    }

    function markActive() {
        root.querySelectorAll('.pl-item').forEach(function (b) {
            b.classList.toggle('is-on', same(b._item, cur.item));
        });
    }

    function renderMine() {
        renderList($('pl-list-mine'), mine, {
            empty: 'Tu nube aún no tiene canciones. Súbelas aquí abajo.',
            onPick: playItem,
            onDelete: deleteTrack
        });
    }

    /* ---------- Mi música: la nube del usuario ---------- */
    function fmtSize(b) {
        if (b >= 1024 * 1024 * 1024) return (b / 1024 / 1024 / 1024).toFixed(2).replace('.', ',') + ' GB';
        return Math.max(0, b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
    }
    function showUsage(u) {
        if (!u) return;
        var pct = u.quota ? Math.min(100, u.used / u.quota * 100) : 100;
        $('pl-usage-text').textContent = u.quota
            ? fmtSize(u.used) + ' de ' + fmtSize(u.quota)
            : 'Sin espacio asignado';
        $('pl-usage-fill').style.width = pct + '%';
        $('pl-usage').classList.toggle('is-full', pct >= 95);
    }
    function apiJSON(r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.status === 401 && j.error === 'login') { location.href = '/login'; throw new Error('login'); }
            if (!r.ok) { var e = new Error(j.message || (j.errors && j.errors.join(' ')) || j.error || 'HTTP ' + r.status); e.data = j; throw e; }
            return j;
        });
    }
    function trackItem(t) {
        return {
            type: 'file', title: t.title, path: t.path,
            url: API + 'music/file?path=' + encodeURIComponent(t.path),
            sub: (t.folder || 'Mi nube') + ' · ' + fmtSize(t.size)
        };
    }
    function loadMine() {
        return fetch(API + 'music', { credentials: 'same-origin' }).then(apiJSON).then(function (j) {
            var playingPath = cur.item && cur.item.type === 'file' ? cur.item.path : null;
            mine = j.tracks.map(trackItem);
            if (playingPath && cur.queue !== demos) {
                // mantiene la cola apuntando a la lista nueva
                for (var i = 0; i < mine.length; i++) if (mine[i].path === playingPath) { cur.queue = mine; cur.index = i; cur.item = mine[i]; }
            }
            renderMine();
            showUsage(j.usage);
        }).catch(function (e) { if (e.message !== 'login') toast('No se pudo cargar tu música'); });
    }

    function deleteTrack(it) {
        if (!confirm('¿Borrar «' + it.title + '» de tu nube?')) return;
        fetch(API + 'music?path=' + encodeURIComponent(it.path), { method: 'DELETE', credentials: 'same-origin' })
            .then(apiJSON).then(function (j) {
                if (cur.item && cur.item.type === 'file' && cur.item.path === it.path) { audio.pauseFile(); }
                toast('«' + it.title + '» borrada de tu nube');
                showUsage(j.usage);
                loadMine();
            }).catch(function (e) { if (e.message !== 'login') toast('No se pudo borrar'); });
    }
    var mineReady = loadMine();
    renderList($('pl-list-demo'), demos, { icon: 'fa-solid fa-wand-magic-sparkles', onPick: playItem });

    /* subir canciones a la nube del usuario (con barra de progreso) */
    var AUDIO_RE = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|webm)$/i;
    var dropText = $('pl-drop-text'), dropHTML = dropText.innerHTML, uploading = false;
    function addFiles(files) {
        var list = Array.prototype.filter.call(files || [], function (f) { return AUDIO_RE.test(f.name); });
        if (!list.length) { toast('Eso no parece un archivo de audio (mp3, m4a, ogg, opus, wav, flac…)'); return; }
        if (uploading) { toast('Espera a que termine la subida actual'); return; }
        var fd = new FormData();
        list.forEach(function (f) { fd.append('files', f, f.name); });
        openLib(true); openTab('mine');
        uploading = true;
        $('pl-drop').classList.add('is-busy');

        var xhr = new XMLHttpRequest();
        xhr.open('POST', API + 'music');
        xhr.upload.onprogress = function (e) {
            if (e.lengthComputable) dropText.textContent = 'Subiendo a tu nube… ' + Math.round(e.loaded / e.total * 100) + ' %';
        };
        xhr.onloadend = function () {
            uploading = false;
            $('pl-drop').classList.remove('is-busy');
            dropText.innerHTML = dropHTML;
            var j = {};
            try { j = JSON.parse(xhr.responseText); } catch (e) { }
            if (xhr.status === 401) { location.href = '/login'; return; }
            if (xhr.status === 413) { toast('El archivo es demasiado grande para el servidor', 6000); return; }
            if (j.usage) showUsage(j.usage);
            var msg = [];
            if (j.saved && j.saved.length) msg.push(j.saved.length === 1 ? 'Canción guardada en tu nube' : j.saved.length + ' canciones guardadas en tu nube');
            if (j.errors && j.errors.length) msg.push(j.errors.join(' '));
            if (!msg.length) msg.push('No se pudo subir');
            toast(msg.join(' · '), j.errors && j.errors.length ? 8000 : 3500);
            loadMine();
        };
        xhr.send(fd);
    }
    $('pl-file').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });

    var dragDepth = 0;
    root.addEventListener('dragenter', function (e) {
        if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) {
            dragDepth++; root.classList.add('is-dragging');
        }
    });
    root.addEventListener('dragleave', function () {
        if (--dragDepth <= 0) { dragDepth = 0; root.classList.remove('is-dragging'); }
    });
    root.addEventListener('dragover', function (e) { e.preventDefault(); });
    root.addEventListener('drop', function (e) {
        e.preventDefault();
        dragDepth = 0; root.classList.remove('is-dragging');
        if (e.dataTransfer) addFiles(e.dataTransfer.files);
    });

    /* ============================================================
       YOUTUBE / YOUTUBE MUSIC
       ============================================================ */
    var ytList = $('pl-list-yt'), crumb = $('pl-yt-crumb'), section = 'search';

    var ERRORS = {
        popup_closed: 'Has cerrado la ventana de Google',
        access_denied: 'Has cancelado el permiso de Google',
        scope: 'Para enlazar tu YouTube hay que marcar el permiso de YouTube',
        state: 'La sesión de inicio caducó, vuelve a intentarlo',
        noconfig: 'Google aún no está configurado en el servidor (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET)',
        nolink: 'Tu cuenta de Google ya no está conectada',
        revoked: 'Quitaste el permiso desde tu cuenta de Google: vuelve a iniciar sesión',
        quotaExceeded: 'Se ha agotado la cuota diaria de la API de YouTube; prueba mañana',
        accessNotConfigured: 'Falta activar «YouTube Data API v3» en Google Cloud',
        youtubeSignupRequired: 'Tu cuenta de Google no tiene canal de YouTube'
    };
    function errText(e) {
        var k = (e && (e.reason || e.message)) || '';
        return ERRORS[k] || ('YouTube: ' + (k || 'error desconocido'));
    }
    function ytErr(e) {
        if (e && e.reason === 'login') { location.href = '/login'; return; }
        toast(errText(e), 5500);
        if (e && e.status === 401) { me = null; showUser(); }
    }

    /* Dónde aparece el botón de Google o la cuenta conectada */
    function showUser() {
        var linked = !!(me && me.linked);
        $('pl-yt-noconf').hidden = googleReady;
        $('pl-yt-out').hidden = linked;
        $('pl-yt-in').hidden = !linked;

        var mini = $('pl-gmini'), av = $('pl-avatar'), il = $('pl-intro-linked');
        mini.hidden = linked;
        av.hidden = !linked;
        il.hidden = !linked;
        root.querySelectorAll('.pl-intro [data-google-login]').forEach(function (a) { a.hidden = linked; });

        // la demo solo está mientras no se ha conectado Google
        var demoTab = lib.querySelector('[data-tab="demo"]');
        demoTab.hidden = linked;
        lib.querySelector('.pl-tabs').classList.toggle('is-two', linked);
        if (linked && demoTab.getAttribute('aria-selected') === 'true') openTab('yt');
        if (linked && cur.item && cur.item.type === 'synth') { audio.stopSynth(); toast('Demo cerrada: ya tienes tu YouTube conectado'); }

        if (linked) {
            $('pl-yt-name').textContent = me.name || 'Tu cuenta';
            $('pl-yt-channel').textContent = me.channel ? 'YouTube: ' + me.channel : (me.email || '');
            setImg($('pl-yt-avatar'), me.picture);
            setImg(av.querySelector('img'), me.picture);
            setImg(il.querySelector('img'), me.picture);
            il.querySelector('span').textContent = 'Conectado como ' + (me.name || me.email);
            av.title = 'Tu YouTube · ' + (me.name || '');
        } else {
            ytList.textContent = '';
            setCrumb('');
        }
    }
    function setImg(img, src) {
        if (src) { img.src = src; img.hidden = false; } else img.hidden = true;
    }

    function loadMe(openAfter) {
        return yt.me().then(function (data) {
            me = data;
            if (data.configured === false) googleReady = false;
            showUser();
            if (me.linked) {
                showSection(section);
                if (openAfter) { openLib(true); openTab('yt'); }
            }
        }).catch(function (e) { me = null; showUser(); if (e.status !== 401) ytErr(e); });
    }

    function login() {
        if (!googleReady) { toast(ERRORS.noconfig, 6000); openLib(true); openTab('yt'); return; }
        yt.login().then(function () {
            toast('¡YouTube conectado! Ya puedes buscar canciones y abrir tus listas');
            loadMe(true);
        }).catch(function (e) {
            if (e && (e.message === 'superseded' || e.message === 'timeout')) return;
            toast(errText(e), 5000);
        });
    }
    root.querySelectorAll('[data-google-login]').forEach(function (a) {
        a.addEventListener('click', function (e) { e.preventDefault(); login(); });
    });
    [$('pl-avatar'), $('pl-intro-linked')].forEach(function (b) {
        b.addEventListener('click', function () { openLib(true); openTab('yt'); });
    });

    $('pl-glogout').addEventListener('click', function () {
        yt.logout().then(function () {
            me = { linked: false };
            showUser();
            toast('Has cerrado la sesión de Google en esta web');
        });
    });

    function setCrumb(text, back) {
        crumb.textContent = '';
        crumb.hidden = !text;
        if (!text) return;
        if (back) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'pl-link';
            b.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Listas';
            b.addEventListener('click', function () { showSection('playlists'); });
            crumb.appendChild(b);
            crumb.appendChild(document.createTextNode(' · '));
        }
        crumb.appendChild(document.createTextNode(text));
    }

    function loading() {
        ytList.innerHTML = '<li class="pl-empty"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando…</li>';
    }
    var reqId = 0;
    function load(promise, render) {
        var id = ++reqId;
        loading();
        promise.then(function (data) { if (id === reqId) render(data); })
            .catch(function (e) { if (id === reqId) { ytList.textContent = ''; ytErr(e); } });
    }

    var VIDEO_OPTS = { icon: 'fa-brands fa-youtube', onPick: playItem };

    function showSection(name) {
        section = name;
        lib.querySelectorAll('[data-yt]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(b.getAttribute('data-yt') === name));
        });
        $('pl-yt-search').hidden = name !== 'search';

        if (name === 'playlists') {
            setCrumb('');
            load(yt.playlists(), function (lists) {
                renderList(ytList, lists, {
                    header: 'Tus listas', note: 'Incluye las que creaste en YouTube Music',
                    icon: 'fa-solid fa-list', empty: 'No tienes listas de reproducción',
                    onPick: function (arr, i) { openPlaylist(arr[i]); }
                });
            });
        } else if (name === 'search') {
            setCrumb('');
            ytList.innerHTML = '<li class="pl-empty"><i class="fa-solid fa-magnifying-glass"></i> Busca una canción o un artista</li>';
            if (!lib.hidden) $('pl-yt-search').q.focus({ preventScroll: true });
        }
    }

    function openPlaylist(pl) {
        setCrumb(pl.title, true);
        load(yt.playlistItems(pl.id), function (items) {
            renderList(ytList, items, Object.assign({ empty: 'Esta lista no tiene canciones que se puedan reproducir aquí' }, VIDEO_OPTS));
        });
    }

    lib.querySelectorAll('[data-yt]').forEach(function (b) {
        b.addEventListener('click', function () { showSection(b.getAttribute('data-yt')); });
    });
    $('pl-yt-search').addEventListener('submit', function (e) {
        e.preventDefault();
        var q = e.target.q.value.trim();
        if (!q) return;
        setCrumb('Resultados de «' + q + '»');
        load(yt.search(q), function (items) {
            renderList(ytList, items, Object.assign({ empty: 'Sin resultados' }, VIDEO_OPTS));
        });
    });
    $('pl-yt-url').addEventListener('submit', function (e) {
        e.preventDefault();
        var r = P.parseYouTube(e.target.url.value);
        if (!r) { toast('Ese enlace no parece de YouTube'); return; }
        e.target.url.value = '';
        if (r.video) playItem([{ type: 'yt', link: true, id: r.video, title: 'Vídeo de YouTube', sub: 'Enlace', thumb: 'https://i.ytimg.com/vi/' + r.video + '/mqdefault.jpg' }], 0);
        else playItem([{ type: 'ytlist', id: r.list, list: r.list, title: 'Lista de YouTube', sub: 'Enlace' }], 0);
    });

    // al empezar un vídeo pegado por enlace, usa su título real
    setInterval(function () {
        var it = cur.item;
        if (it && it.type === 'yt' && it.sub === 'Enlace' && yt.state === YS.PLAYING) {
            var vd = yt.videoData;
            if (vd && vd.title) { it.title = vd.title; it.sub = vd.author || 'YouTube'; updateNow(); }
        }
    }, 1000);

    /* Al cargar: si el navegador (o tu usuario de la web) ya está enlazado, se conecta solo */
    showUser();
    (function () {
        var params = new URLSearchParams(location.search);
        var res = params.get('google');
        var wantsYt = location.hash === '#youtube';
        if (res || wantsYt) history.replaceState(null, '', location.pathname);
        if (res === 'ok') toast('¡YouTube conectado! Haz clic en la página para que suene');
        else if (res) toast(errText({ reason: res }), 6000);
        if (googleReady) loadMe(res === 'ok' || wantsYt);
        else if (wantsYt) { openLib(true); openTab('yt'); }
    })();

    /* ---------- Sincronizar con el audio real de la pestaña ---------- */
    function syncLabel(on) {
        syncBtn.querySelector('span').textContent = on ? 'Desactivar el audio real' : 'Activar el audio real';
        syncBtn.classList.toggle('is-on', on);
    }
    audio.onCaptureChange = function (on) {
        syncLabel(on);
        if (!on && isYt(cur.item)) toast('Audio real detenido: el visualizador se apaga con YouTube');
        refresh();
    };
    /* YouTube no deja leer su audio: la única forma de escucharlo en tiempo real
       es que el navegador comparta el audio de esta pestaña con la página. */
    function startSync() {
        if (audio.capturing) return;
        if (!audio.canCapture) {
            toast('Tu navegador no permite escuchar el audio de YouTube en tiempo real. Prueba con Chrome o Edge en el ordenador.', 6500);
            return;
        }
        toast('Elige «Esta pestaña» y deja marcado «Compartir también el audio»', 6000);
        audio.captureTab().then(function () {
            syncDeclined = false;
            toast('¡Audio real activado! El fondo reacciona a la canción en tiempo real');
        }).catch(function (e) {
            if (e && e.message === 'noaudio') toast('No se compartió el audio. Pulsa «Audio real» y marca «Compartir también el audio de la pestaña».', 7000);
            else if (e && e.name === 'NotAllowedError') {
                syncDeclined = true;
                toast('Sin audio real no hay visualizador con YouTube. Actívalo cuando quieras con «Audio real».', 6000);
            }
            else toast('No se pudo capturar el audio de la pestaña', 5000);
        });
    }
    function maybeAutoSync() {
        var active = !navigator.userActivation || navigator.userActivation.isActive;
        if (autoSync && !syncDeclined && !audio.capturing && audio.canCapture && active) startSync();
    }
    syncBtn.addEventListener('click', function () {
        if (audio.capturing) audio.stopCapture(); else startSync();
    });
    window.addEventListener('pagehide', function () { audio.stopCapture(); });

    /* ---------- Ratón: ondas al hacer clic ---------- */
    root.addEventListener('pointerdown', function (e) {
        if (e.button > 0) return;
        if (e.target.closest('button, a, input, label, form, .pl-dock, .pl-lib, .pl-yt-box')) return;
        var r = root.getBoundingClientRect();
        visual.ripple((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    });

    /* ---------- Teclado, modo zen y pantalla completa ---------- */
    /* ---------- Ocultar la interfaz (H) ----------
       El reproductor de YouTube se agranda y se centra; en modo canción la portada
       queda dentro del anillo. Abajo aparece una flecha para volver. */
    var zenHint = $('pl-zen-hint'), zenUp = $('pl-zen-up'), zenHintTimer = 0, zenUpTimer = 0;
    function zen(on) {
        if (on === undefined) on = !root.classList.contains('pl-zen');
        root.classList.toggle('pl-zen', on);
        document.body.classList.toggle('pl-zen-on', on);
        clearTimeout(zenHintTimer);
        zenHint.classList.toggle('is-on', on);
        if (on) zenHintTimer = setTimeout(function () { zenHint.classList.remove('is-on'); }, 4000);
        zenUp.classList.remove('is-on');
        syncRing();
    }
    function showZenUp(ms) {
        zenUp.classList.add('is-on');
        clearTimeout(zenUpTimer);
        if (ms) zenUpTimer = setTimeout(function () { zenUp.classList.remove('is-on'); }, ms);
    }
    window.addEventListener('pointermove', function (e) {
        if (!root.classList.contains('pl-zen') || e.pointerType === 'touch') return;
        var r = root.getBoundingClientRect();
        if (e.clientY > r.bottom - 140 && e.clientY <= r.bottom) showZenUp(0);
        else if (!zenUp.matches(':hover')) { zenUp.classList.remove('is-on'); }
    }, { passive: true });
    root.addEventListener('pointerdown', function (e) {
        if (root.classList.contains('pl-zen') && e.pointerType === 'touch') showZenUp(3000);
    });
    zenUp.addEventListener('click', function () { zen(false); });

    /* el anillo se abre para rodear la portada cuando está en el centro */
    function syncRing() {
        var px = 0;
        if (root.classList.contains('pl-zen') && ytMode === 'audio' && !ytBox.hidden) px = ytBox.offsetWidth;
        visual.setRingMinPx(px);
    }
    window.addEventListener('resize', syncRing);
    $('pl-hide').addEventListener('click', function () { zen(true); });

    function fullscreen() {
        var d = document;
        if (d.fullscreenElement || d.webkitFullscreenElement) {
            (d.exitFullscreen || d.webkitExitFullscreen).call(d);
        } else {
            var fn = root.requestFullscreen || root.webkitRequestFullscreen;
            if (fn) fn.call(root);
        }
    }

    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
        var k = e.key.toLowerCase();
        if (e.code === 'Space') {
            if (e.target.closest && e.target.closest('button, a')) return;
            e.preventDefault();
            if (started) toggle(); else start();
        } else if (k === 'h') zen();
        else if (k === 'v') setViz(!visual.figure);
        else if (k === 'f') fullscreen();
        else if (k === 'escape' && root.classList.contains('pl-zen')) zen(false);
        else if (k === 'escape' && ytBox.classList.contains('is-theater')) setTheater(false);
        else if (k === 't' && !ytBox.hidden) {
            if (ytMode !== 'video') setYtMode('video');
            setTheater(!ytBox.classList.contains('is-theater'));
        }
        else if (started && k === 'arrowright' && e.shiftKey) step(1);
        else if (started && k === 'arrowleft' && e.shiftKey) step(-1);
    });
})();
