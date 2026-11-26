/* ============================================================
   Proyectos: ampliar capturas y reproducir los vídeos
   - Los vídeos empiezan solos cuando se ven en pantalla (sin sonido)
     y se paran al salir. Con «reducir movimiento» activado, solo con
     el botón de reproducir.
   ============================================================ */
(function () {
    'use strict';

    // ---------- Captura ampliada ----------
    var box = document.getElementById('pj-lightbox');
    if (box && typeof box.showModal === 'function') {
        var big = box.querySelector('img');
        document.querySelectorAll('.pj-zoom').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var img = btn.querySelector('img');
                big.src = img.currentSrc || img.src;
                big.alt = img.alt;
                box.showModal();
            });
        });
        box.querySelector('.pj-lightbox-close').addEventListener('click', function () { box.close(); });
        box.addEventListener('click', function (e) { if (e.target === box) box.close(); });
    }

    // ---------- Varias capturas: botones para cambiar ----------
    document.querySelectorAll('.pj-media.is-stack').forEach(function (media) {
        var shots = Array.prototype.slice.call(media.querySelectorAll('.pj-shot'));
        var bar = document.createElement('div');
        bar.className = 'pj-switch';
        bar.setAttribute('role', 'group');
        bar.setAttribute('aria-label', 'Elegir captura');
        var buttons = shots.map(function (shot, i) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = shot.dataset.label || ('Captura ' + (i + 1));
            b.addEventListener('click', function () { show(i); });
            bar.appendChild(b);
            return b;
        });
        function show(i) {
            shots.forEach(function (s, j) { s.classList.toggle('is-on', i === j); });
            buttons.forEach(function (b, j) { b.setAttribute('aria-pressed', String(i === j)); });
        }
        media.appendChild(bar);
        media.classList.add('has-tabs');
        show(0);
    });

    // ---------- Vídeos ----------
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('.pj-video').forEach(function (video) {
        var frame = video.closest('.pj-frame');
        var play = frame.querySelector('.pj-play');

        function start() {
            if (video.preload === 'none') video.preload = 'auto';
            var p = video.play();
            if (p && p.catch) p.catch(function () { frame.classList.remove('is-playing'); });
            frame.classList.add('is-playing');
        }
        function stop() {
            video.pause();
            frame.classList.remove('is-playing');
        }

        play.addEventListener('click', start);
        video.addEventListener('click', function () { video.paused ? start() : stop(); });

        if (!reduce && 'IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting && entry.intersectionRatio > 0.5) start();
                    else if (!video.paused) stop();
                });
            }, { threshold: [0, 0.5, 1] }).observe(video);
        }
    });
})();
