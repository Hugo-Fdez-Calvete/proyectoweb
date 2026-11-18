/* ============================================================
   PULSO · Audio
   - Motor Web Audio con un analizador común.
   - Fuentes: archivos (<audio>), sintetizador de demo, captura
     del audio de la pestaña (para YouTube) y ritmo simulado.
   - getLevels() devuelve graves / medios / agudos / golpe / espectro.
   ============================================================ */
(function () {
    'use strict';

    var P = window.Pulso = window.Pulso || {};

    /* ---------- Pistas de demo (se generan en el navegador) ---------- */
    // Acordes en semitonos relativos a la raíz de cada preset
    var PRESETS = [
        {
            name: 'Noche cian', style: 'House · 124 BPM', bpm: 124, root: 57,
            chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
            kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14], hat16: false,
            bass: [2, 6, 10, 14], bassOct: -12, arp: 16, pump: true, pad: 0.55
        },
        {
            name: 'Deriva', style: 'Ambient · 84 BPM', bpm: 84, root: 50,
            chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
            kick: [0, 10], clap: [8], hat: [0, 2, 4, 6, 8, 10, 12, 14], hat16: true,
            bass: [0, 10], bassOct: -12, arp: 8, pump: false, pad: 0.8
        },
        {
            name: 'Órbita', style: 'Techno melódico · 132 BPM', bpm: 132, root: 52,
            chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-2, 2, 5]],
            kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14], hat16: true,
            bass: [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15], bassOct: -12, arp: 16, pump: true, pad: 0.45
        }
    ];

    function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

    /* ---------- Sintetizador ---------- */
    function Synth(ctx, out) {
        var preset = PRESETS[0], playing = false, step = 0, nextTime = 0, timer = null, startedAt = 0;

        // bus -> compresor -> ganancia de compensación -> limitador -> salida
        var bus = ctx.createGain(); bus.gain.value = 0.9;
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
        var makeup = ctx.createGain(); makeup.gain.value = 2.6;
        var limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20;
        limiter.attack.value = 0.001; limiter.release.value = 0.08;
        bus.connect(comp); comp.connect(makeup); makeup.connect(limiter); limiter.connect(out);

        // reverb con respuesta al impulso generada
        var rev = ctx.createConvolver();
        var len = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (var c = 0; c < 2; c++) {
            var d = ir.getChannelData(c);
            for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        }
        rev.buffer = ir;
        var revGain = ctx.createGain(); revGain.gain.value = 0.35;
        rev.connect(revGain); revGain.connect(bus);

        // delay para el arpegio
        var dly = ctx.createDelay(1.5), fb = ctx.createGain(), dlyOut = ctx.createGain();
        fb.gain.value = 0.38; dlyOut.gain.value = 0.35;
        dly.connect(fb); fb.connect(dly); dly.connect(dlyOut); dlyOut.connect(bus); dlyOut.connect(rev);

        // bus de pads (con "bombeo" al ritmo del bombo)
        var padBus = ctx.createGain(); padBus.connect(bus); padBus.connect(rev);

        var noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        var nd = noise.getChannelData(0);
        for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;

        function env(g, t, a, peak, dec) {
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(peak, t + a);
            g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
        }

        function kick(t) {
            var o = ctx.createOscillator(), g = ctx.createGain();
            o.frequency.setValueAtTime(155, t);
            o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
            env(g, t, 0.003, 1.0, 0.42);
            o.connect(g); g.connect(bus);
            o.start(t); o.stop(t + 0.5);
            if (preset.pump) {
                padBus.gain.cancelScheduledValues(t);
                padBus.gain.setValueAtTime(0.25, t);
                padBus.gain.linearRampToValueAtTime(1, t + 60 / preset.bpm * 0.6);
            }
        }

        function noiseHit(t, type, freq, peak, dec, dest) {
            var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
            s.buffer = noise; f.type = type; f.frequency.value = freq;
            env(g, t, 0.002, peak, dec);
            s.connect(f); f.connect(g); g.connect(dest || bus);
            s.start(t, Math.random() * 0.5); s.stop(t + dec + 0.05);
        }

        function clap(t) {
            noiseHit(t, 'bandpass', 1700, 0.55, 0.2);
            noiseHit(t, 'bandpass', 2400, 0.12, 0.45, rev);
        }

        function bassNote(t, midi, dur) {
            var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
            o.type = 'sawtooth'; o.frequency.value = mtof(midi);
            f.type = 'lowpass'; f.Q.value = 6;
            f.frequency.setValueAtTime(220, t);
            f.frequency.exponentialRampToValueAtTime(1300, t + 0.02);
            f.frequency.exponentialRampToValueAtTime(240, t + dur);
            env(g, t, 0.006, 0.32, dur);
            o.connect(f); f.connect(g); g.connect(bus);
            o.start(t); o.stop(t + dur + 0.05);
        }

        function pad(t, notes, dur) {
            var f = ctx.createBiquadFilter(), g = ctx.createGain();
            f.type = 'lowpass'; f.frequency.setValueAtTime(500, t);
            f.frequency.linearRampToValueAtTime(1800, t + dur * 0.5);
            f.frequency.linearRampToValueAtTime(700, t + dur);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.06 * preset.pad, t + 0.8);
            g.gain.setValueAtTime(0.06 * preset.pad, t + dur - 0.4);
            g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
            f.connect(g); g.connect(padBus);
            notes.forEach(function (m) {
                [-7, 7].forEach(function (cents) {
                    var o = ctx.createOscillator();
                    o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = cents;
                    o.connect(f); o.start(t); o.stop(t + dur + 0.7);
                });
            });
        }

        function pluck(t, midi) {
            var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
            o.type = 'square'; o.frequency.value = mtof(midi);
            f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t);
            f.frequency.exponentialRampToValueAtTime(400, t + 0.22);
            env(g, t, 0.004, 0.07, 0.28);
            o.connect(f); f.connect(g); g.connect(bus); g.connect(dly);
            o.start(t); o.stop(t + 0.35);
        }

        function playStep(s, t) {
            var p = preset, st = s % 16, bar = Math.floor(s / 16), cycleBar = bar % 16;
            var chord = p.chords[bar % p.chords.length].map(function (n) { return p.root + n; });
            var sixteenth = 60 / p.bpm / 4;
            var drop = cycleBar >= 4;                 // 4 compases de intro sin bombo
            var build = cycleBar >= 12;

            if (st === 0) pad(t, chord, sixteenth * 16);
            if (drop && p.kick.indexOf(st) >= 0) kick(t);
            if (drop && p.clap.indexOf(st) >= 0) clap(t);
            if (p.hat.indexOf(st) >= 0) noiseHit(t, 'highpass', 7500, 0.16, build && st % 4 === 2 ? 0.22 : 0.05);
            if (p.hat16 && drop && p.hat.indexOf(st) < 0) noiseHit(t, 'highpass', 9000, 0.05, 0.03);
            if (drop && p.bass.indexOf(st) >= 0) bassNote(t, chord[0] + p.bassOct, sixteenth * 1.6);
            var arpEvery = 16 / p.arp;
            if (st % arpEvery === 0) {
                var k = Math.floor(st / arpEvery);
                var seq = [0, 1, 2, 1, 2, 0, 2, 1];
                var note = chord[seq[k % seq.length]] + 12 + (k % 8 >= 6 ? 12 : 0);
                pluck(t, note);
            }
        }

        function tick() {
            var spb = 60 / preset.bpm / 4;
            while (nextTime < ctx.currentTime + 0.15) {
                playStep(step, nextTime);
                nextTime += spb;
                step++;
            }
        }

        return {
            presets: PRESETS,
            start: function (i) {
                this.stop();
                preset = PRESETS[i] || PRESETS[0];
                dly.delayTime.value = 60 / preset.bpm * 0.75;
                padBus.gain.cancelScheduledValues(0); padBus.gain.value = 1;
                step = 0; nextTime = ctx.currentTime + 0.08; startedAt = nextTime;
                playing = true;
                tick();
                timer = setInterval(tick, 25);
            },
            stop: function () {
                playing = false;
                if (timer) clearInterval(timer);
                timer = null;
            },
            get playing() { return playing; },
            get elapsed() { return playing ? Math.max(0, ctx.currentTime - startedAt) : 0; },
            get preset() { return preset; }
        };
    }

    /* ---------- Motor ---------- */
    P.Audio = function () {
        var ctx = null, pre, vol, analyser, sink, mediaSrc = null, synth = null;
        var capture = null, captureSrc = null;
        /* Chrome y Edge: la música suena directamente por el navegador y Web Audio solo la
           «escucha» (captureStream) para el visualizador. Si Web Audio falla en el equipo,
           la música sigue sonando. Firefox y Safari: se enruta por Web Audio como siempre. */
        var NATIVE = typeof HTMLMediaElement.prototype.captureStream === 'function' &&
                     !/firefox/i.test(navigator.userAgent);
        var tapIn = null, elTap = null;
        var el = null, handlers = [];
        var volume = 0.8;
        function newElement() {
            el = new Audio();
            el.preload = 'auto';
            if (NATIVE) el.volume = volume;
            el.addEventListener('playing', tapElement);
            handlers.forEach(function (h) { el.addEventListener(h[0], h[1]); });
        }
        function tapElement() {
            if (!NATIVE || !ctx || !el) return;
            try {
                var stream = el.captureStream();
                var tracks = stream.getAudioTracks();
                if (!tracks.length) { stream.onaddtrack = function () { tapElement(); }; return; }
                if (elTap) { try { elTap.disconnect(); } catch (e) { } }
                elTap = ctx.createMediaStreamSource(new MediaStream(tracks));
                elTap.connect(tapIn);           // solo al analizador: nunca a los altavoces
                if (ctx.state !== 'running') ctx.resume().catch(function () { });
            } catch (e) { elTap = null; }
        }
        newElement();

        var freq = null, binMap = [];
        var spectrum = new Uint8Array(128);
        var lv = { bass: 0, mid: 0, treble: 0, energy: 0, beat: false, live: false, spectrum: spectrum };
        var agc = { bass: 0.35, mid: 0.3, treble: 0.25 };
        var bassAvg = 0, lastBeat = 0, clock = 0;
        var sim = { on: false, bpm: 120, phase: 0 };

        function ensure() {
            if (ctx) return ctx;
            var AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            try { ctx = new AC(); } catch (e) { ctx = null; return null; }   // sin Web Audio: la música suena igual
            // Chrome avisa con «error» si se cae el dispositivo de audio (cambio de auriculares,
            // de salida, captura de pestaña…): se reconstruye el motor y sigue sonando
            ctx.addEventListener('error', function () { recover('device'); });
            ctx.addEventListener('statechange', function () {
                if (ctx && ctx.state === 'interrupted') ctx.resume().catch(function () { });
            });

            // pre (todas las fuentes) -> analizador          (se mide antes del volumen)
            //                         -> volumen -> altavoces
            pre = ctx.createGain();
            vol = ctx.createGain(); vol.gain.value = volume;
            analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.55;   // respuesta rápida: sigue el golpe en tiempo real
            analyser.minDecibels = -88;
            analyser.maxDecibels = -18;
            sink = ctx.createGain(); sink.gain.value = 0;   // mantiene vivo el analizador sin sonar

            pre.connect(vol); vol.connect(ctx.destination);
            pre.connect(analyser); analyser.connect(sink); sink.connect(ctx.destination);

            freq = new Uint8Array(analyser.frequencyBinCount);
            buildBinMap();

            tapIn = ctx.createGain();
            tapIn.connect(analyser);
            if (NATIVE) {
                if (el && !el.paused) tapElement();
            } else {
                mediaSrc = ctx.createMediaElementSource(el);
                mediaSrc.connect(pre);
            }
            synth = Synth(ctx, pre);
            return ctx;
        }

        // 128 bandas logarítmicas entre 30 Hz y 16 kHz
        function buildBinMap() {
            var hz = ctx.sampleRate / analyser.fftSize, lo = 30, hi = 16000;
            binMap = [];
            for (var i = 0; i < 128; i++) {
                var f0 = lo * Math.pow(hi / lo, i / 128), f1 = lo * Math.pow(hi / lo, (i + 1) / 128);
                var b0 = Math.floor(f0 / hz), b1 = Math.max(b0 + 1, Math.ceil(f1 / hz));
                binMap.push([b0, Math.min(b1, freq.length)]);
            }
        }

        function bandAvg(f0, f1) {
            var hz = ctx.sampleRate / analyser.fftSize;
            var a = Math.max(1, Math.floor(f0 / hz)), b = Math.min(freq.length, Math.ceil(f1 / hz));
            var s = 0;
            for (var i = a; i < b; i++) s += freq[i];
            return b > a ? s / (b - a) / 255 : 0;
        }

        function norm(key, raw, dt) {
            // control automático de ganancia: lo que importa es la variación
            var a = agc[key];
            agc[key] = raw > a ? a + (raw - a) * Math.min(1, dt * 6) : a + (raw - a) * Math.min(1, dt * 0.25);
            agc[key] = Math.max(agc[key], 0.18);
            return Math.min(1, Math.pow(raw / agc[key], 1.6) * 0.85);
        }

        function realAnalysisActive() {
            if (!ctx) return false;
            if (capture) return true;
            if (synth && synth.playing) return true;
            return !el.paused && !el.ended;
        }

        function simulated(dt) {
            sim.phase += dt * sim.bpm / 60;
            var beat = false;
            if (sim.phase >= 1) { sim.phase -= 1; beat = true; }
            var ph = sim.phase;
            var bass = Math.exp(-ph * 5.5) * 0.85 + 0.08;
            var mid = 0.32 + 0.16 * Math.sin(clock * 0.8) + 0.08 * Math.sin(clock * 3.1);
            var sixteenth = (ph * 4) % 1;
            var tre = 0.18 + 0.35 * Math.exp(-sixteenth * 7) * (0.6 + 0.4 * Math.sin(clock * 0.37));
            for (var i = 0; i < 128; i++) {
                var x = i / 128;
                var v = (1 - x) * bass * 0.9 * Math.exp(-x * 3)
                    + mid * 0.6 * Math.exp(-Math.pow((x - 0.45) / 0.2, 2))
                    + tre * 0.5 * Math.exp(-Math.pow((x - 0.8) / 0.15, 2))
                    + Math.random() * 0.08;
                spectrum[i] = Math.min(255, v * 255);
            }
            lv.bass = bass; lv.mid = mid; lv.treble = tre;
            lv.energy = (bass + mid + tre) / 3; lv.beat = beat;
        }

        function getLevels(dt) {
            clock += dt;
            lv.beat = false;
            lv.live = realAnalysisActive();       // solo hay figura con audio real
            if (lv.live) {
                analyser.getByteFrequencyData(freq);
                for (var i = 0; i < 128; i++) {
                    var r = binMap[i], s = 0;
                    for (var b = r[0]; b < r[1]; b++) s = Math.max(s, freq[b]);
                    spectrum[i] = s;
                }
                var bRaw = bandAvg(35, 160), mRaw = bandAvg(250, 2200), tRaw = bandAvg(4000, 12000);
                lv.bass = norm('bass', bRaw, dt);
                lv.mid = norm('mid', mRaw, dt);
                lv.treble = norm('treble', tRaw, dt);
                lv.energy = (lv.bass * 1.2 + lv.mid + lv.treble * 0.8) / 3;

                // detección de golpes sobre los graves
                bassAvg += (bRaw - bassAvg) * Math.min(1, dt * 2.5);
                if (bRaw > bassAvg * 1.18 + 0.03 && bRaw > 0.22 && clock - lastBeat > 0.27) {
                    lv.beat = true; lastBeat = clock;
                }
                // si es silencio, cae a cero
                if (bRaw + mRaw + tRaw < 0.01) { lv.bass *= 0.9; lv.mid *= 0.9; lv.treble *= 0.9; }
            } else if (sim.on) {
                simulated(dt);
            } else {
                var k = Math.pow(0.05, dt);
                lv.bass *= k; lv.mid *= k; lv.treble *= k; lv.energy *= k;
                for (var j = 0; j < 128; j++) spectrum[j] *= k;
            }
            return lv;
        }

        function stopCapture() {
            if (!capture) return;
            capture.getTracks().forEach(function (t) { t.stop(); });
            if (captureSrc) captureSrc.disconnect();
            capture = null; captureSrc = null;
            pre.connect(analyser);
            tapIn.connect(analyser);
            if (api.onCaptureChange) api.onCaptureChange(false);
        }

        /* Reconstruye el AudioContext y el <audio> conservando lo que sonaba */
        var rebuilds = [];
        function recover(reason) {
            var now = Date.now();
            rebuilds = rebuilds.filter(function (t) { return now - t < 60000; });
            if (rebuilds.length >= 3) { if (api.onRecover) api.onRecover('fail'); return; }
            rebuilds.push(now);

            var src = el.getAttribute('src') ? el.src : '';
            var t = el.currentTime || 0, playing = !el.paused && !el.ended;
            var synthIdx = synth && synth.playing ? PRESETS.indexOf(synth.preset) : -1;
            var cap = capture;

            if (!NATIVE) {
                handlers.forEach(function (h) { el.removeEventListener(h[0], h[1]); });
                el.removeEventListener('playing', tapElement);
                try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { }
            }
            if (synth) synth.stop();
            if (captureSrc) { try { captureSrc.disconnect(); } catch (e) { } captureSrc = null; }
            if (elTap) { try { elTap.disconnect(); } catch (e) { } elTap = null; }
            var old = ctx;
            ctx = null; mediaSrc = null; synth = null;
            try { old.close(); } catch (e) { }

            if (!NATIVE) newElement();
            ensure();

            var audioTrack = cap && cap.getAudioTracks()[0];
            if (audioTrack && audioTrack.readyState === 'live') {
                captureSrc = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
                captureSrc.connect(analyser);
                try { pre.disconnect(analyser); } catch (e) { }
                try { tapIn.disconnect(analyser); } catch (e) { }
            } else if (cap) {
                capture = null;
            }
            if (src && !NATIVE) {
                var seekTo = function () {
                    el.removeEventListener('loadedmetadata', seekTo);
                    try { el.currentTime = t; } catch (e) { }
                };
                el.addEventListener('loadedmetadata', seekTo);
                el.src = src;
                if (playing) el.play().catch(function () { });
            }
            if (synthIdx >= 0) synth.start(synthIdx);
            ctx.resume().catch(function () { });
            if (api.onRecover) api.onRecover(reason);
        }

        var api = {
            get el() { return el; },
            on: function (type, fn) { handlers.push([type, fn]); el.addEventListener(type, fn); },
            onRecover: null,
            presets: PRESETS,
            onCaptureChange: null,

            /* Hay que llamarlo dentro de un clic/tecla: los navegadores no dejan sonar sin interacción */
            unlock: function () {
                var c = null;
                try { c = ensure(); } catch (e) { c = null; }
                if (!c) return Promise.resolve();
                // iPhone/iPad: que el modo silencio no apague Web Audio (Safari 16.4+)
                try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { }
                if (c.state !== 'running') {
                    // un sonido vacío desbloquea Safari antiguo
                    try {
                        var b = c.createBufferSource();
                        b.buffer = c.createBuffer(1, 1, c.sampleRate);
                        b.connect(c.destination); b.start(0);
                    } catch (e) { }
                    return c.resume().catch(function () { });
                }
                return Promise.resolve();
            },
            get state() { return ctx ? ctx.state : 'none'; },

            playFile: function (url) {
                this.unlock();
                if (synth) synth.stop();
                var abs = new URL(url, location.href).href;
                if (el.src !== abs) el.src = abs;
                return el.play();
            },
            pauseFile: function () { el.pause(); },

            playSynth: function (i) {
                this.unlock();
                if (!synth) return;
                el.pause();
                synth.start(i);
            },
            stopSynth: function () { if (synth) synth.stop(); },
            get synthPlaying() { return !!(synth && synth.playing); },
            get synthElapsed() { return synth ? synth.elapsed : 0; },

            pauseAll: function () { el.pause(); if (synth) synth.stop(); },

            setVolume: function (v) {
                volume = v;
                if (NATIVE && el) el.volume = Math.max(0, Math.min(1, v));
                if (vol) vol.gain.setTargetAtTime(v, ctx.currentTime, 0.03);
            },
            get native() { return NATIVE; },

            setSimulated: function (on, bpm) { sim.on = on; if (bpm) sim.bpm = bpm; },

            get capturing() { return !!capture; },
            get canCapture() {
                return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
            },

            /* Captura el audio de ESTA pestaña (incluido el iframe de YouTube).
               Solo se conecta al analizador, nunca a los altavoces (no hay eco). */
            captureTab: function () {
                var self = this;
                if (!this.canCapture || !ensure()) return Promise.reject(new Error('unsupported'));
                return navigator.mediaDevices.getDisplayMedia({
                    // sin límite de tamaño: Chrome muestra la pantalla completa al tamaño de la captura
                    video: { displaySurface: 'browser' },
                    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false },
                    preferCurrentTab: true,
                    selfBrowserSurface: 'include',
                    systemAudio: 'include',
                    surfaceSwitching: 'exclude'
                }).then(function (stream) {
                    if (!stream.getAudioTracks().length) {
                        stream.getTracks().forEach(function (t) { t.stop(); });
                        throw new Error('noaudio');
                    }
                    stopCapture();
                    capture = stream;
                    captureSrc = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
                    captureSrc.connect(analyser);
                    // el audio de la pestaña ya incluye lo que suena aquí: evita contarlo dos veces
                    try { pre.disconnect(analyser); } catch (e) { }
                    try { tapIn.disconnect(analyser); } catch (e) { }
                    // solo hace falta el audio: el vídeo se corta en cuanto llega
                    // (así Chrome deja de tratar la pestaña como «grabada» y la pantalla completa va bien)
                    stream.getVideoTracks().forEach(function (t) { t.stop(); });
                    stream.getAudioTracks().forEach(function (t) {
                        t.addEventListener('ended', stopCapture);
                    });
                    if (ctx.state === 'suspended') ctx.resume();
                    if (self.onCaptureChange) self.onCaptureChange(true);
                });
            },
            stopCapture: stopCapture,

            getLevels: getLevels
        };
        return api;
    };
})();
