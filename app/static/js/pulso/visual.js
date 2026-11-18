/* ============================================================
   PULSO · Visual
   Fondo WebGL (shader de ruido deformado) + capa 2D de chispas.
   Reacciona a:  ratón (lente, estela, ondas al hacer clic)
                 música (graves, medios, agudos, golpes y espectro)
   ============================================================ */
(function () {
    'use strict';

    var P = window.Pulso = window.Pulso || {};

    var VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}';

    var FRAG = [
        'precision highp float;',
        'uniform vec2  uRes;',
        'uniform float uTime, uFlow;',
        'uniform vec2  uMouse, uCenter;',
        'uniform float uMouseVel, uRingR, uRingVis;',
        'uniform float uBass, uMid, uTreble, uEnergy, uBeat, uLight;',
        'uniform vec3  uBase, uBaseLight, uAcc, uSec, uHot;',
        'uniform vec3  uRip[6];',
        'uniform sampler2D uSpec;',

        'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
        'float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);',
        '  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);}',
        'float fbm(vec2 p){float v=0.0,a=0.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);',
        '  for(int i=0;i<5;i++){v+=a*noise(p);p=m*p;a*=0.5;}return v;}',

        'void main(){',
        '  float mn=min(uRes.x,uRes.y);',
        '  vec2 p=(gl_FragCoord.xy-0.5*uRes)/mn;',
        '  vec2 p0=p;',

        /* lente del ratón: empuja el campo hacia fuera */
        '  vec2 dm=p0-uMouse; float md=length(dm);',

        /* ondas de clic */
        '  float rip=0.0;',
        '  for(int i=0;i<6;i++){',
        '    vec3 r=uRip[i]; float age=uTime-r.z;',
        '    if(age>0.0&&age<3.0){',
        '      vec2 dr=p0-r.xy; float d=length(dr); float front=age*0.55;',
        '      float w=sin((d-front)*34.0)*exp(-abs(d-front)*9.0)*exp(-age*1.3);',
        '      p+=normalize(dr+1e-4)*w*0.035; rip+=max(w,0.0)*exp(-age*1.1);',
        '    }',
        '  }',

        /* ruido con deformación de dominio */
        '  float t=uFlow;',
        '  vec2 q=vec2(fbm(p*1.5+vec2(0.0,t)),fbm(p*1.5+vec2(5.2,-t)));',
        '  vec2 r=vec2(fbm(p*1.5+3.0*q+vec2(1.7,9.2)+0.6*t+0.5*uBass),',
        '              fbm(p*1.5+3.0*q+vec2(8.3,2.8)-0.4*t));',
        '  float f=fbm(p*1.5+3.2*r);',

        '  vec3 col=uBase;',
        '  col=mix(col,uSec*0.55,smoothstep(0.30,0.95,f));',
        '  col=mix(col,uAcc*0.70,smoothstep(0.55,1.15,length(q))*(0.45+0.9*uMid));',
        '  col+=uHot*pow(smoothstep(0.45,0.95,r.y),2.0)*(0.20+1.2*uTreble);',
        '  float band=abs(fract(f*9.0+t*0.4)-0.5);',
        '  col+=uAcc*smoothstep(0.05,0.0,band)*(0.05+0.18*uEnergy);',
        '  col*=0.30+0.95*uBass+0.70*uBeat+0.25*uEnergy;',
        '  col+=uAcc*0.05*uBeat+uSec*0.04*uBass;',

        /* brillo del ratón y de las ondas */
        '  col+=uAcc*0.10*exp(-md*6.0)*(0.4+uEnergy);',
        '  col+=mix(uAcc,vec3(1.0),0.3)*rip*0.35;',

        /* anillo de espectro */
        '  vec2 rc=p0-uCenter; float rr=length(rc);',
        '  float a=abs(atan(rc.x,-rc.y))/3.14159265;',
        '  float s=texture2D(uSpec,vec2(0.02+a*0.96,0.5)).r;',
        '  float edge=uRingR+s*0.20;',
        '  float line=smoothstep(0.010,0.0,abs(rr-edge));',
        '  float inner=smoothstep(0.005,0.0,abs(rr-uRingR));',
        '  float bars=smoothstep(0.32,0.18,abs(fract(a*56.0)-0.5));',
        '  float fill=smoothstep(uRingR-0.004,uRingR+0.004,rr)*smoothstep(edge+0.004,edge-0.004,rr);',
        '  col*=1.0-0.45*uRingVis*smoothstep(uRingR,uRingR*0.15,rr);',
        '  vec3 rcol=mix(uAcc,uHot,smoothstep(0.2,0.9,s));',
        '  col+=rcol*uRingVis*(line*1.0+inner*0.45+fill*bars*(0.25+0.6*s));',
        '  col+=rcol*uRingVis*exp(-abs(rr-edge)*26.0)*0.18*(0.3+uEnergy);',

        /* viñeta + grano */
        '  col*=1.0-0.55*smoothstep(0.35,1.15,length(p0));',
        '  col+=(hash(gl_FragCoord.xy+fract(uTime)*91.0)-0.5)*0.035;',

        /* modo claro: misma forma, tinta oscura sobre fondo claro */
        '  if(uLight>0.5){',
        '    vec3 g=max(col-uBase,0.0); float m=max(max(g.r,g.g),g.b);',
        '    vec3 hue=g/max(m,1e-3);',
        '    col=mix(uBaseLight,hue*0.55,clamp(m*0.95,0.0,0.85));',
        '  }',
        '  gl_FragColor=vec4(col,1.0);',
        '}'
    ].join('\n');

    function hexToRgb(h) {
        h = (h || '').trim().replace('#', '');
        if (h.length === 3) h = h.replace(/./g, '$&$&');
        var n = parseInt(h, 16);
        if (isNaN(n)) return null;
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    P.Visual = function (root, getLevels) {
        var glc = root.querySelector('.pl-gl');
        var fxc = root.querySelector('.pl-fx');
        var fx = fxc.getContext('2d');
        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        var W = 0, H = 0, MN = 1;
        var scale = Math.min(window.devicePixelRatio || 1, 1) * 0.85;
        var t0 = performance.now(), last = t0, time = 0, flow = 0;
        var frames = 0, slowSum = 0;

        var target = { x: 0.5, y: 0.5 }, mouse = { x: 0.5, y: 0.5 }, mouseVel = 0, hasPointer = false;
        var figure = true;      // figura del visualizador (anillo + chispas)
        var liveNow = false;    // hay audio real sonando
        var ringMinPx = 0;      // radio mínimo para rodear la portada (modo sin interfaz)
        var ripples = [], ripIdx = 0;
        for (var i = 0; i < 6; i++) ripples.push([0, 0, -99]);
        var beat = 0, ringVis = 0, specSmooth = new Float32Array(128), specBytes = new Uint8Array(128);
        var parts = [];
        var colors = {};
        var light = false;

        /* ---------- WebGL ---------- */
        var gl = null, prog = null, U = {}, tex = null;
        try {
            gl = glc.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
        } catch (e) { gl = null; }

        function compile(type, src) {
            var s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error('[Pulso] shader:', gl.getShaderInfoLog(s));
                return null;
            }
            return s;
        }

        function initGL() {
            var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
            if (!vs || !fs) { gl = null; return; }
            prog = gl.createProgram();
            gl.attachShader(prog, vs); gl.attachShader(prog, fs);
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl = null; return; }
            gl.useProgram(prog);

            var buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            var loc = gl.getAttribLocation(prog, 'a');
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

            ['uRes', 'uTime', 'uFlow', 'uMouse', 'uCenter', 'uMouseVel', 'uRingR', 'uRingVis', 'uBass', 'uMid', 'uTreble',
                'uEnergy', 'uBeat', 'uLight', 'uBase', 'uBaseLight', 'uAcc', 'uSec', 'uHot', 'uRip', 'uSpec'
            ].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

            tex = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 128, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, specBytes);
            gl.uniform1i(U.uSpec, 0);
        }
        if (gl) initGL();
        if (!gl) root.classList.add('pl-nogl');

        glc.addEventListener('webglcontextlost', function (e) { e.preventDefault(); });
        glc.addEventListener('webglcontextrestored', function () { initGL(); readColors(); });

        /* ---------- Colores desde CSS (modo claro/oscuro) ---------- */
        function readColors() {
            var cs = getComputedStyle(root);
            light = document.documentElement.getAttribute('data-theme') === 'light';
            ['base', 'base-light', 'acc', 'sec', 'hot'].forEach(function (k) {
                colors[k] = hexToRgb(cs.getPropertyValue('--pl-gl-' + k)) || [0, 0, 0];
            });
            colors.accCss = cs.getPropertyValue('--pl-acc').trim() || '#22d3ee';
            colors.hotCss = cs.getPropertyValue('--pl-hot').trim() || '#a78bfa';
            if (gl) {
                gl.uniform3fv(U.uBase, colors.base);
                gl.uniform3fv(U.uBaseLight, colors['base-light']);
                gl.uniform3fv(U.uAcc, colors.acc);
                gl.uniform3fv(U.uSec, colors.sec);
                gl.uniform3fv(U.uHot, colors.hot);
                gl.uniform1f(U.uLight, light ? 1 : 0);
            }
        }
        readColors();
        document.addEventListener('hf-themechange', readColors);

        /* ---------- Tamaño ---------- */
        function resize() {
            var r = root.getBoundingClientRect();
            W = Math.max(1, r.width); H = Math.max(1, r.height); MN = Math.min(W, H);
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            fxc.width = Math.round(W * dpr); fxc.height = Math.round(H * dpr);
            fx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (gl) {
                glc.width = Math.max(1, Math.round(W * scale));
                glc.height = Math.max(1, Math.round(H * scale));
                gl.viewport(0, 0, glc.width, glc.height);
                gl.uniform2f(U.uRes, glc.width, glc.height);
            }
        }
        resize();
        window.addEventListener('resize', resize);

        /* ---------- Ratón / táctil ---------- */
        function toNorm(e) {
            var r = root.getBoundingClientRect();
            return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
        }
        // a coordenadas del shader (centro = 0, unidad = lado menor, y hacia arriba)
        function toP(nx, ny) { return [(nx - 0.5) * W / MN, (0.5 - ny) * H / MN]; }

        window.addEventListener('pointermove', function (e) {
            var n = toNorm(e);
            var dx = n.x - target.x, dy = n.y - target.y;
            mouseVel = Math.min(1.5, mouseVel + Math.sqrt(dx * dx + dy * dy) * 6);
            target = n; hasPointer = true;
            // estela de chispas cuando el ratón va rápido
            if (figure && liveNow && !reduce && Math.sqrt(dx * dx + dy * dy) > 0.01 && parts.length < 700) {
                spawn(n.x * W, n.y * H, (Math.random() - .5) * 40, (Math.random() - .5) * 40, 0.9, 1);
            }
        }, { passive: true });

        document.addEventListener('pointerleave', function () { hasPointer = false; });

        function ripple(nx, ny) {
            var p = toP(nx, ny);
            ripples[ripIdx] = [p[0], p[1], time];
            ripIdx = (ripIdx + 1) % 6;
            burst(nx * W, ny * H, 26, 1.0);
        }

        /* ---------- Chispas ---------- */
        function spawn(x, y, vx, vy, life, size) {
            parts.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, s: size, hot: Math.random() < 0.35 });
        }
        function burst(x, y, n, power) {
            for (var i = 0; i < n; i++) {
                var a = Math.random() * Math.PI * 2, sp = (80 + Math.random() * 260) * power;
                spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.9 + Math.random() * 1.2, 1 + Math.random() * 1.6);
            }
        }
        function ringBurst(cx, cy, R, n, power) {
            for (var i = 0; i < n; i++) {
                var a = Math.random() * Math.PI * 2, sp = (60 + Math.random() * 220) * power;
                spawn(cx + Math.cos(a) * R, cy + Math.sin(a) * R, Math.cos(a) * sp, Math.sin(a) * sp,
                    1.0 + Math.random() * 1.4, 0.8 + Math.random() * 1.8);
            }
        }

        function drawParts(dt, mx, my) {
            fx.clearRect(0, 0, W, H);
            fx.globalCompositeOperation = light ? 'source-over' : 'lighter';
            for (var i = parts.length - 1; i >= 0; i--) {
                var p = parts[i];
                p.life -= dt;
                if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
                // remolino alrededor del ratón
                var dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy + 400;
                if (hasPointer && d2 < 160 * 160) {
                    var f = 9000 / d2;
                    p.vx += (-dy * f * 0.9 + dx * f * 0.4) * dt;
                    p.vy += (dx * f * 0.9 + dy * f * 0.4) * dt;
                }
                p.vx *= 1 - 1.6 * dt; p.vy *= 1 - 1.6 * dt;
                p.x += p.vx * dt; p.y += p.vy * dt;
                var k = p.life / p.max;
                fx.globalAlpha = Math.min(1, k * 1.4) * (light ? 0.65 : 0.9);
                fx.fillStyle = p.hot ? colors.hotCss : colors.accCss;
                fx.beginPath();
                fx.arc(p.x, p.y, p.s * (0.6 + k), 0, 6.2832);
                fx.fill();
            }
            fx.globalAlpha = 1;
        }

        /* ---------- Bucle ---------- */
        var spec = new Uint8Array(128);
        function frame(now) {
            requestAnimationFrame(frame);
            var dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            time = (now - t0) / 1000;

            var L = getLevels ? getLevels(dt) : null;
            var bass = L ? L.bass : 0, mid = L ? L.mid : 0, tre = L ? L.treble : 0, en = L ? L.energy : 0;
            if (L && L.spectrum) spec = L.spectrum;

            if (L && L.beat) beat = 1;
            beat *= Math.pow(0.02, dt);              // cae rápido
            mouseVel *= Math.pow(0.08, dt);

            var speed = reduce ? 0.3 : 1;
            flow += dt * (0.10 + en * 0.55 + bass * 0.25) * speed;

            mouse.x += (target.x - mouse.x) * Math.min(1, dt * 5);
            mouse.y += (target.y - mouse.y) * Math.min(1, dt * 5);
            var mp = toP(mouse.x, mouse.y);
            // el anillo se queda fijo en el centro; lo que se mueve es el fondo
            var cx = 0.5, cy = 0.5;
            var cp = toP(cx, cy);
            // desplazamiento del fondo según la posición del ratón (efecto profundidad)
            var ringBase = Math.max(0.17, ringMinPx ? (ringMinPx * 0.75) / MN : 0);
            var ringR = ringBase + bass * 0.05 + beat * 0.025;
            // el anillo casi desaparece en silencio y aparece con la música
            // la figura solo aparece si el usuario la quiere Y hay audio real
            var live = !!(L && L.live);
            liveNow = live;
            var ringTarget = figure && live ? (en > 0.04 ? 1 : 0.15) : 0;
            ringVis += (ringTarget - ringVis) * Math.min(1, dt * (ringTarget > ringVis ? 1.5 : 4));

            for (var i = 0; i < 128; i++) {
                var v = spec[i] / 255;
                specSmooth[i] += (v - specSmooth[i]) * (v > specSmooth[i] ? 0.6 : 0.18);
                specBytes[i] = specSmooth[i] * 255;
            }

            if (gl) {
                gl.uniform1f(U.uTime, time);
                gl.uniform1f(U.uFlow, flow);
                gl.uniform2f(U.uMouse, mp[0], mp[1]);
                gl.uniform2f(U.uCenter, cp[0], cp[1]);
                gl.uniform1f(U.uMouseVel, Math.min(1, mouseVel));
                gl.uniform1f(U.uRingR, ringR);
                gl.uniform1f(U.uRingVis, ringVis);
                gl.uniform1f(U.uBass, bass);
                gl.uniform1f(U.uMid, mid);
                gl.uniform1f(U.uTreble, tre);
                gl.uniform1f(U.uEnergy, en);
                gl.uniform1f(U.uBeat, beat);
                var flat = [];
                for (var r = 0; r < 6; r++) flat.push(ripples[r][0], ripples[r][1], ripples[r][2]);
                gl.uniform3fv(U.uRip, flat);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 128, 1, gl.LUMINANCE, gl.UNSIGNED_BYTE, specBytes);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }

            // chispas que salen del anillo con cada golpe
            if (figure && live && !reduce && L.beat && parts.length < 700) {
                ringBurst(cx * W, cy * H, ringR * MN, Math.round(10 + bass * 30), 0.6 + bass);
            }
            drawParts(dt, mouse.x * W, mouse.y * H);

            // calidad adaptativa: si va lento, baja la resolución del shader
            if (gl) {
                frames++; slowSum += dt;
                if (frames === 90) {
                    if (slowSum / frames > 0.026 && scale > 0.4) { scale *= 0.8; resize(); }
                    frames = 0; slowSum = 0;
                }
            }
        }
        requestAnimationFrame(frame);

        /* Mostrar / quitar la figura (anillo y chispas). El fondo sigue animándose. */
        function setFigure(on) {
            figure = !!on;
            root.classList.toggle('pl-viz-off', !figure);
            if (!figure) { parts.length = 0; fx.clearRect(0, 0, W, H); }
        }

        return {
            ripple: function (x, y) { if (figure && liveNow) ripple(x, y); },
            refreshColors: readColors,
            setFigure: setFigure,
            setRingMinPx: function (px) { ringMinPx = px || 0; },
            get figure() { return figure; }
        };
    };
})();
