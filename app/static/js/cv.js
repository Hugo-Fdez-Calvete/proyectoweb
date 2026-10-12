/* Aplica el tema antes de pintar el resto para evitar parpadeos */
(function () {
    var root = document.currentScript.parentElement;
    var theme = null;
    try { theme = localStorage.getItem('cv-theme'); } catch (e) { }
    if (theme !== 'light' && theme !== 'dark') {
        theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    root.setAttribute('data-theme', theme);
})();