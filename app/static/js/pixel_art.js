/* ============================================================
   PIXEL ART · lienzo compartido
   - El lienzo se descarga entero al entrar y después se piden solo
     los cambios (cada 1,5 s) para ver en directo lo que pintan otros.
   - Lo que pintas se ve al instante y se envía al servidor en grupos.
   - Pincel, goma, cuentagotas y mover; zoom con rueda o pellizco;
     deshacer tus propios trazos; descargar el dibujo en PNG.
   ============================================================ */
(function () {
    var root = document.getElementById('px');
    if (!root) return;

    var API = root.getAttribute('data-api');
    var W = parseInt(root.getAttribute('data-w'), 10) || 512;
    var H = parseInt(root.getAttribute('data-h'), 10) || 512;
    var WHITE = 0xffffff;

    var stage = document.getElementById('px-stage');
    var cv = document.getElementById('px-canvas');
    var ctx = cv.getContext('2d');
    var loading = document.getElementById('px-loading');
    var hint = document.getElementById('px-hint');
    var countEl = document.getElementById('px-count');
    var coordEl = document.getElementById('px-coord');
    var liveEl = document.getElementById('px-live');
    var toastEl = document.getElementById('px-toast');
    var undoBtn = document.getElementById('px-undo');
    var gridBtn = document.getElementById('px-grid');
    var currentSw = document.getElementById('px-current');
    var customInput = document.getElementById('px-custom');
    var paletteEl = document.getElementById('px-palette');
    var inkEl = document.getElementById('px-ink');
    var inkFill = document.getElementById('px-ink-fill');
    var inkN = document.getElementById('px-ink-n');

    /* ---------- Tinta (límite por persona) ----------
       El servidor manda cuánta queda; aquí se lleva la cuenta igual que allí para
       no enviar lo que se rechazaría. null = sin límite (administrador). */
    var ink = null;
    function setInk(i) {
        if (!i) { ink = null; inkEl.hidden = true; return; }
        // lo pintado que aún no ha llegado al servidor ya está gastado aquí
        ink = { tokens: i.tokens - (queue ? queue.size : 0), cap: i.cap, rate: i.rate, at: performance.now() };
        inkEl.hidden = false;
        drawInk();
    }
    function inkNow() {
        if (!ink) return Infinity;
        return Math.min(ink.cap, ink.tokens + (performance.now() - ink.at) / 1000 * ink.rate);
    }
    function spendInk(n) {
        if (!ink) return true;
        var t = inkNow();
        if (t < n) return false;
        ink.tokens = t - n; ink.at = performance.now();
        return true;
    }
    function drawInk() {
        if (!ink) return;
        var t = inkNow();
        inkFill.parentNode.parentNode.style.setProperty('--ink', (t / ink.cap).toFixed(3));
        inkN.textContent = Math.floor(t);
        inkEl.classList.toggle('is-low', t < ink.cap * 0.15);
    }
    setInterval(drawInk, 250);
    var noInkT = 0;
    function noInk() {
        inkEl.classList.remove('is-empty'); void inkEl.offsetWidth; inkEl.classList.add('is-empty');
        if (performance.now() - noInkT > 3000) {
            noInkT = performance.now();
            toast('Te has quedado sin tinta: se recarga sola (' + ink.rate + ' píxeles por segundo).');
        }
    }

    /* ---------- Lienzo en memoria (1 píxel = 1 casilla) ---------- */
    var off = document.createElement('canvas');
    off.width = W; off.height = H;
    var octx = off.getContext('2d');
    var img = octx.createImageData(W, H);
    var pix = img.data;
    var cells = new Int32Array(W * H).fill(WHITE);   // color de cada casilla
    var dirty = true;

    function setCellLocal(x, y, c) {
        var i = y * W + x, j = i * 4;
        cells[i] = c;
        pix[j] = (c >> 16) & 255; pix[j + 1] = (c >> 8) & 255; pix[j + 2] = c & 255; pix[j + 3] = 255;
        dirty = true;
    }
    function getCell(x, y) { return cells[y * W + x]; }

    /* ---------- Paleta ---------- */
    var PALETTE = [
        '#000000', '#3c3c3c', '#787878', '#aaaaaa', '#d2d2d2', '#ffffff', '#6d001a', '#be0039',
        '#ff4500', '#ffa800', '#ffd635', '#fff8b8', '#00a368', '#00cc78', '#7eed56', '#00756f',
        '#009eaa', '#00ccc0', '#2450a4', '#3690ea', '#51e9f4', '#493ac1', '#6a5cff', '#94b3ff',
        '#811e9f', '#b44ac0', '#e4abff', '#de107f', '#ff3881', '#ff99aa', '#6d482f', '#ffb470'
    ];
    var color = 0x000000, tool = 'brush', showGrid = true;
    function hex(c) { return '#' + ('00000' + c.toString(16)).slice(-6); }
    function fromHex(h) { return parseInt(h.replace('#', ''), 16) & 0xffffff; }

    PALETTE.forEach(function (h, k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'px-sw';
        b.style.background = h;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-label', 'Color ' + h);
        b.setAttribute('aria-checked', k === 0 ? 'true' : 'false');
        b.dataset.color = h;
        b.addEventListener('click', function () { setColor(fromHex(h)); if (tool !== 'brush') setTool('brush'); });
        paletteEl.appendChild(b);
    });
    function setColor(c) {
        color = c;
        currentSw.style.background = hex(c);
        customInput.value = hex(c);
        [].forEach.call(paletteEl.children, function (b) {
            b.setAttribute('aria-checked', fromHex(b.dataset.color) === c ? 'true' : 'false');
        });
        dirty = true;
    }
    customInput.addEventListener('input', function () { setColor(fromHex(customInput.value)); if (tool !== 'brush') setTool('brush'); });

    function setTool(t) {
        tool = t;
        root.setAttribute('data-tool', t);
        [].forEach.call(document.querySelectorAll('[data-tool]'), function (b) {
            if (b === root) return;
            var on = b.getAttribute('data-tool') === t;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        dirty = true;
    }
    [].forEach.call(document.querySelectorAll('.px-tools [data-tool]'), function (b) {
        b.addEventListener('click', function () { setTool(b.getAttribute('data-tool')); });
    });

    /* ---------- Vista: zoom y desplazamiento ---------- */
    var SW = 0, SH = 0, DPR = 1;
    var view = { s: 4, ox: 0, oy: 0 };               // px de pantalla por casilla y posición del lienzo
    var MIN_S = 0.25, MAX_S = 48;
    var fitted = false;

    function resize() {
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        SW = stage.clientWidth; SH = stage.clientHeight;
        cv.width = Math.round(SW * DPR); cv.height = Math.round(SH * DPR);
        if (!fitted) fit(); else clampView();
        dirty = true;
    }
    function fit() {
        var s = Math.min((SW - 32) / W, (SH - 32) / H);
        view.s = Math.max(MIN_S, s);
        view.ox = (SW - W * view.s) / 2;
        view.oy = (SH - H * view.s) / 2;
        fitted = true;
        dirty = true;
    }
    function clampView() {                            // que el lienzo no se pierda fuera de la vista
        var m = 60;
        view.ox = Math.min(SW - m, Math.max(m - W * view.s, view.ox));
        view.oy = Math.min(SH - m, Math.max(m - H * view.s, view.oy));
    }
    function zoomAt(f, px, py) {
        var ns = Math.max(MIN_S, Math.min(MAX_S, view.s * f));
        f = ns / view.s;
        view.ox = px - (px - view.ox) * f;
        view.oy = py - (py - view.oy) * f;
        view.s = ns;
        clampView();
        dirty = true;
    }
    function cellAt(px, py) {
        var x = Math.floor((px - view.ox) / view.s), y = Math.floor((py - view.oy) / view.s);
        return x >= 0 && y >= 0 && x < W && y < H ? { x: x, y: y } : null;
    }

    /* ---------- Dibujo ---------- */
    var hover = null, kbd = null;
    function render() {
        if (dirty) {
            octx.putImageData(img, 0, 0);
            dirty = false;
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            ctx.clearRect(0, 0, SW, SH);
            var w = W * view.s, h = H * view.s;
            // sombra del lienzo
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
            ctx.fillStyle = '#fff'; ctx.fillRect(view.ox, view.oy, w, h);
            ctx.restore();
            ctx.imageSmoothingEnabled = view.s < 1;      // de lejos se suaviza; de cerca, píxeles nítidos
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(off, view.ox, view.oy, w, h);
            // cuadrícula (cuando las casillas se ven grandes)
            if (showGrid && view.s >= 6) {
                var a = Math.min(0.16, (view.s - 6) / 40 + 0.06);
                ctx.beginPath();
                var x0 = Math.max(0, Math.floor(-view.ox / view.s)), x1 = Math.min(W, Math.ceil((SW - view.ox) / view.s));
                var y0 = Math.max(0, Math.floor(-view.oy / view.s)), y1 = Math.min(H, Math.ceil((SH - view.oy) / view.s));
                for (var gx = x0; gx <= x1; gx++) { var X = Math.round(view.ox + gx * view.s) + 0.5; ctx.moveTo(X, view.oy + y0 * view.s); ctx.lineTo(X, view.oy + y1 * view.s); }
                for (var gy = y0; gy <= y1; gy++) { var Y = Math.round(view.oy + gy * view.s) + 0.5; ctx.moveTo(view.ox + x0 * view.s, Y); ctx.lineTo(view.ox + x1 * view.s, Y); }
                ctx.strokeStyle = 'rgba(0,0,0,' + a + ')';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            // borde del lienzo
            ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
            ctx.strokeRect(Math.round(view.ox) - 0.5, Math.round(view.oy) - 0.5, Math.round(w) + 1, Math.round(h) + 1);
            // casilla bajo el ratón: vista previa del color
            var c = kbd || hover;
            if (c && tool !== 'move') {
                var cx = view.ox + c.x * view.s, cy = view.oy + c.y * view.s;
                if (tool === 'brush' || tool === 'eraser') {
                    ctx.fillStyle = hex(tool === 'eraser' ? WHITE : color);
                    ctx.globalAlpha = 0.7; ctx.fillRect(cx, cy, view.s, view.s); ctx.globalAlpha = 1;
                }
                var lw = Math.max(1, Math.min(3, view.s / 8));
                ctx.lineWidth = lw * 2; ctx.strokeStyle = '#fff';
                ctx.strokeRect(cx - lw, cy - lw, view.s + lw * 2, view.s + lw * 2);
                ctx.lineWidth = lw; ctx.strokeStyle = '#111';
                ctx.strokeRect(cx - lw / 2, cy - lw / 2, view.s + lw, view.s + lw);
            }
        }
        requestAnimationFrame(render);
    }

    /* ---------- Pintar y enviar ---------- */
    var queue = new Map();            // índice de casilla (y·W + x) → color pendiente de enviar
    var pending = new Map();          // índice de casilla → color enviado pero sin confirmar
    var strokes = [], stroke = null;  // para deshacer
    var flushTimer = 0, sending = false;

    function paint(x, y, c, record) {
        var prev = getCell(x, y);
        if (prev === c) return;
        if (!spendInk(1)) { noInk(); return; }
        var key = y * W + x;
        if (record && stroke && !stroke.has(key)) stroke.set(key, prev);
        setCellLocal(x, y, c);
        queue.delete(key); queue.set(key, c);
        pending.set(key, c);
        scheduleFlush();
        updateCount();
    }
    function scheduleFlush() { if (!flushTimer) flushTimer = setTimeout(flush, 140); }
    function flush() {
        flushTimer = 0;
        if (sending || !queue.size) { if (queue.size) scheduleFlush(); return; }
        var batch = [], keys = [];
        queue.forEach(function (c, key) {
            if (batch.length >= 256) return;
            batch.push([key % W, (key / W) | 0, c]); keys.push(key);
        });
        keys.forEach(function (k) { queue.delete(k); });
        sending = true;
        fetch(API + 'paint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ pixels: batch })
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) {
                if (r.status === 429) { if (d.ink) setInk(d.ink); throw new Error('ink'); }
                if (!r.ok) throw new Error(r.status);
                return d;
            });
        }).then(function (d) {
            if (d.ink !== undefined) setInk(d.ink);
            batch.forEach(function (b, i) { if (pending.get(keys[i]) === b[2] && !queue.has(keys[i])) pending.delete(keys[i]); });
        }).catch(function (err) {
            toast(err && err.message === 'ink' ? 'Sin tinta suficiente: se ha deshecho lo último que pintaste.' : 'No se ha podido guardar. Recargando el lienzo…');
            queue.clear(); pending.clear();
            setTimeout(loadBoard, 800);
        }).then(function () {
            sending = false;
            if (queue.size) scheduleFlush();
        });
    }

    function beginStroke() { stroke = new Map(); }
    function endStroke() {
        if (stroke && stroke.size) {
            strokes.push(stroke);
            if (strokes.length > 60) strokes.shift();
            undoBtn.disabled = false;
        }
        stroke = null;
    }
    function undo() {
        var s = strokes.pop();
        if (!s) return;
        s.forEach(function (prev, key) { paint(key % W, (key / W) | 0, prev, false); });
        undoBtn.disabled = !strokes.length;
    }
    undoBtn.addEventListener('click', undo);

    function line(a, b, fn) {                         // Bresenham: sin huecos al arrastrar rápido
        var x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y;
        var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
        for (; ;) {
            fn(x0, y0);
            if (x0 === x1 && y0 === y1) break;
            var e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }
    function applyTool(c) {
        if (!c) return;
        if (tool === 'brush') paint(c.x, c.y, color, true);
        else if (tool === 'eraser') paint(c.x, c.y, WHITE, true);
        else if (tool === 'picker') { setColor(getCell(c.x, c.y)); setTool('brush'); }
    }

    /* ---------- Ratón, dedo y pellizco ---------- */
    var ptrs = new Map(), act = null, spaceDown = false;
    function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    cv.addEventListener('pointerdown', function (e) {
        cv.focus({ preventScroll: true });
        hideHint();
        try { cv.setPointerCapture(e.pointerId); } catch (err) { }
        var p = pos(e);
        ptrs.set(e.pointerId, p);
        kbd = null;
        if (ptrs.size === 2) {                        // dos dedos: se cancela el trazo y se mueve / acerca
            if (act && act.type === 'draw') endStroke();
            var q = [].slice.call(ptrs.values());
            act = { type: 'pinch', d: Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y), mx: (q[0].x + q[1].x) / 2, my: (q[0].y + q[1].y) / 2 };
            return;
        }
        if (ptrs.size > 2) return;
        if (e.button === 1 || e.button === 2 || tool === 'move' || spaceDown) {
            act = { type: 'pan', x: p.x, y: p.y };
            root.classList.add('is-dragging');
        } else {
            var c = cellAt(p.x, p.y);
            act = { type: 'draw', last: c };
            beginStroke();
            applyTool(c);
            if (tool === 'picker') act = null;
        }
    });
    cv.addEventListener('pointermove', function (e) {
        var p = pos(e);
        if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
        var c = cellAt(p.x, p.y);
        if (e.pointerType === 'mouse') { hover = c; dirty = true; }
        coordEl.textContent = c ? 'X ' + c.x + ' · Y ' + c.y : '—';
        if (!act) return;
        if (act.type === 'pan') {
            view.ox += p.x - act.x; view.oy += p.y - act.y; act.x = p.x; act.y = p.y;
            clampView(); dirty = true;
        } else if (act.type === 'pinch' && ptrs.size >= 2) {
            var q = [].slice.call(ptrs.values());
            var d = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y), mx = (q[0].x + q[1].x) / 2, my = (q[0].y + q[1].y) / 2;
            view.ox += mx - act.mx; view.oy += my - act.my;
            zoomAt(d / Math.max(1, act.d), mx, my);
            act.d = d; act.mx = mx; act.my = my;
        } else if (act.type === 'draw' && (tool === 'brush' || tool === 'eraser')) {
            if (c && act.last) line(act.last, c, function (x, y) { applyTool({ x: x, y: y }); });
            else applyTool(c);
            if (c) act.last = c;
        }
    });
    function endPointer(e) {
        ptrs.delete(e.pointerId);
        if (act && act.type === 'draw') endStroke();
        if (ptrs.size === 0) { act = null; root.classList.remove('is-dragging'); }
        else if (act && act.type === 'pinch') act = { type: 'pan', x: [].slice.call(ptrs.values())[0].x, y: [].slice.call(ptrs.values())[0].y };
    }
    cv.addEventListener('pointerup', endPointer);
    cv.addEventListener('pointercancel', endPointer);
    cv.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { hover = null; dirty = true; coordEl.textContent = '—'; } });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('wheel', function (e) {
        e.preventDefault();
        hideHint();
        var p = pos(e);
        if (e.ctrlKey || !e.shiftKey && Math.abs(e.deltaX) < Math.abs(e.deltaY) * 0.5 || e.deltaMode) {
            var k = e.deltaMode === 1 ? 40 : 1;
            zoomAt(Math.exp(-e.deltaY * k * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y);
        } else {                                      // trackpad: deslizar mueve el lienzo
            view.ox -= e.deltaX; view.oy -= e.deltaY; clampView(); dirty = true;
        }
    }, { passive: false });

    /* ---------- Teclado ---------- */
    window.addEventListener('keydown', function (e) {
        if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
        var k = e.key;
        if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); undo(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (k === ' ' && document.activeElement === cv) { e.preventDefault(); if (!spaceDown) { spaceDown = true; root.classList.add('is-panning'); } return; }
        var tools = { b: 'brush', e: 'eraser', i: 'picker', m: 'move' };
        if (tools[k.toLowerCase()]) { setTool(tools[k.toLowerCase()]); return; }
        if (k === '+' || k === '=') { zoomAt(1.4, SW / 2, SH / 2); return; }
        if (k === '-' || k === '_') { zoomAt(1 / 1.4, SW / 2, SH / 2); return; }
        if (k === '0') { fit(); return; }
        if (k === 'g' || k === 'G') { toggleGrid(); return; }
        if (document.activeElement !== cv) return;
        var mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
        if (mv) {
            e.preventDefault();
            kbd = kbd || { x: W >> 1, y: H >> 1 };
            kbd = { x: Math.max(0, Math.min(W - 1, kbd.x + mv[0])), y: Math.max(0, Math.min(H - 1, kbd.y + mv[1])) };
            coordEl.textContent = 'X ' + kbd.x + ' · Y ' + kbd.y;
            // que la casilla no se salga de la vista
            var sx = view.ox + kbd.x * view.s, sy = view.oy + kbd.y * view.s;
            if (sx < 20) view.ox += 20 - sx; if (sx > SW - 20 - view.s) view.ox -= sx - (SW - 20 - view.s);
            if (sy < 20) view.oy += 20 - sy; if (sy > SH - 20 - view.s) view.oy -= sy - (SH - 20 - view.s);
            dirty = true;
        } else if (k === 'Enter' && kbd) {
            e.preventDefault();
            beginStroke(); applyTool(kbd); endStroke();
        }
    });
    window.addEventListener('keyup', function (e) { if (e.key === ' ') { spaceDown = false; root.classList.remove('is-panning'); } });
    cv.addEventListener('blur', function () { kbd = null; dirty = true; });

    /* ---------- Botones ---------- */
    document.getElementById('px-zoom-in').addEventListener('click', function () { zoomAt(1.5, SW / 2, SH / 2); });
    document.getElementById('px-zoom-out').addEventListener('click', function () { zoomAt(1 / 1.5, SW / 2, SH / 2); });
    document.getElementById('px-fit').addEventListener('click', fit);
    function toggleGrid() {
        showGrid = !showGrid;
        gridBtn.setAttribute('aria-pressed', showGrid ? 'true' : 'false');
        dirty = true;
    }
    gridBtn.addEventListener('click', toggleGrid);
    document.getElementById('px-download').addEventListener('click', function () {
        var k = Math.max(1, Math.floor(2048 / W)), c = document.createElement('canvas');
        c.width = W * k; c.height = H * k;
        var g = c.getContext('2d'); g.imageSmoothingEnabled = false;
        octx.putImageData(img, 0, 0);
        g.drawImage(off, 0, 0, c.width, c.height);
        c.toBlob(function (blob) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'pixel-art.png';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        });
    });

    /* ---------- Avisos y datos ---------- */
    var toastT = 0;
    function toast(msg) {
        toastEl.textContent = msg; toastEl.classList.add('show');
        clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
    }
    var hintT = setTimeout(hideHint, 9000);
    function hideHint() { clearTimeout(hintT); hint.classList.add('is-gone'); }
    var countT = 0;
    function updateCount() {
        if (countT) return;
        countT = setTimeout(function () {
            countT = 0;
            var n = 0;
            for (var i = 0; i < cells.length; i++) if (cells[i] !== WHITE) n++;
            countEl.textContent = n.toLocaleString('es-ES');
        }, 200);
    }
    function setLive(ok) { liveEl.classList.toggle('is-off', !ok); liveEl.lastChild.nodeValue = ok ? ' En directo' : ' Reconectando…'; }

    /* ---------- Sincronización con el servidor ---------- */
    // la frecuencia se adapta: cada 1,5 s si hay actividad; si nadie pinta, se va
    // alargando hasta 10 s (y vuelve a 1,5 s en cuanto alguien pinta o tú interactúas)
    var POLL_MIN = 1500, POLL_MAX = 10000;
    var since = 0, polling = false, pollT = 0, pollEvery = POLL_MIN;
    function wake() {
        if (pollEvery === POLL_MIN) return;
        pollEvery = POLL_MIN;
        if (!polling) { clearTimeout(pollT); pollT = setTimeout(poll, 300); }
    }
    function decodePng(b64) {                          // PNG → bytes RGBA
        return new Promise(function (ok, ko) {
            var im = new Image();
            im.onload = function () {
                var c = document.createElement('canvas'); c.width = W; c.height = H;
                var g = c.getContext('2d', { willReadFrequently: true });
                g.drawImage(im, 0, 0);
                ok(g.getImageData(0, 0, W, H).data);
            };
            im.onerror = ko;
            im.src = 'data:image/png;base64,' + b64;
        });
    }
    function loadBoard() {
        var last = 0;
        return fetch(API + 'board', { headers: { 'Accept': 'application/json' } }).then(function (r) {
            if (!r.ok) throw new Error(r.status);
            return r.json();
        }).then(function (b) {
            last = b.last;
            setInk(b.ink);
            return decodePng(b.png);
        }).then(function (data) {
            for (var i = 0, n = W * H; i < n; i++) {
                if (pending.size && pending.has(i)) continue;      // lo que acabo de pintar manda
                var j = i * 4;
                cells[i] = (data[j] << 16) | (data[j + 1] << 8) | data[j + 2];
                pix[j] = data[j]; pix[j + 1] = data[j + 1]; pix[j + 2] = data[j + 2]; pix[j + 3] = 255;
            }
            dirty = true;
            since = last;
            loading.classList.add('is-done');
            setLive(true);
            updateCount();
        }).catch(function () {
            setLive(false);
            loading.lastChild.nodeValue = ' No se ha podido cargar el lienzo. Reintentando…';
            setTimeout(loadBoard, 3000);
        });
    }
    function poll() {
        clearTimeout(pollT);
        if (polling || document.hidden) return;
        polling = true;
        fetch(API + 'changes?since=' + since, { headers: { 'Accept': 'application/json' } }).then(function (r) {
            if (!r.ok) throw new Error(r.status);
            return r.json();
        }).then(function (d) {
            setLive(true);
            if (d.reset) return loadBoard();
            var got = d.changes && d.changes.length;
            pollEvery = got ? POLL_MIN : Math.min(POLL_MAX, Math.round(pollEvery * 1.4));
            (d.changes || []).forEach(function (ch) {
                if (ch[0] < 0 || ch[1] < 0 || ch[0] >= W || ch[1] >= H) return;
                if (pending.has(ch[1] * W + ch[0])) return;
                if (getCell(ch[0], ch[1]) !== ch[2]) setCellLocal(ch[0], ch[1], ch[2]);
            });
            if (d.changes && d.changes.length) updateCount();
            since = d.last;
        }).catch(function () { setLive(false); }).then(function () {
            polling = false;
            pollT = setTimeout(poll, pollEvery);
        });
    }
    // si tú pintas o te mueves por el lienzo, se vuelve a mirar a menudo
    cv.addEventListener('pointerdown', wake);
    cv.addEventListener('wheel', wake, { passive: true });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { pollEvery = POLL_MIN; poll(); } });

    /* ---------- Arranque ---------- */
    pix.fill(255);
    setColor(0x000000);
    setTool('brush');
    resize();
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    requestAnimationFrame(render);
    loadBoard().then(function () { pollT = setTimeout(poll, 1500); });
})();
