/* ============================================================
   EASTER EGG «BOMBA» DE LA PÁGINA DE INFO
   No arranca sola: cv.js la lanza (hfIntro.start) cuando se hacen
   girar muy rápido las órbitas de tecnologías. Se puede repetir.
   Inspirada en la pieza de Major Lazer de Because Recollection.

   1. Mi foto en blanco y negro, con paralaje (sigue al ratón y respira),
      y unas gafas de sol encima. Todo es blanco y negro salvo los
      cristales: reflejan, en color, la misma escena que viene después.
   2. Mantén pulsada la H (o el dedo / el ratón): suena la canción, la
      cámara entra por la lente derecha y sobre el horizonte crece una
      bola de fuego. Si sueltas antes de tiempo, imagen y canción se
      rebobinan.
   3. En el drop, la bomba explota. Esa parte es un vídeo renderizado
      (con desenfoque de movimiento y brillo); si el vídeo no ha cargado,
      se dibuja en directo con el mismo código.
   4. Una onda expansiva lo deja todo en blanco; el blanco se apaga,
      aparecen el nombre y el texto en el centro y vuelan a su sitio
      mientras la página aparece con un fundido.
   «Saltar animación» (o Esc) la quita en cualquier momento.
   ============================================================ */
(function () {
    var html = document.documentElement;
    var intro = document.getElementById('cv-intro');
    var root = document.querySelector('.cv');
    var RENDER = !!window.__CI_RENDER__;             // solo para generar el vídeo
    if (!intro) return;

    /* ---------- Línea de tiempo: segundos del mp3, a compás ---------- */
    var BPM = parseFloat(intro.getAttribute('data-bpm')) || 154;
    var BEAT = 60 / BPM, BAR = BEAT * 4;
    var DET = parseFloat(intro.getAttribute('data-drop')) || BAR * 3;   // el drop: hay que mantener pulsado hasta aquí
    var ZOOM = BAR * 1.5;              // entrar en la lente (compás y medio)
    var SHOCK = DET + BAR * 2;         // sale la onda expansiva
    var SHOCK_DUR = BEAT * 2;          // tarda esto en cubrirlo todo de blanco
    var WHITE = SHOCK + SHOCK_DUR;
    var NAME = DET + BAR * 3;          // aparecen nombre y texto en el centro
    var FLY = NAME + BAR;              // vuelan a su sitio y aparece la página
    var FLY_DUR = BEAT * 3;
    var END = FLY + FLY_DUR + 0.1;
    var REWIND = 1.8;                  // velocidad del rebobinado al soltar

    var world = intro.querySelector('.ci-world');
    var canvas = intro.querySelector('.ci-scene');
    var ctx = canvas.getContext('2d');
    var video = intro.querySelector('.ci-video');
    var photoCv = intro.querySelector('.ci-photo');
    var glassCv = intro.querySelector('.ci-glass');
    var gctx = glassCv ? glassCv.getContext('2d') : null;
    var flash = intro.querySelector('.ci-flash');
    var bgEl = intro.querySelector('.ci-bg');
    var skipBtn = intro.querySelector('.ci-skip');
    var soundBtn = intro.querySelector('.ci-sound');

    var state = 'idle';                // idle → boom → out
    var T = 0;
    var keyHeld = false, ptrHeld = false, wasHolding = false;
    var raf = 0, last = performance.now(), timers = [];
    var W = 0, H = 0, DPR = 1, U = 1, cx = 0, y0 = 0;
    var MX = 0, MY = 0;                // margen extra de la escena (para que llene los cristales)
    var L0 = 0, L1 = 0, T0 = 0, B1 = 0;  // límites de la escena con el margen
    var debris = [];
    var flags = {};
    var fly = null;
    var useVideo = false;

    /* ---------- Utilidades ---------- */
    function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function easeOut(v) { v = clamp(v); return 1 - Math.pow(1 - v, 3); }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function mix(a, b, k) { return a + (b - a) * k; }

    /* ============================================================
       MÚSICA: el mp3 se descodifica una vez; al mantener pulsado
       suena hacia delante y al soltar se reproduce al revés y más
       rápido (el rebobinado).
       ============================================================ */
    var AC = window.AudioContext || window.webkitAudioContext;
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var ac = null, master = null, musicGain = null, rewBus = null;
    var song = { buf: null, rev: null, src: null, dir: 0, startAt: 0 };
    var soundOn = true;
    try { soundOn = localStorage.getItem('cvIntroSound') !== 'off'; } catch (e) { }

    function paintSound() {
        if (!soundBtn) return;
        soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
        soundBtn.setAttribute('aria-label', soundOn ? 'Silenciar sonido' : 'Activar sonido');
        soundBtn.querySelector('i').className = 'fa-solid ' + (soundOn ? 'fa-volume-high' : 'fa-volume-xmark');
        if (master) master.gain.setTargetAtTime(soundOn ? 1 : 0, ac.currentTime, 0.05);
    }

    function newBuffer(c, l, r) {
        try { return new AudioBuffer({ numberOfChannels: c, length: l, sampleRate: r }); }
        catch (e) { return (ac || new OAC(c, l, r)).createBuffer(c, l, r); }
    }
    function reversed(buf) {
        var r = newBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
        for (var c = 0; c < buf.numberOfChannels; c++) {
            var s = buf.getChannelData(c), d = r.getChannelData(c), L = s.length;
            for (var q = 0; q < L; q++) d[q] = s[L - 1 - q];
        }
        return r;
    }
    function loadSong() {
        var url = intro.getAttribute('data-song');
        if (!url || !OAC || !window.fetch) return;
        fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (ab) {
            var dc = new OAC(2, 44100, 44100);
            return new Promise(function (ok, ko) { var p = dc.decodeAudioData(ab, ok, ko); if (p && p.then) p.then(ok, ko); });
        }).then(function (b) {
            song.buf = b; song.rev = reversed(b);
            if (wasHolding && state === 'idle') playFwd(T);
        }).catch(function () { });
    }

    function audioInit() {                 // solo tras un gesto del usuario
        if (!AC) return;
        if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
        try { ac = new AC(); } catch (e) { return; }
        master = ac.createGain(); master.gain.value = soundOn ? 1 : 0;
        master.connect(ac.destination);
        musicGain = ac.createGain(); musicGain.connect(master);
        // el rebobinado suena algo más fino y lejano, como una cinta
        rewBus = ac.createBiquadFilter(); rewBus.type = 'highpass'; rewBus.frequency.value = 160;
        var rg = ac.createGain(); rg.gain.value = 0.85;
        rewBus.connect(rg); rg.connect(musicGain);
    }
    function stopSrc() {
        if (song.src) { try { song.src.stop(); } catch (e) { } song.src.disconnect(); song.src = null; }
        song.dir = 0;
    }
    function playFwd(t) {
        stopSrc();
        if (!ac || !song.buf) return;
        var s = ac.createBufferSource(); s.buffer = song.buf; s.connect(musicGain);
        s.start(0, Math.max(0, t));
        song.src = s; song.dir = 1; song.startAt = ac.currentTime - t;
    }
    function playRev(t) {
        stopSrc();
        if (!ac || !song.rev || t <= 0.02) return;
        var s = ac.createBufferSource(); s.buffer = song.rev; s.playbackRate.value = REWIND; s.connect(rewBus);
        s.start(0, Math.max(0, song.rev.duration - t));
        song.src = s; song.dir = -1;
    }
    // mientras suena la canción, manda su reloj (la explosión cae justo en el drop)
    function follow(t) {
        if (!ac || ac.state !== 'running' || song.dir !== 1) return t;
        var st = ac.currentTime - song.startAt;
        return st > 0 ? st : t;
    }

    /* ============================================================
       ESCENA (en color): atardecer → bola de fuego → hongo → onda
       ============================================================ */
    var puffs = [];
    for (var i = 0; i < 58; i++) {
        var a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 0.82;
        puffs.push({ a: a, d: d, s: rnd(0.2, 0.42), top: Math.sin(a) < 0 });
    }
    puffs.sort(function (p, q) { return Math.sin(q.a) * q.d - Math.sin(p.a) * p.d; });
    var flames = [];
    for (i = 0; i < 20; i++) {
        var fa = Math.random() * Math.PI * 2, fd = rnd(0.12, 0.78);
        var pts = [], n = 9, len = rnd(0.12, 0.26), wid = len * rnd(0.28, 0.5);
        for (var j = 0; j < n; j++) {
            var b = j / n * Math.PI * 2, rr = 1 + (Math.random() - 0.5) * 0.7;
            pts.push([Math.cos(b) * len * rr, Math.sin(b) * wid * rr]);
        }
        flames.push({ x: Math.cos(fa) * fd, y: Math.sin(fa) * fd * 0.8, rot: fa + rnd(-0.5, 0.5), pts: pts,
            c: Math.random() < 0.7 ? '#ffbf2a' : '#ff8a1f', ph: Math.random() * 6 });
    }
    var palms = [[0.06, 1.05], [0.14, 0.75], [0.25, 0.5], [0.74, 0.55], [0.85, 0.85], [0.93, 1.1]];

    var dotTile = document.createElement('canvas'), dotPat = null;
    function makeDots() {
        var s = Math.round(10 * DPR);
        dotTile.width = dotTile.height = s;
        var g = dotTile.getContext('2d');
        g.fillStyle = '#150707'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#d6332a';
        g.beginPath(); g.arc(s / 2, s / 2, s * 0.32, 0, 6.2832); g.fill();
        dotPat = ctx.createPattern(dotTile, 'repeat');
        if (dotPat.setTransform && window.DOMMatrix) dotPat.setTransform(new DOMMatrix().scale(1 / DPR));
    }

    function spawnDebris(n, ox, oy, power, spread) {
        for (var q = 0; q < n; q++) {
            var ang = -Math.PI / 2 + (Math.random() - 0.5) * spread;
            var sp = U * rnd(150, 900) * power;
            var m = 3 + ((Math.random() * 3) | 0), sz = rnd(3, 11), pts = [];
            for (var j = 0; j < m; j++) {
                var bb = j / m * Math.PI * 2;
                pts.push([Math.cos(bb) * sz * rnd(0.6, 1.6), Math.sin(bb) * sz * rnd(0.25, 0.6)]);
            }
            debris.push({ x: ox + rnd(-30, 30) * U, y: oy + rnd(-20, 10) * U, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
                rot: rnd(0, 6), vr: rnd(-8, 8), grow: rnd(0.2, 1.4), sc: rnd(0.6, 1.4) * U * 1.6, pts: pts, life: 0, max: rnd(1.6, 3.2),
                hot: Math.random() < 0.3 });
        }
    }
    function stepDebris(dt, lit) {
        for (var q = debris.length - 1; q >= 0; q--) {
            var p = debris[q];
            p.life += dt;
            if (p.life > p.max || p.y > B1 + 20 || p.x < L0 - 20 || p.x > L1 + 20) { debris.splice(q, 1); continue; }
            p.vx *= Math.exp(-0.4 * dt); p.vy += U * 260 * dt;
            p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
            var s = p.sc * (1 + p.grow * p.life);
            ctx.save();
            ctx.globalAlpha = Math.min(1, (p.max - p.life) * 2);
            ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(s, s);
            ctx.beginPath();
            ctx.moveTo(p.pts[0][0], p.pts[0][1]);
            for (var j = 1; j < p.pts.length; j++) ctx.lineTo(p.pts[j][0], p.pts[j][1]);
            ctx.closePath();
            ctx.fillStyle = '#120a0a'; ctx.fill();
            if (p.hot || lit > 0) {
                ctx.lineWidth = 1.6 / s * U * 1.4;
                ctx.strokeStyle = 'rgba(255, 170, 70,' + (p.hot ? 0.9 : 0.45 * lit) + ')';
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    function hillY(x) {
        return y0 - U * (6 + 8 * Math.sin(x / W * 9 + 1.3) + 5 * Math.sin(x / W * 23 + 0.4) + 3 * Math.sin(x / W * 51));
    }
    function palm(x, y, s) {
        ctx.save();
        ctx.translate(x, y); ctx.scale(s * U, s * U);
        ctx.strokeStyle = '#0b0709'; ctx.fillStyle = '#0b0709'; ctx.lineCap = 'round';
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(4, -40, 12, -80, 6, -122); ctx.stroke();
        [[-62, -112, -40, -128], [70, -112, 40, -132], [-50, -152, -24, -150], [58, -150, 30, -152], [-70, -136, -46, -138], [76, -132, 48, -140]].forEach(function (f) {
            ctx.beginPath();
            ctx.moveTo(6, -122);
            ctx.quadraticCurveTo(f[2], f[3] - 10, f[0], f[1]);
            ctx.quadraticCurveTo(f[2], f[3] + 4, 6, -118);
            ctx.fill();
        });
        ctx.restore();
    }
    function bumpyEllipse(x, y, rx, ry, a0, a1, bump, t) {
        var steps = 90;
        for (var q = 0; q <= steps; q++) {
            var th = a0 + (a1 - a0) * q / steps;
            var r = 1 + bump * (Math.sin(th * 11 + t) * 0.6 + Math.sin(th * 23 - t * 1.3) * 0.4);
            var px = x + Math.cos(th) * rx * r, py = y + Math.sin(th) * ry * r;
            if (q === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
    }
    function glow(x, y, r, rgb, a) {           // luz aditiva
        if (a <= 0 || r <= 0) return;
        var g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
        g.addColorStop(0.35, 'rgba(' + rgb + ',' + (a * 0.4) + ')');
        g.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    var dtFrame = 0, noFire = false;
    function draw(now) {
        var t = now / 1000;
        var f = clamp((T - ZOOM * 0.6) / (DET - ZOOM * 0.6));     // la bola de fuego crece
        var d = T - DET;                                          // tiempo desde la detonación
        var light = d < 0 ? f : Math.max(0.35, Math.exp(-d * 0.6));

        var amp = d < 0 ? U * 7 * f * f : U * (26 * Math.exp(-d * 1.5) + 2.5);
        ctx.save();
        ctx.translate(MX, MY);
        ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);

        // cielo de atardecer: azul oscuro arriba, naranja en el horizonte; se aclara con la explosión
        var sky = ctx.createLinearGradient(0, T0, 0, y0);
        sky.addColorStop(0, 'rgb(' + Math.round(mix(26, 60, f)) + ',' + Math.round(mix(22, 34, f)) + ',' + Math.round(mix(48, 52, f)) + ')');
        sky.addColorStop(0.42, 'rgb(' + Math.round(mix(78, 120, f)) + ',' + Math.round(mix(36, 52, f)) + ',' + Math.round(mix(62, 58, f)) + ')');
        sky.addColorStop(0.78, 'rgb(' + Math.round(mix(196, 222, f)) + ',' + Math.round(mix(88, 112, f)) + ',' + Math.round(mix(62, 70, f)) + ')');
        sky.addColorStop(1, 'rgb(' + Math.round(mix(244, 255, f)) + ',' + Math.round(mix(170, 196, f)) + ',' + Math.round(mix(102, 130, f)) + ')');
        ctx.fillStyle = sky;
        ctx.fillRect(L0, T0, L1 - L0, B1 - T0);

        // resplandor del horizonte
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        glow(cx, y0, U * (320 + 520 * Math.max(f, d > 0 ? 1 : 0)), '255, 200, 110', d > 0 ? 0.5 + 0.5 * Math.exp(-d) : 0.22 + 0.5 * f);
        ctx.restore();

        var capY = 0, capRx = 0, capRy = 0;
        if (d < 0 && !noFire) {
            // sol que se convierte en bola de fuego
            var rf = U * (52 + 190 * Math.pow(f, 1.5));
            ctx.save();
            ctx.beginPath(); ctx.rect(L0, T0, L1 - L0, y0 - T0); ctx.clip();
            ctx.beginPath();
            bumpyEllipse(cx, y0, rf, rf, Math.PI, Math.PI * 2, 0.02 + 0.03 * f, t * 6);
            ctx.closePath();
            var fb = ctx.createRadialGradient(cx, y0 - rf * 0.3, rf * 0.1, cx, y0, rf);
            fb.addColorStop(0, '#ffffff');
            fb.addColorStop(0.3, '#fff1a8');
            fb.addColorStop(0.6, '#ffd23f');
            fb.addColorStop(1, '#ff8a1e');
            ctx.fillStyle = fb;
            ctx.fill();
            ctx.restore();
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            glow(cx, y0 - rf * 0.3, rf * 2.4, '255, 230, 150', 0.25 + 0.45 * f);
            ctx.restore();
        } else if (d >= 0) {
            var sd = easeOut((d - 0.1) / 2.4), cd = easeOut((d - 0.05) / 2.6), wd = easeOut(d / 1.5);
            var rd = easeOut((d - 0.35) / 2), roll = d * 0.18;
            var ryMax = Math.min(U * 165, H * 0.17), rxMax = Math.min(W * 0.26, ryMax * 1.9);
            var capTop = Math.max(H * 0.06 + ryMax * 1.05, y0 - U * 480);
            capY = (y0 - U * 110) + (capTop - (y0 - U * 110)) * sd;
            capRx = U * 60 + (rxMax - U * 60) * cd;
            capRy = U * 45 + (ryMax - U * 45) * cd;

            // disco naranja detrás del sombrero
            if (rd > 0) {
                ctx.save();
                ctx.translate(cx, capY + capRy * 0.35);
                ctx.scale(1, 0.22 + 0.2 * rd);
                var rx = capRx * (1.05 + 0.85 * rd);
                var sk = ctx.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
                sk.addColorStop(0, 'rgba(255, 236, 160,' + (0.95 * rd) + ')');
                sk.addColorStop(0.65, 'rgba(255, 176, 46,' + (0.9 * rd) + ')');
                sk.addColorStop(0.9, 'rgba(255, 128, 30,' + (0.75 * rd) + ')');
                sk.addColorStop(1, 'rgba(255, 110, 30, 0)');
                ctx.fillStyle = sk;
                ctx.beginPath(); ctx.arc(0, 0, rx, 0, 6.2832); ctx.fill();
                ctx.restore();
            }

            // cúpula blanca
            var dRx = Math.min(W * 0.46, U * 520), dRy = Math.min(y0 - H * 0.4, dRx * 0.8);
            var dRxN = U * 100 + (dRx - U * 100) * wd, dRyN = U * 70 + (dRy - U * 70) * wd;
            ctx.save();
            ctx.beginPath();
            bumpyEllipse(cx, y0 + U * 6, dRxN, dRyN, Math.PI, Math.PI * 2, 0.035, t * 2);
            ctx.closePath();
            var dm = ctx.createLinearGradient(0, y0 - dRyN, 0, y0);
            dm.addColorStop(0, '#ffffff');
            dm.addColorStop(0.7, '#fffaf0');
            dm.addColorStop(1, '#ffe2bf');
            ctx.fillStyle = dm;
            ctx.fill();
            ctx.restore();
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            glow(cx, y0 - dRyN * 0.4, dRxN * 1.5, '255, 240, 200', 0.35 * light);
            ctx.restore();

            // columna: núcleo caliente en el centro
            var base = y0 + U * 6, half = U * (30 + 14 * sd);
            var stemG = ctx.createLinearGradient(cx - half * 1.6, 0, cx + half * 1.6, 0);
            stemG.addColorStop(0, '#9c2219');
            stemG.addColorStop(0.35, '#e2412f');
            stemG.addColorStop(0.5, '#ff7a3a');
            stemG.addColorStop(0.65, '#e2412f');
            stemG.addColorStop(1, '#8a1d16');
            ctx.beginPath();
            var steps = 24, q, yy, w;
            for (q = 0; q <= steps; q++) {
                yy = base - (base - capY) * q / steps;
                w = half + U * 95 * Math.pow(Math.max(0, 1 - q / steps * 4), 2) + U * 4 * Math.sin(q * 1.7 + t * 3);
                if (q === 0) ctx.moveTo(cx - w, yy); else ctx.lineTo(cx - w, yy);
            }
            for (q = steps; q >= 0; q--) {
                yy = base - (base - capY) * q / steps;
                w = half + U * 95 * Math.pow(Math.max(0, 1 - q / steps * 4), 2) + U * 4 * Math.sin(q * 2.3 - t * 3);
                ctx.lineTo(cx + w, yy);
            }
            ctx.closePath();
            ctx.fillStyle = stemG;
            ctx.fill();

            // sombrero: nubes que ruedan, iluminadas desde dentro
            puffs.forEach(function (p) {
                var aa = p.a + (p.top ? roll : -roll);
                var px = cx + Math.cos(aa) * p.d * capRx;
                var py = capY + Math.sin(aa) * p.d * capRy * 0.85 - capRy * 0.05;
                var pr = p.s * capRx * 0.62;
                var pg = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.45, pr * 0.1, px, py, pr);
                var under = py > capY;
                pg.addColorStop(0, under ? '#ff9a4a' : '#ff6a48');
                pg.addColorStop(0.6, under ? '#e8452f' : '#e2412f');
                pg.addColorStop(1, under ? '#c8302a' : '#a8261f');
                ctx.beginPath();
                ctx.arc(px, py, pr, 0, 6.2832);
                ctx.fillStyle = pg;
                ctx.fill();
            });
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            glow(cx, capY + capRy * 0.35, capRx * 0.9, '255, 170, 60', 0.45 * light);
            ctx.restore();
            flames.forEach(function (fl) {
                ctx.save();
                ctx.translate(cx + fl.x * capRx, capY + fl.y * capRy);
                ctx.rotate(fl.rot + Math.sin(t * 2 + fl.ph) * 0.12);
                ctx.scale(capRx, capRx);
                ctx.beginPath();
                ctx.moveTo(fl.pts[0][0], fl.pts[0][1]);
                for (var j = 1; j < fl.pts.length; j++) ctx.lineTo(fl.pts[j][0], fl.pts[j][1]);
                ctx.closePath();
                ctx.fillStyle = fl.c;
                ctx.globalAlpha = Math.min(1, d * 1.5);
                ctx.fill();
                ctx.restore();
            });
        }

        // horizonte: colinas con el borde iluminado y palmeras
        ctx.beginPath();
        ctx.moveTo(L0, B1);
        for (var x = L0; x <= L1 + 12; x += 12) ctx.lineTo(x, hillY(x));
        ctx.lineTo(L1 + 12, B1);
        ctx.closePath();
        ctx.fillStyle = '#0b0709';
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        for (x = L0; x <= L1 + 12; x += 12) { if (x === L0) ctx.moveTo(x, hillY(x)); else ctx.lineTo(x, hillY(x)); }
        var rimG = ctx.createLinearGradient(0, 0, W, 0);
        var rimA = 0.25 + 0.75 * Math.max(f, d > 0 ? light : 0);
        rimG.addColorStop(0, 'rgba(255, 140, 60, 0)');
        rimG.addColorStop(0.5, 'rgba(255, 210, 120,' + rimA + ')');
        rimG.addColorStop(1, 'rgba(255, 140, 60, 0)');
        ctx.strokeStyle = rimG; ctx.lineWidth = 2 + U * 2;
        ctx.stroke();
        ctx.restore();
        var pk = d > 0 ? easeOut(d / 0.8) : 0;
        if (pk < 1) palms.forEach(function (p) {
            var px = p[0] * W;
            ctx.save();
            ctx.globalAlpha = 1 - pk;
            ctx.translate(px, hillY(px) + U * 4);
            ctx.rotate((px < cx ? -1 : 1) * pk * 1.1);
            palm(0, 0, p[1]);
            ctx.restore();
        });

        // el suelo se levanta por los lados
        if (d > 0) {
            var g = easeOut((d - 0.25) / 2.2);
            if (g > 0) [-1, 1].forEach(function (s) {
                var xe = s < 0 ? L0 : L1, xm = cx + s * U * 150;
                var L = g * H * 0.3, kx = cx + s * W * 0.27;
                [[0, H * 0.045 * g, '#5a4032'], [H * 0.045 * g, H * 0.11 * g, '#1a110c'], [H * 0.11 * g, H + MY * 2, '#0b0709']].forEach(function (bd) {
                    ctx.beginPath();
                    ctx.moveTo(xm, y0);
                    ctx.quadraticCurveTo(kx, y0 - L * 0.3 + bd[0] * 0.5, xe, y0 - L + bd[0]);
                    ctx.lineTo(xe, y0 - L + bd[1]);
                    ctx.quadraticCurveTo(kx, y0 - L * 0.3 + bd[1] * 0.5, xm, y0);
                    ctx.closePath();
                    ctx.fillStyle = bd[2];
                    ctx.fill();
                });
            });
        }


        stepDebris(dtFrame, d > 0 ? light : f);

        // viñeta
        var vg = ctx.createRadialGradient(cx, H * 0.55, Math.min(W, H) * 0.35, cx, H * 0.55, Math.hypot(W, H) * 0.65);
        vg.addColorStop(0, 'rgba(20, 2, 2, 0)');
        vg.addColorStop(1, 'rgba(20, 2, 2, .45)');
        ctx.fillStyle = vg;
        ctx.fillRect(L0, T0, L1 - L0, B1 - T0);
        ctx.restore();

        // onda expansiva: un anillo que barre la pantalla y lo deja todo en blanco
        var sk2 = clamp((T - SHOCK) / SHOCK_DUR);
        if (sk2 > 0) {
            ctx.save(); ctx.translate(MX, MY);
            var e2 = sk2 < 0.5 ? 2 * sk2 * sk2 : 1 - Math.pow(-2 * sk2 + 2, 2) / 2;
            var R = e2 * Math.hypot(W, H) * 1.25 + 1;
            var band = Math.max(20, R * 0.18);
            ctx.save();
            ctx.translate(cx, y0); ctx.scale(1, 0.82);
            var ahead = ctx.createRadialGradient(0, 0, R, 0, 0, R + band * 1.6);
            ahead.addColorStop(0, 'rgba(255, 255, 255, .9)');
            ahead.addColorStop(0.25, 'rgba(255, 236, 200, .45)');
            ahead.addColorStop(0.6, 'rgba(120, 30, 20, .12)');
            ahead.addColorStop(1, 'rgba(120, 30, 20, 0)');
            ctx.fillStyle = ahead;
            ctx.beginPath(); ctx.arc(0, 0, R + band * 1.6, 0, 6.2832); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.2832); ctx.fill();
            ctx.restore();
            ctx.restore();
        }
    }

    function sizeScene(w, h, dpr, mx, my) {
        DPR = dpr; W = w; H = h; MX = mx || 0; MY = my || 0;
        L0 = -MX - 20; L1 = W + MX + 20; T0 = -MY - 20; B1 = H + MY + 20;
        canvas.width = Math.round((W + MX * 2) * DPR); canvas.height = Math.round((H + MY * 2) * DPR);
        canvas.style.inset = 'auto';
        canvas.style.left = -MX + 'px'; canvas.style.top = -MY + 'px';
        canvas.style.width = (W + MX * 2) + 'px'; canvas.style.height = (H + MY * 2) + 'px';
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        U = Math.min(W, H * 1.55) / 1000;
        cx = W / 2;
        y0 = H * (W < H ? 0.64 : 0.74);
        makeDots();
    }

    // la parte de la explosión, compartida por el directo y el render del vídeo
    function detonateScene() {
        spawnDebris(70, cx, y0 - U * 60, 1.5, Math.PI * 1.1);
    }
    function stepBoomScene(dt) {
        var dd = T - DET;
        if (dd < 2.5 && Math.random() < dt * 14 * Math.exp(-dd)) spawnDebris(2, cx, y0 - U * 120, 1.1, 2.2);
    }

    /* ---------- Modo render: solo para generar el vídeo ---------- */
    if (RENDER) {
        window.__ci = {
            DET: DET, WHITE: WHITE,
            size: function (w, h) { sizeScene(w, h, 1); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; },
            start: function () { T = DET; debris = []; detonateScene(); },
            plate: function () { T = 0; debris = []; noFire = true; dtFrame = 0; draw(0); noFire = false; },
            step: function (dt) { T += dt; dtFrame = dt; stepBoomScene(dt); draw(T * 1000); }
        };
        return;
    }

    /* ============================================================
       FOTO (B/N) CON PARALAJE Y GAFAS
       Dos capas rígidas en WebGL: yo (recortado) y el fondo limpio.
       Se desplazan una respecto a la otra sin deformar nada; las gafas
       se dibujan encima en un canvas 2D y se mueven conmigo.
       ============================================================ */
    var IMG = 1536;                                  // coordenadas de la foto original
    var EYES = { x: 771, y: 586 };                   // punto medio entre las pupilas
    var LENS_L = { x: 620, y: 596 }, LENS_R = { x: 922, y: 585 };   // centros de los cristales
    var gAng = Math.atan2(LENS_R.y - LENS_L.y, LENS_R.x - LENS_L.x);
    var gK = Math.hypot(LENS_R.x - LENS_L.x, LENS_R.y - LENS_L.y) / 466;   // el dibujo base tiene los cristales a 466 u
    var gMid = { x: (LENS_L.x + LENS_R.x) / 2, y: (LENS_L.y + LENS_R.y) / 2 };
    var P_LENS_L = new Path2D('M78 92 L452 92 Q474 92 470 118 L448 288 Q440 336 392 336 L160 336 Q110 336 100 290 L64 122 Q58 92 78 92 Z');
    var P_LENS_R = new Path2D('M922 92 L548 92 Q526 92 530 118 L552 288 Q560 336 608 336 L840 336 Q890 336 900 290 L936 122 Q942 92 922 92 Z');

    var gl = null, glProg = null, glU = {}, photoReady = false;
    var view = { s: 1, ax: 0, ay: 0 };               // foto → pantalla
    var par = { x: 0, y: 0, tx: 0, ty: 0 };          // desplazamiento de mi capa (en píxeles de la foto)
    var BG_K = -0.35;                                // el fondo se mueve menos y al revés
    var zoomMax = 12, zc = { x: 0, y: 0 }, PDPR = 1;

    function layoutPhoto() {
        view.s = Math.min(H / 1050, W / 640);
        view.ax = W / 2; view.ay = H * 0.44;
    }
    function imgToScr(x, y) {                        // un punto de mi capa (foto) → pantalla
        return { x: view.ax + (x + par.x - EYES.x) * view.s, y: view.ay + (y + par.y - EYES.y) * view.s };
    }
    function measureZoom() {                         // cuánto acercar para que la lente llene la pantalla
        var lw = 406 * gK * view.s, lh = 244 * gK * view.s;
        zoomMax = Math.max(W / lw, H / lh) * 1.12;
    }

    function initPhoto() {
        if (!photoCv) return;
        try { gl = photoCv.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false }); } catch (e) { }
        if (!gl) return;
        var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
        var FS = [
            'precision highp float;',
            'uniform sampler2D uImg,uMask,uBg;uniform vec2 uRes,uEye,uAnc,uPar,uZc;uniform float uS,uZ,uSize,uBgK;',
            'void main(){',
            ' vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);',
            ' p=uZc+(p-uZc)/uZ;',                                     /* deshace el zoom */
            ' vec2 uv=(uEye+(p-uAnc)/uS)/uSize;',
            ' vec2 up=clamp(uv-uPar/uSize,0.,1.);',                    /* mi capa: se desplaza entera */
            ' vec2 ub=clamp(uv-uPar*uBgK/uSize,0.,1.);',               /* el fondo: menos y al revés */
            ' float m=texture2D(uMask,up).r;',
            ' float c=mix(texture2D(uBg,ub).r,texture2D(uImg,up).r,m);',
            ' vec2 v=(p-uAnc)/uRes.y;',
            ' c*=1.-.35*smoothstep(.45,1.1,length(v*vec2(.8,1.)));',  /* viñeta */
            ' gl_FragColor=vec4(vec3(c),1.);',
            '}'
        ].join('\n');
        function sh(type, src) {
            var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
            return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null;
        }
        var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
        if (!vs || !fs) { gl = null; return; }
        glProg = gl.createProgram();
        gl.attachShader(glProg, vs); gl.attachShader(glProg, fs); gl.linkProgram(glProg); gl.useProgram(glProg);
        var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(glProg, 'a');
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        ['uImg', 'uMask', 'uBg', 'uRes', 'uEye', 'uAnc', 'uPar', 'uZc', 'uS', 'uZ', 'uSize', 'uBgK'].forEach(function (k) { glU[k] = gl.getUniformLocation(glProg, k); });
        gl.uniform1i(glU.uImg, 0); gl.uniform1i(glU.uMask, 1); gl.uniform1i(glU.uBg, 2);
        var pending = 3;
        function tex(unit, url) {
            var t = gl.createTexture(), im = new Image();
            gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([150, 150, 150, 255]));
            ['TEXTURE_WRAP_S', 'TEXTURE_WRAP_T'].forEach(function (w) { gl.texParameteri(gl.TEXTURE_2D, gl[w], gl.CLAMP_TO_EDGE); });
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            im.onload = function () {
                gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
                if (--pending === 0) photoReady = true;
            };
            im.src = url;
        }
        tex(0, intro.getAttribute('data-photo'));
        tex(1, intro.getAttribute('data-mask'));
        tex(2, intro.getAttribute('data-bg'));
    }

    function sizePhoto() {
        PDPR = Math.min(window.devicePixelRatio || 1, 1.5);
        if (photoCv) { photoCv.width = Math.round(W * PDPR); photoCv.height = Math.round(H * PDPR); }
        if (glassCv) { glassCv.width = Math.round(W * PDPR); glassCv.height = Math.round(H * PDPR); }
        if (gl) gl.viewport(0, 0, photoCv.width, photoCv.height);
        layoutPhoto(); measureZoom();
    }

    // pantalla (sin zoom) → pantalla con zoom
    function Z(p, z) { return { x: zc.x + (p.x - zc.x) * z, y: zc.y + (p.y - zc.y) * z }; }

    function drawPhoto(t, z) {
        if (!gl) return;
        gl.uniform2f(glU.uRes, W * PDPR, H * PDPR);
        gl.uniform2f(glU.uEye, EYES.x, EYES.y);
        gl.uniform2f(glU.uAnc, view.ax * PDPR, view.ay * PDPR);
        gl.uniform2f(glU.uPar, par.x, par.y);
        gl.uniform2f(glU.uZc, zc.x * PDPR, zc.y * PDPR);
        gl.uniform1f(glU.uS, view.s * PDPR);
        gl.uniform1f(glU.uZ, z);
        gl.uniform1f(glU.uSize, IMG);
        gl.uniform1f(glU.uBgK, BG_K);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // gafas: montura en blanco y negro; los cristales muestran la escena en color
    function drawGlasses(z, zk) {
        var g = gctx;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, glassCv.width, glassCv.height);
        var mid = imgToScr(gMid.x, gMid.y);
        var cR = imgToScr(LENS_R.x, LENS_R.y), cL = imgToScr(LENS_L.x, LENS_L.y);
        var sc = gK * view.s;
        function frameXf() {                      // coordenadas del dibujo base (1000 × 400) → pantalla
            g.setTransform(PDPR, 0, 0, PDPR, 0, 0);
            g.translate(zc.x, zc.y); g.scale(z, z); g.translate(-zc.x, -zc.y);
            g.translate(mid.x, mid.y); g.rotate(gAng); g.scale(sc, sc); g.translate(-500, -214);
        }
        [[P_LENS_L, cL], [P_LENS_R, cR]].forEach(function (L) {
            g.save();
            frameXf(); g.clip(L[0]);
            g.fillStyle = '#4a1010'; g.fillRect(-50, 0, 1100, 400);
            // la escena completa, en miniatura, centrada en el cristal: al acercar del todo
            // coincide exactamente con la pantalla
            var c = Z(L[1], z), k = z / zoomMax;
            g.setTransform(PDPR, 0, 0, PDPR, 0, 0);
            g.drawImage(canvas, c.x + (-MX - cR.x) * k, c.y + (-MY - cR.y) * k, (W + MX * 2) * k, (H + MY * 2) * k);
            // tinte de cristal de sol y brillos (desaparecen al entrar)
            frameXf();
            var a = 1 - zk;
            var tint = g.createLinearGradient(0, 92, 0, 336);
            tint.addColorStop(0, 'rgba(0,0,0,' + (0.35 * a) + ')');
            tint.addColorStop(1, 'rgba(0,0,0,' + (0.05 * a) + ')');
            g.fillStyle = tint; g.fillRect(0, 0, 1000, 400);
            g.fillStyle = 'rgba(255,255,255,' + (0.28 * a) + ')';
            var ox = L[0] === P_LENS_L ? 0 : 480;
            g.beginPath(); g.moveTo(120 + ox, 92); g.lineTo(190 + ox, 92); g.lineTo(120 + ox, 250); g.lineTo(80 + ox, 250); g.fill();
            g.fillStyle = 'rgba(255,255,255,' + (0.18 * a) + ')';
            g.beginPath(); g.moveTo(215 + ox, 92); g.lineTo(245 + ox, 92); g.lineTo(165 + ox, 280); g.lineTo(140 + ox, 280); g.fill();
            g.restore();
        });
        // montura negra con brillos grises
        frameXf();
        g.lineJoin = 'round'; g.lineCap = 'round';
        g.strokeStyle = '#0b0b0b';
        g.lineWidth = 26;
        g.beginPath(); g.moveTo(70, 110); g.lineTo(-30, 98); g.moveTo(930, 110); g.lineTo(1030, 98); g.stroke();
        g.lineWidth = 30; g.stroke(P_LENS_L); g.stroke(P_LENS_R);
        g.lineWidth = 40; g.beginPath(); g.moveTo(60, 86); g.lineTo(470, 86); g.moveTo(530, 86); g.lineTo(940, 86); g.stroke();
        g.lineWidth = 30; g.beginPath(); g.moveTo(466, 112); g.quadraticCurveTo(500, 84, 534, 112); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 6;
        g.beginPath(); g.moveTo(96, 76); g.lineTo(270, 76); g.moveTo(560, 76); g.lineTo(720, 76); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(452, 104); g.lineTo(446, 280); g.moveTo(918, 104); g.lineTo(906, 270); g.stroke();
        return cR;
    }

    /* ---------- Entrada en la lente ---------- */
    var mouse = { x: 0.5, y: 0.5 };
    window.addEventListener('pointermove', function (e) { mouse.x = e.clientX / Math.max(1, W); mouse.y = e.clientY / Math.max(1, H); }, { passive: true });

    function frontPhase(t, dt) {
        var zk = clamp(T / ZOOM);
        var visible = zk < 1;
        photoCv.style.visibility = glassCv.style.visibility = visible ? '' : 'hidden';
        if (!visible) return;
        // paralaje: ratón + un vaivén lento; se congela al empezar a entrar
        var still = 1 - clamp(T / 0.35);
        par.tx = ((mouse.x - 0.5) * 50 + Math.sin(t * 0.55) * 12) * still;
        par.ty = ((mouse.y - 0.5) * 30 + Math.cos(t * 0.41) * 8) * still;
        par.x += (par.tx - par.x) * Math.min(1, dt * 4);
        par.y += (par.ty - par.y) * Math.min(1, dt * 4);
        // centro del zoom: el cristal derecho (así, al acercar del todo, su escena
        // coincide píxel a píxel con la pantalla)
        zc = imgToScr(LENS_R.x, LENS_R.y);
        var z = Math.exp(Math.log(zoomMax) * zk * zk);
        drawPhoto(t, z);
        drawGlasses(z, zk);
        // sin fundido: si la foto se desvaneciera a la vez que las gafas, se vería el ojo a través
        // del cristal. Al terminar el zoom el cristal ya ocupa la pantalla y se cambia de golpe.
        photoCv.style.opacity = glassCv.style.opacity = '';
    }

    /* ============================================================
       NOMBRE Y TEXTO: aparecen en el centro y vuelan a su sitio
       ============================================================ */
    var FLY_SEL = ['.cv-hero .hm-badge', '.cv-hero .cv-name', '.cv-hero .cv-role', '.cv-hero .cv-tagline'];

    function textBox(el) {
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), node, rg = document.createRange();
        var l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
        while ((node = walker.nextNode())) {
            if (!node.nodeValue.trim()) continue;
            rg.selectNodeContents(node);
            [].forEach.call(rg.getClientRects(), function (q) {
                if (q.width < 1) return;
                l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
            });
        }
        if (l === Infinity) { var q = el.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom }; }
        return { l: l, t: t, r: r, b: b };
    }

    function prepareFly() {
        if (!root) return;
        var layer = document.createElement('div');
        layer.className = 'cv ci-fly' + (root.classList.contains('is-h') ? ' is-h' : '');
        layer.setAttribute('aria-hidden', 'true');
        intro.appendChild(layer);
        var items = [];
        FLY_SEL.forEach(function (sel) {
            var src = root.querySelector(sel);
            if (!src) return;
            src.classList.add('ci-landed', 'ci-fly-src');
            var r = src.getBoundingClientRect();
            var c = src.cloneNode(true);
            c.removeAttribute('data-in'); c.removeAttribute('id');
            c.classList.remove('ci-fly-src', 'ci-landed');
            c.style.animation = 'none';
            c.style.left = r.left + 'px'; c.style.top = r.top + 'px';
            c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
            c.style.opacity = '0';
            layer.appendChild(c);
            items.push({ src: src, el: c, r: r });
        });
        var gap = Math.max(12, H * 0.022), total = 0;
        items.forEach(function (it, k) {
            var tb = textBox(it.el);
            it.tb = tb;
            var cw = tb.r - tb.l, ch = tb.b - tb.t;
            it.s = k === 1 ? Math.min(1.55, W * 0.9 / cw) : Math.min(1.12, W * 0.9 / cw);
            it.h = ch * it.s;
            total += it.h + (k ? gap : 0);
        });
        var y = (H - total) / 2;
        items.forEach(function (it, k) {
            if (k) y += gap;
            var ccx = (it.tb.l + it.tb.r) / 2, ccy = (it.tb.t + it.tb.b) / 2;
            var dx = W / 2 - ccx, dy = y + it.h / 2 - ccy;
            it.el.style.transformOrigin = (ccx - it.r.left) + 'px ' + (ccy - it.r.top) + 'px';
            it.from = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + it.s.toFixed(3) + ')';
            it.el.style.transform = it.from;
            y += it.h;
        });
        fly = { layer: layer, items: items };
    }
    function showFly() {
        if (!fly) return;
        fly.items.forEach(function (it, k) {
            it.el.style.opacity = '';
            if (it.el.animate) {
                it.el.animate([
                    { opacity: 0, transform: it.from + ' translateY(28px) scale(.82)', filter: 'blur(14px)' },
                    { opacity: 1, transform: it.from, filter: 'blur(0px)' }
                ], { duration: 560, delay: k * 80, easing: 'cubic-bezier(.2, 1.3, .4, 1)', fill: 'backwards' });
            }
        });
    }
    function startFly() {
        if (!fly) return;
        fly.items.forEach(function (it, k) {
            if (it.el.animate) {
                it.el.animate([{ transform: it.from }, { transform: 'none' }],
                    { duration: FLY_DUR * 1000, delay: k * 45, easing: 'cubic-bezier(.7, 0, .2, 1)', fill: 'forwards' });
            } else it.el.style.transform = 'none';
        });
    }
    function landFly() {
        if (!fly) return;
        fly.items.forEach(function (it) { it.src.classList.remove('ci-fly-src'); });
        if (fly.layer.parentNode) fly.layer.parentNode.removeChild(fly.layer);
        fly = null;
    }

    /* ============================================================
       VÍDEO DE LA EXPLOSIÓN (horizontal o vertical según pantalla)
       ============================================================ */
    var videoDur = 0;
    function chooseVideo() {
        if (!video) return;
        var src = intro.getAttribute(W < H ? 'data-video-v' : 'data-video-h');
        if (!src) return;
        video.addEventListener('loadedmetadata', function () { videoDur = video.duration || 0; });
        video.addEventListener('loadeddata', function () { try { video.currentTime = 0; } catch (e) { } }, { once: true });
        video.src = src;
        try { video.load(); } catch (e) { }
    }
    // algunos móviles (iPhone) no cargan el vídeo hasta que se reproduce: con el primer
    // toque se reproduce un instante, oculto, y se vuelve al principio
    var primed = false;
    function primeVideo() {
        if (primed || !video || !video.src) return;
        primed = true;
        var p = video.play();
        if (p && p.then) p.then(function () {
            if (state === 'idle') { video.pause(); try { video.currentTime = 0; } catch (e) { } }
        }).catch(function () { });
    }
    function startVideo() {
        if (!video || video.readyState < 3 || !videoDur) return false;   // no está listo: se dibuja en directo
        lastSeek = 0;
        var p = video.play();
        if (p && p.catch) p.catch(function () { useVideo = false; video.classList.remove('is-on'); });
        video.classList.add('is-on');
        return true;
    }
    // el vídeo sigue a la canción ajustando un poco su velocidad; solo salta si se ha
    // ido mucho (y como mucho una vez por segundo), porque cada salto lo para un momento
    var lastSeek = 0;
    function syncVideo(now) {
        var target = T - DET;
        if (target >= videoDur - 0.06) { video.classList.remove('is-on'); useVideo = false; return; }
        if (video.seeking) return;
        var drift = video.currentTime - target;
        if (Math.abs(drift) > 0.3 && now - lastSeek > 1000) {
            lastSeek = now;
            try { video.currentTime = target + 0.05; } catch (e) { }
            video.playbackRate = 1;
        } else {
            video.playbackRate = Math.max(0.9, Math.min(1.1, 1 - drift * 0.5));
        }
    }

    /* ============================================================
       CONTROL
       ============================================================ */
    function detonate() {
        state = 'boom';
        T = DET;
        intro.classList.add('is-boom');
        if (flash.animate) flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
        detonateScene();
        useVideo = startVideo();
        if (navigator.vibrate) { try { navigator.vibrate([80, 40, 160]); } catch (e) { } }
    }

    function unlockScroll() {
        html.classList.remove('cv-intro-lock');
        window.scrollTo(0, 0);
        window.dispatchEvent(new Event('resize'));
    }

    function notifyReveal() {
        if (flags.revealed) return;
        flags.revealed = true;
        if (opts.onReveal) { try { opts.onReveal(); } catch (e) { } }
    }

    function reveal() {
        notifyReveal();
        intro.classList.add('is-reveal');
        html.classList.remove('cv-intro-on');
        if (root) root.classList.add('cv-revealed');
        startFly();
        if (world.animate) world.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLY_DUR * 1000 + 150, easing: 'ease-in-out', fill: 'forwards' });
        else world.style.opacity = '0';
        intro.style.pointerEvents = 'none';
        if (ac && musicGain) musicGain.gain.setTargetAtTime(0, ac.currentTime + BAR * 0.5, BAR * 0.6);
    }

    function finish(fast) {
        if (state === 'out') return;
        state = 'out';
        if (fast) {
            if (fly) fly.items.forEach(function (it) { it.src.classList.remove('ci-fly-src'); });
            notifyReveal();
            intro.classList.add('is-out', 'is-fast');
            html.classList.remove('cv-intro-on', 'cv-intro-lock');
            if (root) root.classList.add('cv-revealed');
            window.scrollTo(0, 0);
            if (ac && musicGain) musicGain.gain.setTargetAtTime(0, ac.currentTime, 0.12);
            timers.push(setTimeout(cleanup, 420));
        } else {
            landFly();
            cleanup();
        }
    }

    // deja la intro oculta y lista para repetirse
    function cleanup() {
        cancelAnimationFrame(raf);
        timers.forEach(clearTimeout); timers = [];
        window.removeEventListener('resize', resize);
        document.removeEventListener('keydown', onKeyDown, true);
        document.removeEventListener('keyup', onKeyUp, true);
        window.removeEventListener('blur', release);
        if (fly && fly.layer.parentNode) fly.layer.parentNode.removeChild(fly.layer);
        fly = null;
        if (video) { video.classList.remove('is-on'); try { video.pause(); video.currentTime = 0; } catch (e) { } }
        intro.className = 'cv-intro';
        html.classList.remove('cv-intro-on', 'cv-intro-lock');
        // la canción termina de apagarse sola y después se cierra el audio
        if (ac) { var old = ac; ac = null; master = musicGain = rewBus = null; song.src = null; song.dir = 0;
                  setTimeout(function () { try { old.close(); } catch (e) { } }, 5000); }
        running = false; autoAt = 0;
        window.dispatchEvent(new Event('resize'));
        if (opts.onDone) { try { opts.onDone(); } catch (e) { } }
    }

    function release() { keyHeld = false; ptrHeld = false; }

    function onKeyDown(e) {
        if (state === 'out') return;
        if (e.key === 'Escape') { e.preventDefault(); finish(true); return; }
        if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            keyHeld = true;
            audioInit(); primeVideo();
            return;
        }
        if (/^(Arrow|Page|Home|End| )/.test(e.key) && !(e.target.closest && e.target.closest('button'))) e.preventDefault();
    }
    function onKeyUp(e) { if (e.key === 'h' || e.key === 'H') keyHeld = false; }

    function resize() {
        W = intro.clientWidth; H = intro.clientHeight;
        layoutPhoto(); measureZoom();
        // margen para que la escena en miniatura cubra el cristal entero: el cristal no está
        // en el centro de la pantalla, así que se mide hacia cada lado (más el paralaje)
        var c = imgToScr(LENS_R.x, LENS_R.y), slack = 40 * view.s;
        var needX = 406 * gK * view.s * zoomMax * 0.56, needY = 244 * gK * view.s * zoomMax * 0.56;
        var mx = needX - Math.min(c.x, W - c.x) + slack;
        var my = needY - Math.min(c.y, H - c.y) + slack;
        sizeScene(W, H, 1, Math.max(0, mx), Math.max(0, my));
        sizePhoto();
    }

    /* ---------- Arranque (bajo demanda) ---------- */
    var running = false, preloaded = false, opts = {};
    var autoAt = 0;                    // la animación avanza sola desde este instante (sin mantener la H)
    var LEAD = 0.9;                    // segundos que se ve la foto antes de arrancar
    // se precarga cuando se empieza a girar rápido: foto, canción y vídeo
    function preload() {
        if (preloaded) return;
        preloaded = true;
        initPhoto(); loadSong(); chooseVideo();
    }

    function start(o) {
        if (running) return true;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
        opts = o || {};
        preload();
        running = true;
        // estado inicial
        state = 'idle'; T = 0; keyHeld = ptrHeld = wasHolding = false;
        debris = []; flags = {}; fly = null; useVideo = false; timers = [];
        par.x = par.y = 0;
        intro.className = 'cv-intro';
        intro.style.pointerEvents = '';
        intro.style.removeProperty('--hold');
        [world, bgEl, intro].forEach(function (el) { if (el.getAnimations) el.getAnimations().forEach(function (a) { a.cancel(); }); });
        world.style.opacity = ''; bgEl.style.opacity = ''; bgEl.style.background = '';
        photoCv.style.visibility = glassCv.style.visibility = '';
        if (video) { video.classList.remove('is-on'); try { video.pause(); video.currentTime = 0; } catch (e) { } }
        html.classList.add('cv-intro-on', 'cv-intro-lock');
        window.scrollTo(0, 0);
        paintSound();
        resize();
        window.addEventListener('resize', resize);
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('keyup', onKeyUp, true);
        window.addEventListener('blur', release);
        intro.setAttribute('tabindex', '-1');
        try { intro.focus({ preventScroll: true }); } catch (e) { intro.focus(); }
        if (intro.animate) intro.animate([{ opacity: 0, filter: 'brightness(3)' }, { opacity: 1, filter: 'brightness(1)' }], { duration: 650, easing: 'ease-out' });
        intro.classList.add('is-auto');
        last = performance.now();
        autoAt = last + LEAD * 1000;
        raf = requestAnimationFrame(tick);
        return true;
    }
    // desbloquea el audio y el vídeo durante el gesto (arrastrar las órbitas), porque
    // la animación arranca después, fuera del gesto, y algunos navegadores lo exigen
    function unlock() { preload(); audioInit(); primeVideo(); }
    window.hfIntro = { start: start, preload: preload, unlock: unlock };

    if (soundBtn) soundBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        soundOn = !soundOn;
        try { localStorage.setItem('cvIntroSound', soundOn ? 'on' : 'off'); } catch (err) { }
        paintSound();
    });
    intro.addEventListener('pointerdown', function (e) {
        if (!running || e.button > 0 || (e.target.closest && e.target.closest('.ci-ui'))) return;
        ptrHeld = true;
        audioInit(); primeVideo();
        try { intro.setPointerCapture(e.pointerId); } catch (err) { }
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
        intro.addEventListener(ev, function () { ptrHeld = false; });
    });
    intro.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    intro.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false });
    intro.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    if (skipBtn) skipBtn.addEventListener('click', function (e) { e.stopPropagation(); finish(true); });

    /* ---------- Bucle ---------- */
    function tick(now) {
        raf = requestAnimationFrame(tick);
        var dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        dtFrame = Math.min(dt, 0.05);
        var holding = keyHeld || ptrHeld || (autoAt && now >= autoAt);

        if (state === 'idle') {
            if (holding !== wasHolding) {             // pulsar: suena hacia delante · soltar: se rebobina
                wasHolding = holding;
                if (holding) playFwd(T); else playRev(T);
            }
            if (holding) T = follow(T + dt);
            else {
                T = Math.max(0, T - dt * REWIND);
                if (T <= 0 && song.dir === -1) stopSrc();
            }
            intro.classList.toggle('is-holding', holding);
            intro.classList.toggle('is-zooming', T > 0);
            intro.style.setProperty('--hold', clamp(T / DET).toFixed(3));
            if (T >= DET) detonate();
        } else if (state === 'boom') {
            T = follow(T + dt);
            stepBoomScene(dt);
            if (useVideo) syncVideo(now);
            if (!flags.white && T >= WHITE) { flags.white = true; intro.classList.add('is-white'); unlockScroll(); }
            if (!flags.bg && T >= WHITE + 0.05) {        // el blanco se apaga hacia el fondo de la página
                flags.bg = true;
                var cs = root ? getComputedStyle(root) : null;
                bgEl.style.background = cs && cs.backgroundImage !== 'none' ? cs.backgroundImage + ', ' + cs.backgroundColor : (cs ? cs.backgroundColor : '#fff');
                if (bgEl.animate) bgEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.max(200, (NAME - WHITE - 0.05) * 1000), easing: 'ease-in-out', fill: 'forwards' });
                else bgEl.style.opacity = '1';
            }
            if (!flags.prep && T >= NAME - 0.25) { flags.prep = true; prepareFly(); }
            if (!flags.name && T >= NAME) { flags.name = true; showFly(); }
            if (!flags.fly && T >= FLY) { flags.fly = true; reveal(); }
            if (T >= END) finish(false);
        }

        // la escena en directo: siempre antes del drop (también se ve en los cristales);
        // después, solo si no está el vídeo
        var needScene = state === 'idle' || !useVideo || T - DET < 0.1;
        if (needScene && (!flags.fly || T < FLY + FLY_DUR)) draw(now);
        if (state === 'idle' || T < ZOOM) frontPhase(now / 1000, dt);
        else if (photoCv.style.visibility !== 'hidden') photoCv.style.visibility = glassCv.style.visibility = 'hidden';
    }
})();
