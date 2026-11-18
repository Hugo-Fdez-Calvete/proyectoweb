(function () {
    var root = document.querySelector('.home');
    if (!root) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------------- Tema claro / oscuro ---------------- */
    var acc = [34, 211, 238], sec = [99, 102, 241], light = false;

    function rgbVar(s, name, def) {
        var v = s.getPropertyValue(name).trim().split(/[\s,]+/).map(Number);
        return v.length === 3 && !v.some(isNaN) ? v : def;
    }
    function readColors() {
        var s = getComputedStyle(root);
        acc = rgbVar(s, '--hm-acc-rgb', acc);
        sec = rgbVar(s, '--hm-sec-rgb', sec);
        light = document.documentElement.getAttribute('data-theme') === 'light';
        sprites = {};
        if (neb) neb.colors();
    }

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
        setTimeout(nextRow, 1100);
    } else {
        term.classList.add('ready');
    }

    /* ============================================================
       FONDO ESPACIAL
       1) Nebulosa en WebGL (misma familia que el visualizador de Pulso)
       2) Estrellas lejanas + puntos de colores que siguen al ratón,
          cada uno con su tamaño y su velocidad (sin líneas)
       ============================================================ */
    var space = root.querySelector('.hm-space');
    var nebCv = space.querySelector('.hm-neb');
    var dotCv = space.querySelector('.hm-dots');
    var dctx = dotCv.getContext('2d');
    var W = 0, H = 0, DPR = 1;
    var stars = [], dots = [], sprites = {};
    var mouse = { x: -9999, y: -9999, on: false };
    var scrollY = window.scrollY || 0;
    var t0 = performance.now(), last = t0, running = false, inView = true;

    /* ---------- 1) Nebulosa ---------- */
    var neb = (function () {
        var gl = null;
        try { gl = nebCv.getContext('webgl', { antialias: false, alpha: false, depth: false }); } catch (e) { }
        if (!gl) { root.classList.add('hm-nogl'); return null; }

        var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
        var FS = [
            'precision mediump float;',
            'uniform vec2 uRes;uniform float uTime,uScroll,uLight;',
            'uniform vec3 uBase,uBaseL,uAcc,uSec;',
            'float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
            'float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);',
            ' return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}',
            'float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);',
            ' for(int i=0;i<5;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}',
            'void main(){',
            ' float mn=min(uRes.x,uRes.y);',
            ' vec2 p=(gl_FragCoord.xy-.5*uRes)/mn;',
            ' vec2 p0=p; p.y-=uScroll;',
            ' float t=uTime*.018;',
            ' vec2 q=vec2(fbm(p*1.1+vec2(0.,t)),fbm(p*1.1+vec2(5.2,-t)));',
            ' vec2 r=vec2(fbm(p*1.1+3.*q+vec2(1.7,9.2)+.6*t),fbm(p*1.1+3.*q+vec2(8.3,2.8)-.4*t));',
            ' float f=fbm(p*1.2+3.2*r);',
            ' vec3 c=uBase;',
            ' c=mix(c,uSec*.42,smoothstep(.38,1.,f));',
            ' c=mix(c,uAcc*.34,smoothstep(.62,1.2,length(q))*.9);',
            ' c+=uSec*.16*pow(smoothstep(.45,.95,r.y),2.);',
            ' c*=.45+.75*smoothstep(.15,.85,f);',            /* polvo oscuro entre las nubes */
            ' c*=1.-.5*smoothstep(.5,1.25,length(p0*vec2(.85,1.)));',
            ' c+=(h(gl_FragCoord.xy+fract(uTime)*91.)-.5)*.018;',
            ' if(uLight>.5){vec3 g=max(c-uBase,0.);float m=max(max(g.r,g.g),g.b);',
            '  c=mix(uBaseL,(g/max(m,1e-3))*.6,clamp(m*1.3,0.,.55));}',
            ' gl_FragColor=vec4(c,1.);',
            '}'
        ].join('\n');

        function sh(type, src) {
            var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
            return s;
        }
        var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
        if (!vs || !fs) { root.classList.add('hm-nogl'); return null; }
        var pr = gl.createProgram();
        gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr); gl.useProgram(pr);
        var b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(pr, 'a');
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        var U = {};
        ['uRes', 'uTime', 'uScroll', 'uLight', 'uBase', 'uBaseL', 'uAcc', 'uSec'].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });
        var scale = 0.55;

        return {
            colors: function () {
                gl.uniform3f(U.uBase, 4 / 255, 6 / 255, 14 / 255);
                gl.uniform3f(U.uBaseL, 238 / 255, 243 / 255, 251 / 255);
                gl.uniform3f(U.uAcc, acc[0] / 255, acc[1] / 255, acc[2] / 255);
                gl.uniform3f(U.uSec, sec[0] / 255, sec[1] / 255, sec[2] / 255);
                gl.uniform1f(U.uLight, light ? 1 : 0);
            },
            resize: function () {
                nebCv.width = Math.max(1, Math.round(W * scale));
                nebCv.height = Math.max(1, Math.round(H * scale));
                gl.viewport(0, 0, nebCv.width, nebCv.height);
                gl.uniform2f(U.uRes, nebCv.width, nebCv.height);
            },
            draw: function (time) {
                gl.uniform1f(U.uTime, time);
                gl.uniform1f(U.uScroll, scrollY / Math.max(1, Math.min(W, H)) * 0.12);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }
        };
    })();

    /* ---------- 2) Estrellas y puntos ---------- */
    function sprite(rgb, r) {
        // punto con halo, prerrenderizado (mucho más barato que shadowBlur)
        var key = rgb.join(',') + '|' + r + '|' + (light ? 1 : 0);
        if (sprites[key]) return sprites[key];
        var s = Math.ceil(r * 6), c = document.createElement('canvas');
        c.width = c.height = s * 2;
        var g = c.getContext('2d'), gr = g.createRadialGradient(s, s, 0, s, s, s);
        var col = 'rgba(' + rgb.join(',') + ',';
        gr.addColorStop(0, col + '1)');
        gr.addColorStop(r / s * 0.9, col + (light ? '.9)' : '.95)'));
        gr.addColorStop(r / s * 2.2, col + (light ? '.12)' : '.22)'));
        gr.addColorStop(1, col + '0)');
        g.fillStyle = gr; g.fillRect(0, 0, s * 2, s * 2);
        return (sprites[key] = c);
    }

    function seed() {
        var area = W * H;
        stars = [];
        var ns = Math.round(Math.min(420, area / 4200));
        for (var i = 0; i < ns; i++) {
            stars.push({
                x: Math.random() * W, y: Math.random() * H,
                r: Math.random() < 0.92 ? Math.random() * 0.8 + 0.3 : Math.random() * 0.9 + 1,
                a: Math.random() * 0.6 + 0.25,
                tw: Math.random() < 0.35 ? Math.random() * 2 + 0.5 : 0,   // parpadeo
                ph: Math.random() * 6.28,
                z: Math.random() * 0.25 + 0.05                         // muy lejos: casi no se mueven
            });
        }
        dots = [];
        var nd = Math.round(Math.min(150, area / 11000));
        for (var j = 0; j < nd; j++) {
            var z = Math.pow(Math.random(), 1.6);                    // la mayoría pequeños y lejanos
            var sp = (0.12 + z * 0.6) * (0.6 + Math.random() * 0.8);
            var ang = Math.random() * 6.2832;
            dots.push({
                x: Math.random() * W, y: Math.random() * H,
                z: z,
                r: 0.6 + z * 2.6 + (Math.random() < 0.06 ? 1.4 : 0),   // tamaños distintos
                vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,      // velocidades distintas
                bx: Math.cos(ang) * sp, by: Math.sin(ang) * sp,
                follow: 0.25 + Math.random() * 1.1,                  // qué ganas tiene de seguir al ratón
                c: Math.random() < 0.28 ? 1 : 0,
                ph: Math.random() * 6.28
            });
        }
    }

    function resize() {
        W = window.innerWidth; H = window.innerHeight;
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        dotCv.width = Math.round(W * DPR); dotCv.height = Math.round(H * DPR);
        dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        if (neb) neb.resize();
        seed();
    }

    function drawDots(dt, time, move) {
        dctx.clearRect(0, 0, W, H);
        var k = dt * 60, i, p, dx, dy, d, R, f;

        // estrellas lejanas (parallax muy suave con el scroll)
        dctx.fillStyle = light ? 'rgba(40,60,110,1)' : 'rgba(225,235,255,1)';
        for (i = 0; i < stars.length; i++) {
            p = stars[i];
            var sy = ((p.y - scrollY * p.z) % H + H) % H;
            var al = p.a * (p.tw ? 0.55 + 0.45 * Math.sin(time * p.tw + p.ph) : 1);
            dctx.globalAlpha = light ? al * 0.35 : al;
            dctx.fillRect(p.x, sy, p.r, p.r);
        }
        dctx.globalAlpha = 1;
        dctx.globalCompositeOperation = light ? 'source-over' : 'lighter';

        for (i = 0; i < dots.length; i++) {
            p = dots[i];
            if (move) {
                // posición en pantalla con parallax de scroll según la profundidad
                var py = p.y - scrollY * (0.08 + p.z * 0.35);
                py = ((py % H) + H) % H;
                if (mouse.on) {
                    dx = mouse.x - p.x; dy = mouse.y - py;
                    d = Math.sqrt(dx * dx + dy * dy);
                    R = 160 + p.z * 140;
                    if (d < R && d > 0.01) {
                        f = (1 - d / R) * p.follow * 0.09 * k;
                        // se acercan girando un poco, y no se amontonan encima del cursor
                        var push = d < 26 ? -0.6 : 1;
                        p.vx += (dx / d * push - dy / d * 0.35) * f;
                        p.vy += (dy / d * push + dx / d * 0.35) * f;
                    }
                }
                // vuelven poco a poco a su deriva natural
                p.vx += (p.bx - p.vx) * 0.02 * k;
                p.vy += (p.by - p.vy) * 0.02 * k;
                var max = 1.2 + p.follow * 2.2;
                var v = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                if (v > max) { p.vx *= max / v; p.vy *= max / v; }
                p.x += p.vx * k; p.y += p.vy * k;
                if (p.x < -10) p.x += W + 20; else if (p.x > W + 10) p.x -= W + 20;
                if (p.y < -10) p.y += H + 20; else if (p.y > H + 10) p.y -= H + 20;
            }
            var y = p.y - scrollY * (0.08 + p.z * 0.35);
            y = ((y % H) + H) % H;
            var img = sprite(p.c ? sec : acc, Math.round(p.r * 2) / 2);
            var s = img.width / 2;
            dctx.globalAlpha = (0.55 + 0.45 * p.z) * (0.8 + 0.2 * Math.sin(time * 1.3 + p.ph));
            dctx.drawImage(img, p.x - s, y - s);
        }
        dctx.globalAlpha = 1;
        dctx.globalCompositeOperation = 'source-over';
    }

    function frame(now) {
        if (!running) return;
        var dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        var time = (now - t0) / 1000;
        if (neb) neb.draw(time);
        drawDots(dt, time, true);
        requestAnimationFrame(frame);
    }
    function start() {
        if (running || reduce || document.hidden || !inView) return;
        running = true; last = performance.now();
        requestAnimationFrame(frame);
    }
    function stop() { running = false; }

    readColors();
    resize();
    if (reduce) { if (neb) neb.draw(20); drawDots(0, 0, false); } else start();

    document.addEventListener('hf-themechange', function () {
        readColors();
        if (reduce) { if (neb) neb.draw(20); drawDots(0, 0, false); }
    });

    var rt;
    window.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(function () { resize(); if (reduce) { if (neb) neb.draw(20); drawDots(0, 0, false); } }, 150);
    });
    window.addEventListener('scroll', function () { scrollY = window.scrollY || 0; }, { passive: true });
    window.addEventListener('pointermove', function (e) {
        mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true;
    }, { passive: true });
    document.addEventListener('pointerleave', function () { mouse.on = false; });
    window.addEventListener('blur', function () { mouse.on = false; });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    if ('IntersectionObserver' in window) {
        // solo se anima mientras la portada está en pantalla
        new IntersectionObserver(function (es) {
            inView = es[0].isIntersecting;
            if (inView) start(); else stop();
        }).observe(root);
    }

    /* ---------------- Tarjetas: aparición + foco de luz ---------------- */
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

    /* ============================================================
       EFECTOS CREATIVOS (inspirados en Studio Size y Waaark)
       ============================================================ */
    var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    /* ---------- 1. Cursor propio con etiqueta ---------- */
    var cursor = root.querySelector('.hm-cursor');
    if (cursor && fine && !reduce) (function () {
        root.classList.add('has-cursor');
        // fuera de .home (que recorta y crea su propia capa) para que quede por encima de todo
        document.body.appendChild(cursor);
        cursor.classList.add('is-on');
        var dot = cursor.querySelector('.hm-cursor-dot');
        var ring = cursor.querySelector('.hm-cursor-ring');
        var label = cursor.querySelector('.hm-cursor-label');
        var cx = -100, cy = -100, rx = -100, ry = -100;

        cards.forEach(function (c) { if (c.tagName === 'A') c.setAttribute('data-cursor', 'Abrir'); });

        window.addEventListener('pointermove', function (e) {
            if (e.pointerType !== 'mouse') return;
            cx = e.clientX; cy = e.clientY;
            dot.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';
        }, { passive: true });

        // al hacer clic o mantener pulsado se quitan el círculo y la etiqueta y queda
        // solo el punto, hasta que el ratón pasa a otro elemento.
        // Se aplica con estilos en línea (además de la clase) para que ninguna
        // regla de CSS ni una hoja antigua en caché pueda dejar el círculo visible.
        var pressedOn = null, held = false, pressed = false;
        function setPressed(on) {
            if (on === pressed) return;
            pressed = on;
            cursor.classList.toggle('is-down', on);
            ring.style.opacity = on ? '0' : '';
            ring.style.visibility = on ? 'hidden' : '';
            dot.style.opacity = on ? '1' : '';
        }
        function actionTarget(el) { return el && el.closest ? el.closest('[data-cursor], a, button') : null; }
        document.addEventListener('pointerover', function (e) {
            var inside = (root.contains(e.target) || cursor.contains(e.target)) && !e.target.closest('.wrapper, .hf-menu-btn, .hf-menu-panel, .hf-theme-toggle');
            cursor.classList.toggle('is-in', inside);
            if (!inside) return;
            var t = actionTarget(e.target);
            if (pressedOn && t !== pressedOn && !held) { pressedOn = null; setPressed(false); }
            var txt = t && t.getAttribute('data-cursor');
            cursor.classList.toggle('is-label', !!txt);
            cursor.classList.toggle('is-link', !!t && !txt);
            if (txt) label.textContent = txt;
        });
        document.addEventListener('pointerleave', function () { cursor.classList.remove('is-in'); });
        function down(e) {
            if (e.button && e.button !== 0) return;
            held = true;
            pressedOn = actionTarget(e.target) || root;
            cursor.classList.add('is-held');
            setPressed(true);
        }
        function up() { held = false; cursor.classList.remove('is-held'); }
        // en fase de captura y en window y document: ningún otro manejador puede impedir que llegue
        ['pointerdown', 'mousedown'].forEach(function (ev) {
            window.addEventListener(ev, down, true);
            document.addEventListener(ev, down, true);
        });
        ['pointerup', 'mouseup', 'pointercancel'].forEach(function (ev) {
            window.addEventListener(ev, up, true);
        });
        window.addEventListener('blur', function () { up(); pressedOn = null; setPressed(false); });
        // si se suelta sobre la zona libre de la portada, el círculo vuelve al mover el ratón
        window.addEventListener('pointermove', function (e) {
            if (pressedOn === root && !held && !actionTarget(e.target)) { pressedOn = null; setPressed(false); }
        }, { passive: true });

        (function loop() {
            requestAnimationFrame(loop);
            // el anillo va un poco por detrás; pulsado, se pega al puntero
            var k = held ? 0.6 : 0.2;
            rx += (cx - rx) * k; ry += (cy - ry) * k;
            ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
        })();
    })();

    /* ---------- 2. Botones magnéticos ---------- */
    if (fine && !reduce) {
        [].forEach.call(root.querySelectorAll('.hm-btn, .hm-play-reset'), function (btn) {
            btn.addEventListener('pointermove', function (e) {
                var r = btn.getBoundingClientRect();
                var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
                btn.style.transition = 'transform .15s ease-out';
                btn.style.transform = 'translate(' + (dx * 0.18).toFixed(1) + 'px,' + (dy * 0.32).toFixed(1) + 'px)';
            });
            btn.addEventListener('pointerleave', function () {
                btn.style.transition = 'transform .6s cubic-bezier(.2,1.6,.4,1)';   // vuelve con un pequeño rebote
                btn.style.transform = '';
            });
        });
    }

    /* ---------- 3. El título reacciona al ratón (cada palabra a una profundidad) ---------- */
    var title = root.querySelector('.hm-title');
    if (title && fine && !reduce) (function () {
        var words = [].slice.call(title.querySelectorAll('.w'));
        var depth = words.map(function (_, i) { return 0.35 + ((i * 7) % 5) * 0.22; });
        var tx = 0, ty = 0, x = 0, y = 0, active = false;
        window.addEventListener('pointermove', function (e) {
            var r = title.getBoundingClientRect();
            if (r.bottom < 0 || r.top > window.innerHeight) return;
            tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
            ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
            if (!active) { active = true; requestAnimationFrame(step); }
        }, { passive: true });
        function step() {
            x += (tx - x) * 0.08; y += (ty - y) * 0.08;
            title.style.transform = 'rotateY(' + (x * 7).toFixed(2) + 'deg) rotateX(' + (-y * 6).toFixed(2) + 'deg)';
            words.forEach(function (w, i) {
                w.style.transform = 'translate3d(' + (x * depth[i] * 16).toFixed(1) + 'px,' + (y * depth[i] * 10).toFixed(1) + 'px,0)';
            });
            if (Math.abs(tx - x) + Math.abs(ty - y) > 0.002) requestAnimationFrame(step); else active = false;
        }
    })();

    /* ---------- 4. Letras que se descifran al pasar por las tarjetas ---------- */
    var GLYPHS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789#%&*+/<>';
    function scramble(el) {
        if (el._busy || reduce) return;
        var orig = el._orig || (el._orig = el.textContent);
        var frame = 0, total = 22;
        el._busy = true;
        (function tick() {
            var out = '', done = frame / total * orig.length;
            for (var i = 0; i < orig.length; i++) {
                var ch = orig[i];
                out += (ch === ' ' || i < done) ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
            }
            el.textContent = out;
            if (frame++ < total) setTimeout(tick, 28);
            else { el.textContent = orig; el._busy = false; }
        })();
    }
    cards.forEach(function (c) {
        var h = c.querySelector('h3');
        if (h) c.addEventListener('pointerenter', function () { scramble(h); });
    });

    /* ---------- 5. Banda de texto: sola, con el scroll y arrastrable ---------- */
    var mq = root.querySelector('.hm-marquee');
    if (mq) (function () {
        var mtrack = mq.querySelector('.hm-mq-track'), group = mtrack.querySelector('.hm-mq-group');
        var gw = 0, x = 0, dir = -1, boost = 0, drag = null, fling = 0, lastScroll = window.scrollY, visible = true;
        function fill() {
            while (mtrack.children.length > 1) mtrack.removeChild(mtrack.lastChild);
            gw = group.offsetWidth || 1;
            var n = Math.max(2, Math.ceil(window.innerWidth * 2 / gw) + 1);
            for (var i = 1; i < n; i++) mtrack.appendChild(group.cloneNode(true));
        }
        fill();
        window.addEventListener('resize', fill);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fill);

        window.addEventListener('scroll', function () {
            var dy = window.scrollY - lastScroll;
            lastScroll = window.scrollY;
            if (dy) dir = dy > 0 ? -1 : 1;                 // cambia de sentido con el scroll
            boost = Math.max(-1600, Math.min(1600, boost + dy * 9));
        }, { passive: true });

        mq.addEventListener('pointerdown', function (e) {
            drag = { x: e.clientX, t: performance.now() };
            fling = 0;
            mq.classList.add('is-drag');
            mq.setPointerCapture(e.pointerId);
        });
        mq.addEventListener('pointermove', function (e) {
            if (!drag) return;
            var now = performance.now(), dx = e.clientX - drag.x;
            x += dx;
            fling = dx / Math.max(8, now - drag.t) * 1000;
            drag.x = e.clientX; drag.t = now;
        });
        function end() { if (drag) { drag = null; mq.classList.remove('is-drag'); } }
        mq.addEventListener('pointerup', end);
        mq.addEventListener('pointercancel', end);

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(mq);
        }
        var last = performance.now();
        (function loop(now) {
            requestAnimationFrame(loop);
            var dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (!visible || document.hidden) return;
            var v = 0;
            if (!drag) {
                // al bajar va hacia la izquierda y acelera; al subir, al revés
                v = reduce ? fling : dir * 70 - boost * 0.35 + fling;
                x += v * dt;
                fling *= Math.pow(0.05, dt);
                boost *= Math.pow(0.08, dt);
            } else v = fling;
            x = ((x % gw) - gw) % gw;                      // bucle infinito
            var skew = Math.max(-12, Math.min(12, v * -0.012));
            mtrack.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0) skewX(' + skew.toFixed(2) + 'deg)';
        })(last);
    })();

    /* ---------- 6. Zona con física: coger y lanzar las tecnologías ---------- */
    var box = root.querySelector('.hm-play-box');
    if (box) (function () {
        var cv = box.querySelector('.hm-play-cv'), g = cv.getContext('2d');
        var names = [];
        try { names = JSON.parse(document.getElementById('hm-play-data').textContent) || []; } catch (e) { }
        if (!names.length) { box.hidden = true; return; }
        var W = 0, H = 0, DPR = 1, bodies = [], grab = null, started = false, visible = false;
        var ptr = { x: 0, y: 0, vx: 0, vy: 0, t: 0 };
        var GRAV = 1500, REST = 0.42;

        function font(sz) { return '700 ' + sz + 'px "Chakra Petch", "Segoe UI", sans-serif'; }
        function resize() {
            var r = box.getBoundingClientRect();
            W = r.width; H = r.height;
            DPR = Math.min(window.devicePixelRatio || 1, 2);
            cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
            g.setTransform(DPR, 0, 0, DPR, 0, 0);
        }
        function spawn() {
            resize();
            var sz = W < 560 ? 12 : 15;
            g.font = font(sz);
            bodies = names.map(function (n, i) {
                var tw = g.measureText(n).width, pad = W < 560 ? 10 : 14;
                var maxR = W < 560 ? 44 : 58;
                var r = Math.max(W < 560 ? 26 : 34, Math.min(maxR, tw / 2 + pad));
                // los nombres largos encogen la letra en vez de inflar la burbuja
                var fs = Math.max(9, Math.floor(sz * Math.min(1, (r - pad) * 2 / tw)));
                return {
                    label: n, sz: fs, r: r, m: r * r,
                    x: r + Math.random() * (W - 2 * r),
                    y: -r - i * 55 - Math.random() * 40,
                    vx: (Math.random() - 0.5) * 120, vy: 0,
                    c: i % 3 === 2 ? 1 : 0, rot: 0, in: false
                };
            });
        }

        function step(dt) {
            var i, j, b, o;
            for (i = 0; i < bodies.length; i++) {
                b = bodies[i];
                if (b === grab) continue;
                b.vy += GRAV * dt;
                b.vx *= Math.pow(0.6, dt);                     // rozamiento con el aire
                b.x += b.vx * dt; b.y += b.vy * dt;
                if (b.y - b.r > 0) b.in = true;
                // paredes
                if (b.y + b.r > H) { b.y = H - b.r; if (b.vy > 0) b.vy *= -REST; b.vx *= 0.96; }
                if (b.x - b.r < 0) { b.x = b.r; if (b.vx < 0) b.vx *= -REST; }
                if (b.x + b.r > W) { b.x = W - b.r; if (b.vx > 0) b.vx *= -REST; }
                if (b.in && b.y - b.r < 0) { b.y = b.r; if (b.vy < 0) b.vy *= -REST; }
                b.rot += b.vx * dt * 0.01;
            }
            // choques entre burbujas
            for (i = 0; i < bodies.length; i++) {
                for (j = i + 1; j < bodies.length; j++) {
                    b = bodies[i]; o = bodies[j];
                    var dx = o.x - b.x, dy = o.y - b.y, rr = b.r + o.r, d2 = dx * dx + dy * dy;
                    if (d2 >= rr * rr || d2 === 0) continue;
                    var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, over = rr - d;
                    var ib = b === grab ? 0 : 1 / b.m, io = o === grab ? 0 : 1 / o.m, sum = ib + io;
                    if (!sum) continue;
                    b.x -= nx * over * ib / sum; b.y -= ny * over * ib / sum;
                    o.x += nx * over * io / sum; o.y += ny * over * io / sum;
                    var rv = (o.vx - b.vx) * nx + (o.vy - b.vy) * ny;
                    if (rv > 0) continue;
                    var jimp = -(1 + REST) * rv / sum;
                    b.vx -= jimp * ib * nx; b.vy -= jimp * ib * ny;
                    o.vx += jimp * io * nx; o.vy += jimp * io * ny;
                }
            }
        }

        function draw() {
            g.clearRect(0, 0, W, H);
            for (var i = 0; i < bodies.length; i++) {
                var b = bodies[i], col = b.c ? sec : acc;
                var gr = g.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
                if (light) {
                    gr.addColorStop(0, 'rgba(255,255,255,.95)');
                    gr.addColorStop(1, 'rgba(' + col.join(',') + ',.22)');
                } else {
                    gr.addColorStop(0, 'rgba(' + col.join(',') + ',.55)');
                    gr.addColorStop(1, 'rgba(' + col.join(',') + ',.12)');
                }
                g.beginPath();
                g.arc(b.x, b.y, b.r, 0, 6.2832);
                g.fillStyle = gr;
                g.fill();
                g.lineWidth = b === grab ? 2 : 1;
                g.strokeStyle = 'rgba(' + col.join(',') + ',' + (b === grab ? 1 : 0.6) + ')';
                g.stroke();
                g.save();
                g.translate(b.x, b.y);
                g.rotate(Math.max(-0.4, Math.min(0.4, b.rot % 6.2832)));
                g.font = font(b.sz);
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                g.fillStyle = light ? '#0a1222' : '#ffffff';
                g.fillText(b.label, 0, 1);
                g.restore();
            }
        }

        function at(e) {
            var r = cv.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        }
        cv.addEventListener('pointerdown', function (e) {
            var p = at(e), best = null, bd = Infinity;
            bodies.forEach(function (b) {
                var d = Math.hypot(b.x - p.x, b.y - p.y);
                if (d < b.r && d < bd) { best = b; bd = d; }
            });
            if (!best) return;
            grab = best; grab.ox = grab.x - p.x; grab.oy = grab.y - p.y;
            ptr = { x: p.x, y: p.y, vx: 0, vy: 0, t: performance.now() };
            cv.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        cv.addEventListener('pointermove', function (e) {
            if (!grab) return;
            var p = at(e), now = performance.now(), dt = Math.max(8, now - ptr.t) / 1000;
            ptr.vx = ptr.vx * 0.5 + (p.x - ptr.x) / dt * 0.5;
            ptr.vy = ptr.vy * 0.5 + (p.y - ptr.y) / dt * 0.5;
            ptr.x = p.x; ptr.y = p.y; ptr.t = now;
            grab.x = Math.max(grab.r, Math.min(W - grab.r, p.x + grab.ox));
            grab.y = Math.max(grab.r, Math.min(H - grab.r, p.y + grab.oy));
        });
        function release() {
            if (!grab) return;
            grab.vx = Math.max(-2600, Math.min(2600, ptr.vx));    // ¡lanzada!
            grab.vy = Math.max(-2600, Math.min(2600, ptr.vy));
            grab.in = true;
            grab = null;
        }
        cv.addEventListener('pointerup', release);
        cv.addEventListener('pointercancel', release);

        box.querySelector('.hm-play-reset').addEventListener('click', function () { spawn(); });
        window.addEventListener('resize', function () {
            var oldW = W; resize();
            bodies.forEach(function (b) { b.x = b.x / (oldW || W) * W; });
        });

        var last = performance.now();
        function loop(now) {
            requestAnimationFrame(loop);
            var dt = Math.min(0.033, (now - last) / 1000);
            last = now;
            if (!visible || document.hidden) return;
            for (var k = 0; k < 3; k++) step(dt / 3);          // varios pasos: choques estables
            draw();
        }
        function begin() {
            if (started) return;
            started = true;
            spawn();
            if (reduce) {                                       // sin animación: ya caídas
                for (var k = 0; k < 600; k++) step(1 / 60);
                draw();
            } else requestAnimationFrame(loop);
        }
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (es) {
                visible = es[0].isIntersecting;
                if (visible) begin();
            }, { threshold: 0.25 }).observe(box);
        } else { visible = true; begin(); }
    })();
})();