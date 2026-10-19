(function () {
    var btn = document.querySelector('.hf-menu-btn');
    var panel = document.getElementById('hf-menu');
    if (!btn || !panel) return;

    function isOpen() { return panel.classList.contains('open'); }

    function setOpen(open) {
        panel.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
        btn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    }

    btn.addEventListener('click', function () { setOpen(!isOpen()); });

    // Cerrar al pulsar fuera
    document.addEventListener('click', function (e) {
        if (isOpen() && !panel.contains(e.target) && !btn.contains(e.target)) setOpen(false);
    });

    // Cerrar con Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isOpen()) { setOpen(false); btn.focus(); }
    });

    // Cerrar al navegar
    panel.addEventListener('click', function (e) {
        if (e.target.closest('a')) setOpen(false);
    });
})();

/* Navbar que se esconde acorde al scroll */
(function () {
    var nav = document.querySelector('nav.wrapper');
    if (!nav) return;

    var offset = 0;                 // píxeles ocultos (0 = visible del todo)
    var lastY = window.scrollY;
    var ticking = false;

    function maxHide() {
        // altura del navbar + su margen superior + un pequeño extra
        return nav.offsetHeight + 20;
    }

    function update() {
        var y = Math.max(window.scrollY, 0);   // evita el rebote de iOS
        var delta = y - lastY;
        lastY = y;

        // Baja: se oculta poco a poco. Sube: reaparece poco a poco.
        offset = Math.min(Math.max(offset + delta, 0), maxHide());
        if (y <= 0) offset = 0;

        nav.style.setProperty('--nav-hide', offset + 'px');
        ticking = false;
    }

    window.addEventListener('scroll', function () {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(update);
        }
    }, { passive: true });

    window.addEventListener('resize', update);
    update();
})();