/* Se ejecuta antes de pintar: aplica el tema guardado y evita parpadeos */
(function () {
    var r = document.currentScript.parentNode, t;
    try { t = localStorage.getItem('hf-theme'); } catch (e) { }
    if (t !== 'light' && t !== 'dark') {
        t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    r.setAttribute('data-theme', t);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) r.classList.add('hm-anim');
})();