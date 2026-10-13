(function () {
    var KEY = 'hf-theme';
    var html = document.documentElement;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function read() {
        var t = null;
        try { t = localStorage.getItem(KEY) || localStorage.getItem('cv-theme'); } catch (e) { }
        if (t !== 'light' && t !== 'dark') {
            t = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }
        return t;
    }

    var theme = read();

    /* Se aplica en el <head>, antes de pintar nada */
    html.setAttribute('data-theme', theme);
    if (!reduce) html.classList.add('hm-anim');

    function syncButton() {
        var btn = document.querySelector('.hf-theme-toggle');
        if (!btn) return;
        var light = theme === 'light';
        btn.setAttribute('aria-pressed', light ? 'true' : 'false');
        btn.setAttribute('aria-label', light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
        btn.querySelector('.hf-theme-label').textContent = light ? 'Modo oscuro' : 'Modo claro';
    }

    function set(t, save) {
        theme = t;
        html.setAttribute('data-theme', t);
        syncButton();
        if (save) { try { localStorage.setItem(KEY, t); } catch (e) { } }
        document.dispatchEvent(new CustomEvent('hf-themechange', { detail: t }));
    }

    document.addEventListener('DOMContentLoaded', function () {
        syncButton();
        var btn = document.querySelector('.hf-theme-toggle');
        if (btn) btn.addEventListener('click', function () {
            set(theme === 'light' ? 'dark' : 'light', true);
        });
    });

    /* Sincroniza otras pestañas abiertas */
    window.addEventListener('storage', function (e) {
        if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark')) set(e.newValue, false);
    });
})();