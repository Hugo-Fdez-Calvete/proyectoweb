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
       Carrusel de tecnologías: un sistema planetario… con sorpresa
       - Normal: un planeta gaseoso en WebGL, órbitas, cinturón de
         asteroides y las tecnologías como lunas.
       - EASTER EGG: si se hacen girar las órbitas muy rápido, el planeta
         se calienta y salta la animación de la bomba (cv_intro.js). Al
         acabar, el centro pasa a ser el hongo de la explosión, con un
         cinturón de brasas, y las tecnologías se vuelven objetos lanzados
         (coches, motos, furgonetas, sillas, mesas…).
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
        // cada tecnología es un objeto lanzado por la explosión; la silueta se
        // usa como máscara y el color (lado caliente / lado en sombra) lo pone el CSS
        var OBJ = [
            /* coche */ '<path fill-rule="evenodd" d="M3 40v-5c0-3 2-4 5-4.5l8-2 6.5-7.5c1.5-1.5 3.5-2 6-2h11c3 0 5 1 7 3l6 6.5 6 1c3 .5 4.5 2 4.5 5V40zM25 28.5l4.5-5.5H36v5.5zm14 0V23h2.5c1.5 0 3 .5 4 1.5l4 4z"/><circle cx="17" cy="41" r="6.5"/><circle cx="48" cy="41" r="6.5"/><circle cx="17" cy="41" r="2.5" fill-opacity=".3"/><circle cx="48" cy="41" r="2.5" fill-opacity=".3"/>',
            /* moto */ '<path fill-rule="evenodd" d="M13 35a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM51 35a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/><path d="M13 44l11-11h13l6 5 8 6M24 33l-3-6h12l4 6M44 22l-3 11M40 22h8" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 30h14l-2 6H28z"/>',
            /* furgoneta */ '<path fill-rule="evenodd" d="M3 43V20c0-3 2-5 5-5h33c3 0 5 1 7 3l9 10c2 2 4 3 4 6v9zM42 19v9h12l-7-7.5c-1-1-2-1.5-3.5-1.5zM8 19v9h12v-9zm16 0v9h14v-9z"/><circle cx="16" cy="44" r="6.5"/><circle cx="48" cy="44" r="6.5"/><circle cx="16" cy="44" r="2.5" fill-opacity=".3"/><circle cx="48" cy="44" r="2.5" fill-opacity=".3"/>',
            /* silla */ '<path d="M17 6h6v26h22v6h-2v20h-5V38H23v20h-5V38h-2v-6h1z"/><path d="M23 12h3v18h-3z" fill-opacity=".35"/>',
            /* mesa */ '<path d="M4 22h56v7H4z"/><path d="M9 29h6v27H9zm40 0h6v27h-6z"/><path d="M15 29h34v4H15z" fill-opacity=".4"/>',
            /* sofá */ '<path d="M10 22c0-4 3-6 6-6h32c3 0 6 2 6 6v8H10z"/><path d="M3 30c0-3 2-5 5-5s5 2 5 5v4h38v-4c0-3 2-5 5-5s5 2 5 5v14H3z"/><path d="M7 44h4v5H7zm46 0h4v5h-4z"/><path d="M13 34h38v4H13z" fill-opacity=".35"/>',
            /* tele */ '<path fill-rule="evenodd" d="M5 12h54v34H5zm4 4v26h46V16z"/><path d="M9 16h46v26H9z" fill-opacity=".3"/><path d="M28 46h8v6h10v4H18v-4h10z"/>',
            /* bici */ '<path fill-rule="evenodd" d="M13 32a11 11 0 1 1 0 22 11 11 0 0 1 0-22zm0 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM51 32a11 11 0 1 1 0 22 11 11 0 0 1 0-22zm0 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"/><path d="M13 43l9-15h18l11 15M22 28l9 15 9-15M31 43l-6-21M21 22h9M40 28l-3-10h6" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
            /* lavadora */ '<path fill-rule="evenodd" d="M12 4h40c2 0 4 2 4 4v48c0 2-2 4-4 4H12c-2 0-4-2-4-4V8c0-2 2-4 4-4zm20 18a14 14 0 1 0 0 28 14 14 0 0 0 0-28z"/><circle cx="32" cy="36" r="11" fill-opacity=".35"/><path d="M8 14h48v2H8z" fill-opacity=".4"/>',
            /* cono */ '<path d="M27 5h10l13 44H14z"/><path d="M22 22h20l2 8H20zm-4 14h28l2 8H16z" fill-opacity=".35"/><path d="M6 49h52v7H6z"/>',
            /* bidón */ '<path d="M16 6h32c3 0 4 2 4 4v44c0 2-1 4-4 4H16c-3 0-4-2-4-4V10c0-2 1-4 4-4z"/><path d="M12 18h40v4H12zm0 22h40v4H12z" fill-opacity=".35"/>',
            /* carrito */ '<path fill-rule="evenodd" d="M4 10h9l3 6h44l-6 22H20l2 5h32v4H19l-9-33H4zm16 10l4 14h26l4-14z"/><path d="M24 20l4 14h22l4-14z" fill-opacity=".3"/><circle cx="24" cy="53" r="4.5"/><circle cx="48" cy="53" r="4.5"/>'
        ];
        function objUrl(k) {
            var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' + OBJ[k % OBJ.length] + '</svg>';
            return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
        }
        var objN = 0;
        rings.forEach(function (r) {
            r.items.forEach(function (it) {
                it.style.setProperty('--obj', objUrl(objN++));
                it._spin = Math.random() * 360;
                it._vs = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 22);   // grados por segundo
            });
        });
        var back = orbit.querySelector('.orbit-back'), front = orbit.querySelector('.orbit-front');
        var bctx = back.getContext('2d'), fctx = front.getContext('2d');
        var W = 0, H = 0, DPR = 1, small = false;
        var mul = 1, mulTarget = 1, drag = null, spinV = 0, beltOff = 0;
        var light = false;
        var boom = false;                                  // modo explosión (tras el easter egg)
        // geometría de las órbitas: la original (en el HTML) y la de la explosión (concéntricas y separadas)
        var BOOM_GEO = [{ rx: 0.45, ry: 0.25, tilt: -5 }, { rx: 0.23, ry: 0.08, tilt: -5 }];

        // cinturón de asteroides (justo por fuera de la órbita exterior)
        var belt = [];
        for (var i = 0; i < 230; i++) {
            belt.push({
                a: Math.random() * Math.PI * 2,
                f: 1.1 + Math.pow(Math.random(), 1.5) * 0.16,     // distancia
                h: (Math.random() - 0.5) * 7,                     // grosor del cinturón
                s: Math.random() < 0.9 ? Math.random() * 1.1 + 0.5 : Math.random() * 1.6 + 1.6,
                g: 0.55 + Math.random() * 0.45,                   // tono (más claro / más oscuro)
                e: Math.random() < 0.24                           // brasa encendida
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
                    // el lado caliente mira a la explosión
                    it.style.setProperty('--la', (Math.atan2(X, -Y) * 180 / Math.PI).toFixed(1) + 'deg');
                    it.style.setProperty('--spin', it._spin.toFixed(1) + 'deg');
                    it.classList.toggle('is-back', depth < -0.1);
                });
            });
            drawOrbits();
        }

        function drawOrbits() {
            var cx = W / 2, cy = H / 2;
            bctx.clearRect(0, 0, W, H);
            fctx.clearRect(0, 0, W, H);
            var col = boom ? (light ? '170,62,25' : '255,160,100') : (light ? '150,62,30' : '255,196,160');

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

            // asteroides (modo normal) o piedras y brasas (modo explosión), más tenues por detrás
            var g = ringGeom(rings[0]);
            for (var j = 0; j < belt.length; j++) {
                var b = belt[j], a = b.a + beltOff;
                var x = Math.cos(a) * g.rx * b.f, y = Math.sin(a) * g.ry * b.f + b.h;
                var X = cx + x * g.ct - y * g.st, Y = cy + x * g.st + y * g.ct;
                var d = Math.sin(a), kk = (d + 1) / 2;
                var ctx2 = d < 0 ? bctx : fctx;
                var rr = b.s * (0.6 + 0.5 * kk);
                if (!boom) {                                   // asteroides iluminados desde arriba a la izquierda
                    var lumA = Math.round((light ? 120 : 150) * b.g * (0.45 + 0.75 * kk));
                    ctx2.fillStyle = light
                        ? 'rgba(' + (lumA + 40) + ',' + (lumA - 10) + ',' + (lumA - 35) + ',' + (0.35 + 0.5 * kk).toFixed(2) + ')'
                        : 'rgba(' + (lumA + 60) + ',' + (lumA + 25) + ',' + lumA + ',' + (0.3 + 0.6 * kk).toFixed(2) + ')';
                } else if (b.e) {
                    var fl = 0.55 + 0.45 * Math.sin(beltOff * 40 + j);   // parpadeo
                    ctx2.fillStyle = 'rgba(255,' + Math.round(120 + 90 * b.g) + ',40,' + (0.12 * fl * (0.4 + kk)).toFixed(3) + ')';
                    ctx2.beginPath(); ctx2.arc(X, Y, rr * 3.2, 0, 6.2832); ctx2.fill();
                    ctx2.fillStyle = 'rgba(255,' + Math.round(170 + 70 * b.g) + ',90,' + ((0.5 + 0.5 * fl) * (0.4 + 0.6 * kk)).toFixed(2) + ')';
                } else {
                    var lum = Math.round((light ? 70 : 60) * b.g * (0.55 + 0.6 * kk));
                    ctx2.fillStyle = 'rgba(' + (lum + 30) + ',' + (lum + 4) + ',' + lum + ',' + ((light ? 0.5 : 0.65) + 0.35 * kk).toFixed(2) + ')';
                }
                ctx2.beginPath();
                ctx2.arc(X, Y, rr, 0, 6.2832);
                ctx2.fill();
            }
        }

        /* ---------- Centro (WebGL): el planeta o, tras el easter egg, el hongo ---------- */
        var planet = (function () {
            var cv = orbit.querySelector('.orbit-planet'), core = orbit.querySelector('.orbit-core');
            var gl = null;
            try { gl = cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true }); } catch (e) { }
            if (!gl) { core.classList.add('no-gl'); return null; }
            var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
            var FS_PLANET = [
                'precision highp float;',
                'uniform vec2 uRes;uniform float uTime;uniform vec3 uL;uniform float uHeat;',
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
                /* al girar rápido se calienta: brilla al rojo y le crece un halo (pista del easter egg) */
                ' col+=vec3(1.,.36,.08)*uHeat*(.5+.3*sin(uTime*16.))*al;',
                ' float hh=exp(-max(r-1.,0.)*9.)*step(1.,r)*uHeat*.9*smoothstep(1.27,1.12,r);',
                ' col=col+vec3(1.,.45,.15)*hh*(1.-al);al=al+hh*(1.-al);',
                ' gl_FragColor=vec4(min(col,vec3(1.)),al);',
                '}'
            ].join('\n');
            var FS_HONGO = [
                'precision highp float;',
                'uniform vec2 uRes;uniform float uTime;uniform float uLight;',
                'float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
                'float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);',
                ' return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),',
                '  mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}',
                'float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return v;}',
                'mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}',
                'void main(){',
                ' vec2 uv=(gl_FragCoord.xy-.5*uRes)/(.5*uRes.y);',
                ' float t=uTime;',
                ' vec2 ug=uv;',
                /* sombrero: los lados ruedan hacia fuera como un toro */
                ' vec2 pc=uv-vec2(0.,.36);',
                ' float nC=fbm(vec3(pc*vec2(4.,4.6)+vec2(0.,-t*.12),t*.16));',
                ' float cap=length(pc/vec2(.66,.33))-1.+(nC-.5)*.55;',
                /* columna que sube */
                ' float y=uv.y;',
                ' float w=.12+.06*smoothstep(-.1,.3,y)+.3*pow(clamp((-.44-y)/.36,0.,1.),1.6);',
                ' float nS=fbm(vec3(uv.x*5.,y*3.5-t*.7,t*.08));',
                ' float stem=abs(uv.x)/(w*(.8+.45*nS))-1.;',
                ' stem=max(stem,(y-.32)*6.);stem=max(stem,(-.8-y)*6.);',
                /* polvo en el suelo */
                ' vec2 pb=uv-vec2(0.,-.74);',
                ' float base=length(pb/vec2(.78,.12))-1.+(fbm(vec3(pb*4.+vec2(0.,-t*.06),t*.12))-.5)*.7;',
                ' float d=min(min(cap,stem),base);',
                /* temperatura: núcleo blanco-amarillo, humo rojo oscuro en los bordes */
                ' float core=exp(-pow(length((pc-vec2(0.,-.05))/vec2(.5,.21)),2.)*1.4);',
                ' float colm=exp(-pow(uv.x/(w*.55),2.))*smoothstep(-.9,.0,y)*smoothstep(.28,.02,y)*step(stem,0.);',
                ' float n=fbm(vec3(uv*3.2,t*.25));',
                ' float heat=clamp(core*.82+colm*.6+(n-.5)*.45+.08-max(d+.3,0.)*1.1,0.,1.);',
                ' float top=smoothstep(.2,.75,uv.y)*(1.-core);',
                ' vec3 smoke=mix(vec3(.5,.14,.08),vec3(.24,.08,.06),top);',
                ' vec3 col=mix(smoke,vec3(.88,.24,.12),smoothstep(.05,.35,heat));',
                ' col=mix(col,vec3(1.,.55,.14),smoothstep(.35,.65,heat));',
                ' col=mix(col,vec3(1.,.7,.3),smoothstep(.62,.85,heat));',
                ' col=mix(col,vec3(1.,.8,.48),smoothstep(.88,1.,heat))*.92;',
                /* relieve: el humo se ilumina por el lado que mira al núcleo */
                ' float e=.025;',
                ' col*=mix(.82,1.12,smoothstep(.3,.7,n));',
                /* borde suave, halo y resplandor */
                ' float a=smoothstep(.06,-.06,d);',
                ' float halo=exp(-max(d,0.)*7.)*(1.-a)*smoothstep(1.,.8,max(abs(uv.x),abs(uv.y)));',
                ' float edge=smoothstep(1.,.72,max(abs(uv.x),abs(uv.y)));',
                ' float glow=exp(-length((uv-vec2(0.,.3))/vec2(.9,.6))*2.6)*.32*edge;',
                ' vec3 oc=col*a+vec3(1.,.45,.16)*(.5+.5*core)*halo*.55+vec3(1.,.5,.2)*glow*(1.-a)*(1.-uLight*.5);',
                ' float oa=clamp(a+halo*.45+glow*(1.-a)*.8,0.,1.);',
                ' float fade=smoothstep(1.,.9,max(abs(uv.x),abs(uv.y)));',
                ' oa*=fade;oc*=fade;',
                /* suelo: una losa de tierra vista en perspectiva, iluminada por la explosión */
                ' vec2 pg=(ug-vec2(0.,-.76))/vec2(.97,.15);',
                ' float gd=length(pg);',
                ' float nG=noise(vec3(ug*vec2(7.,22.),1.3))*.6+noise(vec3(ug*vec2(15.,44.),2.1))*.4;',
                ' float gTop=smoothstep(1.,.97,gd+(nG-.5)*.06);',
                ' float side=smoothstep(1.,.97,length((ug-vec2(0.,-.81))/vec2(.97,.15)))*(1.-gTop)*step(ug.y,-.76);',
                ' float lit=exp(-gd*gd*2.2);',
                ' vec3 gc=mix(vec3(.16,.08,.06),vec3(.36,.15,.08),nG)*(.55+.45*smoothstep(.2,-.6,pg.y));',
                ' gc+=vec3(1.,.42,.12)*lit*.9+vec3(1.,.8,.4)*exp(-gd*gd*14.)*.6;',
                ' vec3 sc=vec3(.09,.05,.04)+vec3(.35,.12,.05)*lit;',
                ' float ga=max(gTop,side);',
                ' vec3 gcol=mix(sc,gc,gTop);',
                                ' oc=oc+gcol*ga*(1.-oa);oa=oa+ga*(1.-oa);',
                ' gl_FragColor=vec4(min(oc,vec3(oa)),oa);',
                '}'
            ].join('\n');
            function sh(type, src) {
                var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
                if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(o)); return null; }
                return o;
            }
            var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            function prog(fsSrc, names) {
                var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, fsSrc);
                if (!vs || !fs) return null;
                var p = gl.createProgram();
                gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
                var u = {};
                names.forEach(function (n) { u[n] = gl.getUniformLocation(p, n); });
                return { p: p, u: u, a: gl.getAttribLocation(p, 'a') };
            }
            var P = prog(FS_PLANET, ['uRes', 'uTime', 'uL', 'uHeat']), M = null;
            if (!P) { core.classList.add('no-gl'); return null; }
            var cur = P;
            gl.clearColor(0, 0, 0, 0);
            return {
                heat: 0,
                resize: function () {
                    var s = core.clientWidth * (cur === P ? DPR : Math.min(DPR, 1));   // el hongo (humo) a resolución normal
                    cv.width = cv.height = Math.max(2, Math.round(s));
                    gl.viewport(0, 0, cv.width, cv.height);
                },
                draw: function (t) {
                    gl.useProgram(cur.p);
                    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                    gl.enableVertexAttribArray(cur.a); gl.vertexAttribPointer(cur.a, 2, gl.FLOAT, false, 0, 0);
                    gl.uniform2f(cur.u.uRes, cv.width, cv.height);
                    gl.uniform1f(cur.u.uTime, t);
                    if (cur === P) { gl.uniform3f(P.u.uL, -0.7, 0.45, 0.55); gl.uniform1f(P.u.uHeat, this.heat); }
                    else gl.uniform1f(cur.u.uLight, light ? 1 : 0);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                },
                setBoom: function (on) {
                    if (on && !M) M = prog(FS_HONGO, ['uRes', 'uTime', 'uLight']);
                    cur = on && M ? M : P;
                    this.resize();
                }
            };
        })();

        // cambia el carrusel al modo explosión (o vuelve al planeta)
        var origGeo = rings.map(function (r) { return { rx: r.rxF, ry: r.ryF, tilt: r.tilt }; });
        function setBoom(on) {
            boom = !!on;
            orbit.classList.toggle('is-boom', boom);
            rings.forEach(function (r, i) {
                var g = boom ? BOOM_GEO[i] || origGeo[i] : origGeo[i];
                r.rxF = g.rx; r.ryF = g.ry; r.tilt = boom ? g.tilt * Math.PI / 180 : g.tilt;
            });
            if (planet) planet.setBoom(boom);
            size(); place();
        }

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
            if (unlockReady && window.hfIntro) window.hfIntro.unlock();   // gesto del usuario: se desbloquea el sonido
            if (!drag) return;
            drag = null;
            orbit.classList.remove('dragging');
            mulTarget = orbit.matches(':hover') ? 0.3 : 1;
        }
        orbit.addEventListener('pointerup', endDrag);
        orbit.addEventListener('pointercancel', endDrag);

        var last = performance.now(), t0 = last, visible = true;
        var unlockReady = false;
        var prevOff = rings[0].off, spinMeter = 0, SPIN_GOAL = 21, eggBusy = false;   // unas 3,5 vueltas rápidas (que no salte sin querer)
        function launchEgg() {
            eggBusy = true; spinMeter = 0; spinV = 0;
            if (drag) { drag = null; orbit.classList.remove('dragging'); }
            var ok = window.hfIntro && window.hfIntro.start({
                onReveal: function () { setBoom(true); if (planet) planet.heat = 0; },
                onDone: function () { eggBusy = false; prevOff = rings[0].off; }
            });
            if (!ok) { setBoom(true); eggBusy = false; }
        }
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(orbit);
        }
        (function tick(now) {
            requestAnimationFrame(tick);
            var dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (!visible || document.hidden || document.documentElement.classList.contains('cv-intro-on')) return;
            if (!drag) {
                mul += (mulTarget - mul) * Math.min(1, dt * 3);
                spinV *= Math.pow(0.04, dt);                         // la inercia se frena sola
                rings.forEach(function (r) {
                    r.off += (r.speed * mul) * dt + spinV * dt * (r.speed < 0 ? -1.25 : 1);
                });
                beltOff += (0.05 * mul + spinV * 0.4) * dt;
            }
            rings.forEach(function (r) { r.items.forEach(function (it) { it._spin += it._vs * dt; }); });
            // EASTER EGG: se mide cuánto giran las órbitas (se va olvidando poco a poco);
            // si se las hace girar muy rápido varias vueltas, salta la bomba
            var dOff = Math.abs(rings[0].off - prevOff); prevOff = rings[0].off;
            spinMeter = spinMeter * Math.exp(-dt * 0.7) + dOff;
            var heat = Math.max(0, Math.min(1, (spinMeter - 3) / (SPIN_GOAL - 3)));
            if (planet) planet.heat += (heat - planet.heat) * Math.min(1, dt * 6);
            orbit.classList.toggle('is-hot', heat > 0.15);
            if (spinMeter > 2 && window.hfIntro) window.hfIntro.preload();
            unlockReady = spinMeter > 2;
            if (spinMeter > SPIN_GOAL && !eggBusy) launchEgg();
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
            if (document.hidden || document.documentElement.classList.contains('cv-intro-on')) return;
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