(function () {
    var root = document.querySelector('.cv');

    /* ---------- Pestañas de habilidades técnicas ---------- */
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));

    function select(tab, focus) {
        tabs.forEach(function (t) {
            var on = t === tab;
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            t.tabIndex = on ? 0 : -1;
            document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
        });
        if (focus) tab.focus();
    }

    tabs.forEach(function (tab, i) {
        tab.addEventListener('click', function () { select(tab, false); });
        tab.addEventListener('keydown', function (e) {
            var next = null;
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
            if (e.key === 'Home') next = tabs[0];
            if (e.key === 'End') next = tabs[tabs.length - 1];
            if (next) { e.preventDefault(); select(next, true); }
        });
    });

    /* ---------- Copiar al portapapeles ---------- */
    var toast = root.querySelector('.toast');
    var timer = null;

    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(timer);
        timer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
    }

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { }
        document.body.removeChild(ta);
    }

    Array.prototype.forEach.call(root.querySelectorAll('[data-copy]'), function (btn) {
        btn.addEventListener('click', function () {
            var text = btn.getAttribute('data-copy');
            var done = function () { showToast(btn.getAttribute('data-msg') || 'Copiado'); };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
            } else {
                fallbackCopy(text);
                done();
            }
        });
    });

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ============================================================
       Carrusel de tecnologías: un sistema planetario
       - En el centro, un planeta gaseoso dibujado en WebGL (bandas,
         tormenta, luz, sombra y atmósfera) que gira sobre sí mismo.
       - Órbitas finas que pasan POR DETRÁS del planeta y se iluminan
         por delante, y un cinturón de asteroides.
       - Las tecnologías son lunas: delante crecen, detrás se esconden.
       Se puede arrastrar para girarlo (con inercia).
       ============================================================ */
    var orbit = root.querySelector('.orbit');
    if (orbit) (function () {
        var rings = [].slice.call(orbit.querySelectorAll('.ring')).map(function (el) {
            return {
                el: el,
                items: [].slice.call(el.children),
                speed: parseFloat(el.getAttribute('data-speed')) || 0.15,
                rxF: parseFloat(el.getAttribute('data-rx')) || 0.45,
                ryF: parseFloat(el.getAttribute('data-ry')) || 0.15,
                tilt: (parseFloat(el.getAttribute('data-tilt')) || 0) * Math.PI / 180,
                off: 0
            };
        });
        var back = orbit.querySelector('.orbit-back'), front = orbit.querySelector('.orbit-front');
        var bctx = back.getContext('2d'), fctx = front.getContext('2d');
        var W = 0, H = 0, DPR = 1, small = false;
        var mul = 1, mulTarget = 1, drag = null, spinV = 0, beltOff = 0;
        var light = false;

        // cinturón de asteroides (justo por fuera de la órbita exterior)
        var belt = [];
        for (var i = 0; i < 230; i++) {
            belt.push({
                a: Math.random() * Math.PI * 2,
                f: 1.1 + Math.pow(Math.random(), 1.5) * 0.16,     // distancia
                h: (Math.random() - 0.5) * 7,                     // grosor del cinturón
                s: Math.random() < 0.9 ? Math.random() * 1.1 + 0.5 : Math.random() * 1.6 + 1.6,
                g: 0.55 + Math.random() * 0.45                    // tono (más claro / más oscuro)
            });
        }

        function ringGeom(r) {
            var rx = W * r.rxF, ry = W * r.ryF * (small ? 1.45 : 1);
            return { rx: rx, ry: ry, ct: Math.cos(r.tilt), st: Math.sin(r.tilt) };
        }

        function size() {
            W = orbit.clientWidth; H = orbit.clientHeight;
            small = W < 420;
            DPR = Math.min(window.devicePixelRatio || 1, 2);
            [back, front].forEach(function (c) {
                c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
                c.getContext('2d').setTransform(DPR, 0, 0, DPR, 0, 0);
            });
            if (planet) planet.resize();
        }

        function place() {
            rings.forEach(function (r) {
                var g = ringGeom(r), n = r.items.length;
                r.items.forEach(function (it, i) {
                    var a = i / n * Math.PI * 2 + r.off;
                    var x = Math.cos(a) * g.rx, y = Math.sin(a) * g.ry;
                    var X = x * g.ct - y * g.st, Y = x * g.st + y * g.ct;
                    var depth = Math.sin(a);                 // 1 = delante, -1 = detrás
                    var k = (depth + 1) / 2;
                    var sc = (small ? 0.62 : 0.66) + 0.44 * k;
                    it.style.transform = 'translate(-50%, -50%) translate(' + X.toFixed(1) + 'px,' + Y.toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')';
                    it.style.opacity = (0.3 + 0.7 * k).toFixed(3);
                    // detrás del planeta (z 10) o delante de la órbita frontal (z 15)
                    it.style.zIndex = depth > 0 ? 20 + Math.round(depth * 10) : 1 + Math.round(k * 8);
                    it.style.filter = depth < -0.35 ? 'blur(' + (1.2 * (-depth - 0.35)).toFixed(2) + 'px)' : '';
                    it.classList.toggle('is-front', depth > 0.82);
                    it.classList.toggle('is-back', depth < -0.1);
                });
            });
            drawOrbits();
        }

        function drawOrbits() {
            var cx = W / 2, cy = H / 2;
            bctx.clearRect(0, 0, W, H);
            fctx.clearRect(0, 0, W, H);
            var col = light ? '150,62,30' : '255,196,160';

            rings.forEach(function (r, ri) {
                var g = ringGeom(r), N = 180;
                for (var k = 0; k < N; k++) {
                    var a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2;
                    var depth = Math.sin((a0 + a1) / 2);
                    var ctx = depth < 0 ? bctx : fctx;
                    var al = depth < 0 ? 0.07 + 0.1 * (1 + depth) : 0.2 + 0.42 * depth;
                    if (ri === 1) al *= 0.75;
                    ctx.strokeStyle = 'rgba(' + col + ',' + al.toFixed(3) + ')';
                    ctx.lineWidth = depth < 0 ? 0.8 : 1 + depth * 0.6;
                    var x0 = Math.cos(a0) * g.rx, y0 = Math.sin(a0) * g.ry;
                    var x1 = Math.cos(a1) * g.rx, y1 = Math.sin(a1) * g.ry;
                    ctx.beginPath();
                    ctx.moveTo(cx + x0 * g.ct - y0 * g.st, cy + x0 * g.st + y0 * g.ct);
                    ctx.lineTo(cx + x1 * g.ct - y1 * g.st, cy + x1 * g.st + y1 * g.ct);
                    ctx.stroke();
                }
            });

            // asteroides: iluminados desde arriba a la izquierda, más tenues por detrás
            var g = ringGeom(rings[0]);
            for (var j = 0; j < belt.length; j++) {
                var b = belt[j], a = b.a + beltOff;
                var x = Math.cos(a) * g.rx * b.f, y = Math.sin(a) * g.ry * b.f + b.h;
                var X = cx + x * g.ct - y * g.st, Y = cy + x * g.st + y * g.ct;
                var d = Math.sin(a), kk = (d + 1) / 2;
                var ctx2 = d < 0 ? bctx : fctx;
                var lum = Math.round((light ? 120 : 150) * b.g * (0.45 + 0.75 * kk));
                ctx2.fillStyle = light
                    ? 'rgba(' + (lum + 40) + ',' + (lum - 10) + ',' + (lum - 35) + ',' + (0.35 + 0.5 * kk).toFixed(2) + ')'
                    : 'rgba(' + (lum + 60) + ',' + (lum + 25) + ',' + lum + ',' + (0.3 + 0.6 * kk).toFixed(2) + ')';
                var rr = b.s * (0.6 + 0.5 * kk);
                ctx2.beginPath();
                ctx2.arc(X, Y, rr, 0, 6.2832);
                ctx2.fill();
            }
        }

        /* ---------- Planeta (WebGL) ---------- */
        var planet = (function () {
            var cv = orbit.querySelector('.orbit-planet'), core = orbit.querySelector('.orbit-core');
            var gl = null;
            try { gl = cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true }); } catch (e) { }
            if (!gl) { core.classList.add('no-gl'); return null; }
            var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
            var FS = [
                'precision highp float;',
                'uniform vec2 uRes;uniform float uTime;uniform vec3 uL;',
                'float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
                'float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);',
                ' return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),',
                '  mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}',
                'float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}',
                'void main(){',
                ' vec2 uv=(gl_FragCoord.xy-.5*uRes)/(.5*uRes.y)/.78;',      /* radio del planeta = 78% */
                ' float r=length(uv);',
                ' vec3 L=normalize(uL);',
                ' vec3 col=vec3(0.);float al=0.;',
                ' if(r<1.){',
                '  vec3 n=vec3(uv,sqrt(1.-r*r));',
                '  float tl=.38;',                                          /* inclinación del eje */
                '  vec3 p=vec3(n.x*cos(tl)-n.y*sin(tl),n.x*sin(tl)+n.y*cos(tl),n.z);',
                '  float ang=uTime*.07;',                                   /* rotación */
                '  vec3 q=vec3(p.x*cos(ang)-p.z*sin(ang),p.y,p.x*sin(ang)+p.z*cos(ang));',
                '  float tb=fbm(q*3.2+vec3(0.,0.,uTime*.012));',
                '  float lat=q.y+(tb-.5)*.16;',
                '  float b1=sin(lat*24.)*.5+.5, b2=sin(lat*9.+1.3)*.5+.5;',
                '  vec3 cA=vec3(.97,.84,.62), cB=vec3(.84,.5,.32), cC=vec3(.55,.24,.2), cD=vec3(.99,.93,.84);',
                '  vec3 base=mix(cB,cA,b1);',
                '  base=mix(base,cC,smoothstep(.55,.95,b2)*.55);',
                '  base=mix(base,cD,smoothstep(.62,.95,fbm(q*7.+3.))*.35);',
                '  float lon=atan(q.x,q.z);',
                '  vec2 sp=vec2(lon-.7,q.y+.3);',                            /* gran tormenta */
                '  float st=smoothstep(.16,0.,length(sp*vec2(.6,1.7)));',
                '  base=mix(base,vec3(.86,.36,.24)+fbm(q*14.)*.1,st*.85);',
                '  base=pow(base,vec3(2.2));',                               /* a espacio lineal para calcular la luz */
                '  float dl=dot(n,L);',
                '  float diff=max(dl,0.)*smoothstep(-.04,.18,dl);',            /* Lambert con un terminador suave */
                '  diff*=mix(.72,1.,pow(max(n.z,0.),.5));',                     /* oscurecimiento hacia el borde */
                '  vec3 lit=base*(diff*1.12+.0015);',                           /* casi sin luz ambiente: el lado de noche es noche */
                '  float limb=pow(1.-n.z,3.)*smoothstep(-.05,.45,dl);',
                '  lit+=vec3(.95,.62,.4)*limb*.16;',                           /* fina capa de atmósfera en el borde iluminado */
                '  lit=lit/(1.+lit*.18);',                                     /* sin zonas quemadas */
                '  col=pow(lit,vec3(1./2.2));al=smoothstep(1.,.992,r);',
                ' }',
                ' vec2 dir=normalize(uv+1e-5);',
                ' float side=smoothstep(.05,.85,dot(dir,normalize(L.xy)));',  /* el halo solo por el lado del sol */
                ' float halo=exp(-max(r-1.,0.)*30.)*step(1.,r)*side*.42;',
                ' vec3 hc=vec3(1.,.66,.46)*halo;',
                ' col=col*al+hc*(1.-al);al=al+halo*(1.-al);',
                ' gl_FragColor=vec4(col,al);',
                '}'
            ].join('\n');
            function sh(type, src) {
                var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
                if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(o)); return null; }
                return o;
            }
            var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
            if (!vs || !fs) { core.classList.add('no-gl'); return null; }
            var pr = gl.createProgram();
            gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr); gl.useProgram(pr);
            var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            var loc = gl.getAttribLocation(pr, 'a');
            gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
            var uRes = gl.getUniformLocation(pr, 'uRes'), uTime = gl.getUniformLocation(pr, 'uTime'), uL = gl.getUniformLocation(pr, 'uL');
            gl.uniform3f(uL, -0.7, 0.45, 0.55);                         // luz desde arriba a la izquierda
            gl.clearColor(0, 0, 0, 0);
            return {
                resize: function () {
                    var s = core.clientWidth * DPR;
                    cv.width = cv.height = Math.max(2, Math.round(s));
                    gl.viewport(0, 0, cv.width, cv.height);
                    gl.uniform2f(uRes, cv.width, cv.height);
                },
                draw: function (t) {
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    gl.uniform1f(uTime, t);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                }
            };
        })();

        function readTheme() { light = document.documentElement.getAttribute('data-theme') === 'light'; }
        readTheme();
        document.addEventListener('hf-themechange', function () { readTheme(); drawOrbits(); });

        orbit.classList.add('is-3d');
        size(); place();
        if (planet) planet.draw(8);
        window.addEventListener('resize', function () { size(); place(); if (planet) planet.draw(8); });
        if (reduce) return;

        // al pasar el ratón gira más despacio
        orbit.addEventListener('pointerenter', function () { mulTarget = 0.3; });
        orbit.addEventListener('pointerleave', function () { if (!drag) mulTarget = 1; });

        orbit.addEventListener('pointerdown', function (e) {
            drag = { x: e.clientX, t: performance.now() };
            spinV = 0;
            orbit.classList.add('dragging');
            orbit.setPointerCapture(e.pointerId);
        });
        orbit.addEventListener('pointermove', function (e) {
            if (!drag) return;
            var now = performance.now(), dx = e.clientX - drag.x;
            var da = dx / Math.max(200, W) * Math.PI * 1.6;
            rings.forEach(function (r) { r.off += da * (r.speed < 0 ? -1.25 : 1); });
            beltOff += da * 0.4;
            spinV = da / Math.max(8, now - drag.t) * 1000;     // velocidad para la inercia
            drag.x = e.clientX; drag.t = now;
        });
        function endDrag() {
            if (!drag) return;
            drag = null;
            orbit.classList.remove('dragging');
            mulTarget = orbit.matches(':hover') ? 0.3 : 1;
        }
        orbit.addEventListener('pointerup', endDrag);
        orbit.addEventListener('pointercancel', endDrag);

        var last = performance.now(), t0 = last, visible = true;
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(orbit);
        }
        (function tick(now) {
            requestAnimationFrame(tick);
            var dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (!visible || document.hidden) return;
            if (!drag) {
                mul += (mulTarget - mul) * Math.min(1, dt * 3);
                spinV *= Math.pow(0.04, dt);                         // la inercia se frena sola
                rings.forEach(function (r) {
                    r.off += (r.speed * mul) * dt + spinV * dt * (r.speed < 0 ? -1.25 : 1);
                });
                beltOff += (0.05 * mul + spinV * 0.4) * dt;
            }
            place();
            if (planet) planet.draw((now - t0) / 1000 + 8);
        })(last);
    })();

    /* ============================================================
       Modo horizontal
       En pantallas grandes la página es una pista de paneles. Se sigue
       usando el scroll normal (rueda, barra, teclado, trackpad), pero
       cada píxel de scroll mueve la pista hacia la izquierda.
       ============================================================ */
    var hWrap = root.querySelector('.cv-h'), track = root.querySelector('.cv-track');
    var sticky = root.querySelector('.cv-h-sticky');
    if (hWrap && track) (function () {
        var mq = window.matchMedia('(min-width: 901px) and (min-height: 600px)');
        var panels = [].slice.call(track.querySelectorAll('.panel'));
        var links = [].slice.call(root.querySelectorAll('.cv-dots a'));
        var bar = root.querySelector('.cv-dots-bar');
        var on = false, dist = 0, cur = 0, target = 0, raf = 0;

        function top() { return hWrap.getBoundingClientRect().top + window.scrollY; }

        // el pie de página («Proyecto Personal© 2026») se muestra dentro del
        // panel de contacto, así al llegar al final no hay que bajar más y
        // el panel no se desplaza hacia arriba
        var footer = null, footHome = null;
        var endPanel = panels[panels.length - 1];
        function placeFooter() {
            // el pie está después de este script en base.html: se busca cuando ya existe
            if (!footer) {
                footer = document.querySelector('.footer-portada');
                if (!footer) return;
                footHome = { parent: footer.parentNode, next: footer.nextSibling };
            }
            if (on && footer.parentNode !== endPanel) endPanel.appendChild(footer);
            else if (!on && footer.parentNode !== footHome.parent) footHome.parent.insertBefore(footer, footHome.next);
        }

        var pw = window.innerWidth;
        function layout() {
            on = mq.matches;
            root.classList.toggle('is-h', on);
            placeFooter();
            if (!on) {
                hWrap.style.height = '';
                track.style.transform = '';
                track.style.removeProperty('--pw');
                panels.forEach(function (p) { p.style.removeProperty('--rel'); p.style.removeProperty('--vis'); });
                return;
            }
            // cada panel mide lo que se ve de verdad (sin la barra de scroll),
            // así ningún panel queda descentrado ni medio tapado
            for (var k = 0; k < 2; k++) {
                pw = sticky.clientWidth || document.documentElement.clientWidth;
                track.style.setProperty('--pw', pw + 'px');
                dist = Math.max(0, track.scrollWidth - pw);
                hWrap.style.height = (dist + window.innerHeight) + 'px';
            }
            target = clamp(window.scrollY - top());
            cur = target;
            render();
        }
        function clamp(v) { return Math.max(0, Math.min(dist, v)); }

        function render() {
            track.style.transform = 'translate3d(' + (-cur).toFixed(1) + 'px,0,0)';
            var idx = 0;
            panels.forEach(function (p, i) {
                var rel = (p.offsetLeft - cur) / pw;
                p.style.setProperty('--rel', rel.toFixed(3));
                p.style.setProperty('--vis', Math.max(0, 1 - Math.abs(rel) * 0.8).toFixed(3));
                if (Math.abs(rel) < 0.5) idx = i;
            });
            links.forEach(function (a, i) { a.classList.toggle('is-on', i === idx); });
            if (bar) bar.style.setProperty('--p', dist ? (cur / dist).toFixed(4) : 0);
        }

        // el desplazamiento se suaviza un poco (sensación de inercia)
        function loop() {
            raf = 0;
            var d = target - cur;
            cur = Math.abs(d) < 0.5 || reduce ? target : cur + d * 0.14;
            render();
            if (cur !== target) raf = requestAnimationFrame(loop);
        }
        window.addEventListener('scroll', function () {
            if (!on) return;
            target = clamp(window.scrollY - top());
            if (!raf) raf = requestAnimationFrame(loop);
        }, { passive: true });

        // trackpad: deslizar a los lados también avanza
        window.addEventListener('wheel', function (e) {
            if (!on || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            if (e.target.closest && e.target.closest('.orbit')) return;
            e.preventDefault();
            window.scrollBy({ top: e.deltaX, behavior: 'instant' });
        }, { passive: false });

        // flechas izquierda / derecha: panel anterior / siguiente
        function goTo(i) {
            i = Math.max(0, Math.min(panels.length - 1, i));
            window.scrollTo({ top: top() + Math.min(dist, panels[i].offsetLeft), behavior: reduce ? 'auto' : 'smooth' });
        }
        function currentIndex() { return Math.round(cur / pw); }
        document.addEventListener('keydown', function (e) {
            if (!on || e.altKey || e.ctrlKey || e.metaKey) return;
            if (e.target.closest && e.target.closest('input, textarea, select, [role="tab"]')) return;
            if (e.key === 'ArrowRight') { e.preventDefault(); goTo(currentIndex() + 1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(currentIndex() - 1); }
        });

        // anclas (#perfil, #contacto…) y barra de secciones
        root.addEventListener('click', function (e) {
            var a = e.target.closest && e.target.closest('a[href^="#"]');
            if (!a || !on) return;
            var el = document.getElementById(a.getAttribute('href').slice(1));
            var p = el && el.closest('.panel');
            if (!p) return;
            e.preventDefault();
            goTo(panels.indexOf(p));
        });

        // al tabular hasta algo de otro panel, la pista va a ese panel
        root.addEventListener('focusin', function (e) {
            if (!on) return;
            sticky.scrollLeft = 0;
            var p = e.target.closest && e.target.closest('.panel');
            if (p && Math.abs(p.offsetLeft - cur) > 4) goTo(panels.indexOf(p));
        });

        layout();
        var rt;
        function relayout() { clearTimeout(rt); rt = setTimeout(layout, 120); }
        window.addEventListener('resize', relayout);
        // la barra de scroll puede aparecer o desaparecer sin que cambie la ventana
        if (window.ResizeObserver) new ResizeObserver(function () {
            if (on && sticky.clientWidth && Math.abs(sticky.clientWidth - pw) > 0.5) relayout();
        }).observe(sticky);
        if (mq.addEventListener) mq.addEventListener('change', layout);
        document.addEventListener('DOMContentLoaded', layout);
        window.addEventListener('load', layout);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    })();

    /* ============================================================
       Brasas que suben (ambientación de esta página)
       ============================================================ */
    var cvE = root.querySelector('.amb-embers');
    if (cvE && !reduce) (function () {
        var g = cvE.getContext('2d'), W = 0, H = 0, ps = [], last = performance.now();
        var COLS = [[255, 198, 92], [255, 138, 91], [255, 79, 139]];
        function light() { return document.documentElement.getAttribute('data-theme') === 'light'; }
        function spawn(p, anyY) {
            p.x = Math.random() * W;
            p.y = anyY ? Math.random() * H : H + 10;
            p.r = Math.random() < 0.85 ? Math.random() * 1.3 + 0.5 : Math.random() * 1.6 + 1.6;
            p.vy = -(10 + Math.random() * 28) * (0.6 + p.r / 3);
            p.sw = Math.random() * 18 + 6;          // vaivén lateral
            p.f = Math.random() * 0.9 + 0.3;
            p.ph = Math.random() * 6.28;
            p.c = COLS[(Math.random() * COLS.length) | 0];
            p.life = 0;
            return p;
        }
        function resize() {
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = window.innerWidth; H = window.innerHeight;
            cvE.width = Math.round(W * dpr); cvE.height = Math.round(H * dpr);
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            var n = Math.round(Math.min(70, W * H / 22000));
            ps = [];
            for (var i = 0; i < n; i++) ps.push(spawn({}, true));
        }
        resize();
        window.addEventListener('resize', resize);
        (function tick(now) {
            requestAnimationFrame(tick);
            var dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (document.hidden) return;
            var lt = light(), t = now / 1000;
            g.clearRect(0, 0, W, H);
            g.globalCompositeOperation = lt ? 'source-over' : 'lighter';
            for (var i = 0; i < ps.length; i++) {
                var p = ps[i];
                p.life += dt;
                p.y += p.vy * dt;
                var x = p.x + Math.sin(t * p.f + p.ph) * p.sw;
                if (p.y < -20) spawn(p, false);
                var fade = Math.min(1, p.life / 1.5) * Math.min(1, (p.y + 20) / (H * 0.35));
                var flick = 0.6 + 0.4 * Math.sin(t * (3 + p.f * 4) + p.ph);
                var a = (lt ? 0.35 : 0.75) * fade * flick;
                var R = p.r * 4;
                var gr = g.createRadialGradient(x, p.y, 0, x, p.y, R);
                gr.addColorStop(0, 'rgba(' + p.c.join(',') + ',' + a + ')');
                gr.addColorStop(0.3, 'rgba(' + p.c.join(',') + ',' + (a * 0.45) + ')');
                gr.addColorStop(1, 'rgba(' + p.c.join(',') + ',0)');
                g.fillStyle = gr;
                g.fillRect(x - R, p.y - R, R * 2, R * 2);
            }
            g.globalCompositeOperation = 'source-over';
        })(last);
    })();
})();