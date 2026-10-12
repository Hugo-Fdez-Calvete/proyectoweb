(function () {
    var root = document.querySelector('.home');
    if (!root) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var hero = root.querySelector('.hm-hero');

    /* ---------------- Tema claro / oscuro ---------------- */
    var btn = root.querySelector('.hm-theme');
    var btnLabel = root.querySelector('.hm-theme-label');
    var acc = '34,211,238', sec = '99,102,241';

    function readColors() {
        var s = getComputedStyle(root);
        acc = s.getPropertyValue('--hm-acc-rgb').trim().replace(/\s+/g, ',');
        sec = s.getPropertyValue('--hm-sec-rgb').trim().replace(/\s+/g, ',');
    }
    function applyTheme(t, save) {
        root.setAttribute('data-theme', t);
        var txt = t === 'light' ? 'Modo oscuro' : 'Modo claro';
        btn.setAttribute('aria-label', txt);
        btnLabel.textContent = txt;
        if (save) { try { localStorage.setItem('hf-theme', t); } catch (e) { } }
        readColors();
    }
    btn.addEventListener('click', function () {
        applyTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true);
    });
    applyTheme(root.getAttribute('data-theme'), false);

    /* ---------------- Terminal de arranque ---------------- */
    var term = root.querySelector('.hm-term');
    var rows = [].slice.call(root.querySelectorAll('.hm-term .hm-row')).map(function (row) {
        var txt = row.querySelector('.hm-txt');
        return { row: row, txt: txt, ok: row.querySelector('.hm-ok'), text: txt.textContent };
    });

    if (!reduce) {
        rows.forEach(function (r) { r.txt.textContent = ''; });
        var ri = 0;
        var nextRow = function () {
            if (ri >= rows.length) { term.classList.add('ready'); return; }
            var r = rows[ri++], ci = 0;
            r.row.classList.add('show');
            (function step() {
                if (ci <= r.text.length) {
                    r.txt.textContent = r.text.slice(0, ci++);
                    setTimeout(step, r.ok ? 18 : 30);
                } else {
                    if (r.ok) r.ok.classList.add('on');
                    setTimeout(nextRow, r.ok ? 240 : 0);
                }
            })();
        };
        setTimeout(nextRow, 1300);
    } else {
        term.classList.add('ready');
    }

    /* ---------------- Red de partículas ---------------- */
    var cv = root.querySelector('.hm-canvas');
    var ctx = cv.getContext('2d');
    var W = 0, H = 0, pts = [], mouse = { x: -9999, y: -9999 }, raf = 0, visible = true;

    function resize() {
        var r = hero.getBoundingClientRect();
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = r.width; H = r.height;
        cv.width = W * dpr; cv.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var n = Math.round(Math.min(95, (W * H) / 14000));
        pts = [];
        for (var i = 0; i < n; i++) {
            pts.push({
                x: Math.random() * W, y: Math.random() * H,
                vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
                r: Math.random() * 1.4 + .7, c: Math.random() < .25 ? 1 : 0
            });
        }
    }

    function draw(move) {
        ctx.clearRect(0, 0, W, H);
        var LINK = 130, MLINK = 180, i, j, p, q, dx, dy, d, a;

        for (i = 0; i < pts.length; i++) {
            p = pts[i];
            if (move) {
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0 || p.x > W) p.vx *= -1;
                if (p.y < 0 || p.y > H) p.vy *= -1;
                dx = mouse.x - p.x; dy = mouse.y - p.y; d = Math.sqrt(dx * dx + dy * dy);
                if (d < MLINK && d > 1) { p.x += dx / d * .35; p.y += dy / d * .35; }
            }
            for (j = i + 1; j < pts.length; j++) {
                q = pts[j];
                dx = p.x - q.x; dy = p.y - q.y; d = Math.sqrt(dx * dx + dy * dy);
                if (d < LINK) {
                    a = (1 - d / LINK) * .35;
                    ctx.strokeStyle = 'rgba(' + acc + ',' + a + ')';
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
                }
            }
            dx = mouse.x - p.x; dy = mouse.y - p.y; d = Math.sqrt(dx * dx + dy * dy);
            if (d < MLINK) {
                a = (1 - d / MLINK) * .8;
                ctx.strokeStyle = 'rgba(' + sec + ',' + a + ')';
                ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
            }
            ctx.fillStyle = 'rgba(' + (p.c ? sec : acc) + ',.85)';
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
        }
    }

    function loop() {
        if (!visible || document.hidden) { raf = 0; return; }
        draw(true);
        raf = requestAnimationFrame(loop);
    }
    function start() { if (!raf && !reduce) raf = requestAnimationFrame(loop); }

    resize();
    if (reduce) { draw(false); } else { start(); }

    var rt;
    window.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(function () { resize(); if (reduce) draw(false); }, 150);
    });
    hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    hero.addEventListener('pointerleave', function () { mouse.x = mouse.y = -9999; });
    document.addEventListener('visibilitychange', start);
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
            visible = es[0].isIntersecting;
            if (visible) start();
        }).observe(hero);
    }

    /* ---------------- Tarjetas: encendido + foco de luz ---------------- */
    var cards = [].slice.call(root.querySelectorAll('.hm-card'));

    if (reduce || !('IntersectionObserver' in window)) {
        cards.forEach(function (c) { c.classList.add('in'); });
    } else {
        var io = new IntersectionObserver(function (es) {
            es.forEach(function (e) {
                if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
            });
        }, { threshold: .15 });
        cards.forEach(function (c) { io.observe(c); });
    }

    cards.forEach(function (c) {
        c.addEventListener('pointermove', function (e) {
            var r = c.getBoundingClientRect();
            c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
            c.style.setProperty('--my', (e.clientY - r.top) + 'px');
        });
        c.addEventListener('pointerleave', function () {
            c.style.setProperty('--mx', '-999px');
            c.style.setProperty('--my', '-999px');
        });
    });

    /* Scroll suave al ancla de módulos */
    var go = root.querySelector('a[href="#modulos"]');
    if (go) go.addEventListener('click', function (e) {
        e.preventDefault();
        document.getElementById('modulos').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    });
})();