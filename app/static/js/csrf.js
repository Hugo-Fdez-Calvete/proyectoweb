/* ============================================================
   Token CSRF en todas las peticiones de JavaScript
   Flask (CSRFProtect) rechaza cualquier POST/PUT/PATCH/DELETE sin token.
   Los formularios HTML lo llevan en un campo oculto; aquí se añade como
   cabecera X-CSRFToken a fetch() y XMLHttpRequest cuando van a esta web.
   ============================================================ */
(function () {
    var meta = document.querySelector('meta[name="csrf-token"]');
    var token = meta && meta.getAttribute('content');
    if (!token) return;

    var SAFE = /^(GET|HEAD|OPTIONS|TRACE)$/i;
    function sameOrigin(url) {
        try { return new URL(url, location.href).origin === location.origin; }
        catch (e) { return false; }
    }

    // fetch()
    if (window.fetch) {
        var origFetch = window.fetch;
        window.fetch = function (input, init) {
            var url = typeof input === 'string' ? input : (input && input.url) || String(input);
            var method = (init && init.method) || (input && input.method) || 'GET';
            if (!SAFE.test(method) && sameOrigin(url)) {
                init = init ? Object.assign({}, init) : {};
                var h = new Headers(init.headers || (input && input.headers) || {});
                if (!h.has('X-CSRFToken')) h.set('X-CSRFToken', token);
                init.headers = h;
            }
            return origFetch.call(this, input, init);
        };
    }

    // XMLHttpRequest (subidas con barra de progreso)
    var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.__csrf = !SAFE.test(method) && sameOrigin(url);
        return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
        if (this.__csrf) { try { this.setRequestHeader('X-CSRFToken', token); } catch (e) { } }
        return send.apply(this, arguments);
    };

    // red de seguridad: un formulario POST sin token (p. ej. uno nuevo) lo recibe al enviarse
    document.addEventListener('submit', function (e) {
        var f = e.target;
        if (!f || !f.method || SAFE.test(f.method) || !sameOrigin(f.action || location.href)) return;
        if (!f.querySelector('input[name="csrf_token"]')) {
            var i = document.createElement('input');
            i.type = 'hidden'; i.name = 'csrf_token'; i.value = token;
            f.appendChild(i);
        }
    }, true);
})();
