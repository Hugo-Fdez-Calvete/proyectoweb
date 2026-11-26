/* ============================================================
   Chat de los grupos
   - En directo por WebSocket (/ws/chat).
   - Si el WebSocket no conecta (Nginx sin configurar, red que lo
     bloquea…), pasa a preguntar al servidor cada pocos segundos
     y sigue funcionando igual, solo que con algo de retraso.
   ============================================================ */
(function () {
    'use strict';

    var cfgEl = document.getElementById('chat-config');
    if (!cfgEl) return;
    var cfg = JSON.parse(cfgEl.textContent);
    var initial = JSON.parse(document.getElementById('chat-initial').textContent || '[]');

    var box = document.getElementById('chat-messages');
    var empty = document.getElementById('chat-empty');
    var moreBtn = document.getElementById('chat-more');
    var statusEl = document.getElementById('chat-status');
    var dot = document.getElementById('chat-dot');
    var form = document.getElementById('chat-form');
    var input = document.getElementById('chat-input');

    var PAGE = 50;
    var seen = {};                // id -> elemento
    var firstId = null, lastId = 0;
    var ws = null, wsOpen = false, everOpened = false, failures = 0;
    var pollTimer = null, pingTimer = null, retryTimer = null;
    var online = [];
    var nonce = 0;

    // ------------------------------------------------------ fechas
    var timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
    var dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

    function dayLabel(d) {
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var that = new Date(d); that.setHours(0, 0, 0, 0);
        var diff = Math.round((today - that) / 86400000);
        if (diff === 0) return 'Hoy';
        if (diff === 1) return 'Ayer';
        var s = dayFmt.format(d);
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    // ------------------------------------------------------ pintar
    // Enlaces http(s) clicables; el resto, texto plano (nunca HTML)
    var URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
    function fillBody(el, text) {
        var pos = 0, m;
        URL_RE.lastIndex = 0;
        while ((m = URL_RE.exec(text))) {
            if (m.index > pos) el.appendChild(document.createTextNode(text.slice(pos, m.index)));
            var url = m[0].replace(/[).,;:!?]+$/, '');
            var a = document.createElement('a');
            a.href = url; a.textContent = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
            el.appendChild(a);
            pos = m.index + url.length;
            URL_RE.lastIndex = pos;
        }
        if (pos < text.length) el.appendChild(document.createTextNode(text.slice(pos)));
    }

    function nearBottom() {
        return box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    }

    function scrollToBottom() { box.scrollTop = box.scrollHeight; }

    function buildMessage(msg) {
        var date = new Date(msg.at);
        var el = document.createElement('article');
        el.className = 'nb-msg' + (msg.user_id === cfg.me ? ' is-mine' : '');
        el.dataset.id = msg.id;
        el.dataset.user = msg.user_id == null ? '' : msg.user_id;
        el.dataset.ts = date.getTime();
        el.dataset.day = date.toDateString();

        var head = document.createElement('header');
        var who = document.createElement('strong');
        who.textContent = msg.user;
        var when = document.createElement('time');
        when.dateTime = msg.at;
        when.textContent = timeFmt.format(date);
        when.title = date.toLocaleString('es-ES');
        head.appendChild(who); head.appendChild(when);

        var body = document.createElement('p');
        fillBody(body, msg.body);

        el.appendChild(head); el.appendChild(body);

        if (msg.user_id === cfg.me || cfg.canModerate) {
            var del = document.createElement('button');
            del.type = 'button';
            del.className = 'nb-msg-del';
            del.title = 'Borrar mensaje';
            del.setAttribute('aria-label', 'Borrar mensaje');
            del.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
            del.addEventListener('click', function () { deleteMessage(msg.id); });
            el.appendChild(del);
        }
        return el;
    }

    // Agrupa mensajes seguidos de la misma persona (menos de 5 min) y pone
    // separadores de día. Se recalcula entero: son pocos mensajes.
    function relayout() {
        var items = box.querySelectorAll('.nb-msg');
        box.querySelectorAll('.nb-day').forEach(function (d) { d.remove(); });
        var prev = null;
        items.forEach(function (el) {
            if (!prev || prev.dataset.day !== el.dataset.day) {
                var sep = document.createElement('div');
                sep.className = 'nb-day';
                sep.textContent = dayLabel(new Date(+el.dataset.ts));
                box.insertBefore(sep, el);
            }
            var joined = prev && prev.dataset.user === el.dataset.user && prev.dataset.day === el.dataset.day &&
                (+el.dataset.ts - +prev.dataset.ts) < 5 * 60 * 1000;
            el.classList.toggle('is-joined', !!joined);
            prev = el;
        });
        empty.hidden = items.length > 0;
    }

    function addMessages(list, where) {
        var stick = nearBottom();
        var oldHeight = box.scrollHeight;
        var fresh = list.filter(function (m) { return !seen[m.id]; });
        if (!fresh.length) return 0;
        var anchor = where === 'top' ? box.querySelector('.nb-msg, .nb-day') : null;
        fresh.forEach(function (m) {
            var el = buildMessage(m);
            seen[m.id] = el;
            if (where === 'top' && anchor) box.insertBefore(el, anchor);
            else box.appendChild(el);
            if (firstId === null || m.id < firstId) firstId = m.id;
            if (m.id > lastId) lastId = m.id;
        });
        if (where !== 'top') {
            // por si llegan desordenados (reconexión): reordenar por id
            var all = Array.prototype.slice.call(box.querySelectorAll('.nb-msg'));
            all.sort(function (a, b) { return a.dataset.id - b.dataset.id; }).forEach(function (el) { box.appendChild(el); });
        }
        relayout();
        if (where === 'top') box.scrollTop = box.scrollHeight - oldHeight;
        else if (stick || where === 'initial') scrollToBottom();
        return fresh.length;
    }

    function removeMessage(id) {
        var el = seen[id];
        if (!el) return;
        el.remove();
        delete seen[id];
        relayout();
    }

    // ------------------------------------------------------ estado
    function setStatus(mode) {
        dot.className = 'nb-dot is-' + mode;
        if (mode === 'live') {
            var others = online.filter(function (n) { return n !== cfg.meName; });
            statusEl.textContent = others.length
                ? 'En directo · también aquí: ' + others.join(', ')
                : 'En directo';
        } else if (mode === 'poll') {
            statusEl.textContent = 'Conectado (se actualiza cada pocos segundos)';
        } else {
            statusEl.textContent = 'Conectando…';
        }
    }

    function toast(text) {
        var t = document.createElement('div');
        t.className = 'nb-toast';
        t.setAttribute('role', 'alert');
        t.textContent = text;
        document.body.appendChild(t);
        setTimeout(function () { t.classList.add('is-out'); }, 3500);
        setTimeout(function () { t.remove(); }, 4000);
    }

    // ------------------------------------------------------ servidor
    function api(url, body) {
        return fetch(url, {
            method: body ? 'POST' : 'GET',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
            credentials: 'same-origin'
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (data) {
                if (!r.ok) throw new Error(data.error || 'Error ' + r.status);
                return data;
            });
        });
    }

    function catchUp() {
        return api(cfg.historyUrl + '?after=' + lastId).then(function (data) {
            var n = addMessages(data.messages || []);
            if (data.online && !wsOpen) online = data.online;
            if (n) markRead();
            // si había más de una página pendiente, seguir pidiendo
            if ((data.messages || []).length >= PAGE) return catchUp();
        });
    }

    var readTimer = null, lastReadSent = 0;
    function markRead() {
        if (document.hidden || !lastId || lastId <= lastReadSent) return;
        clearTimeout(readTimer);
        readTimer = setTimeout(function () {
            lastReadSent = lastId;
            if (wsOpen) ws.send(JSON.stringify({ type: 'read', chat: cfg.chat, last: lastId }));
            else api(cfg.readUrl, { last: lastId }).catch(function () {});
        }, 800);
    }
    document.addEventListener('visibilitychange', markRead);

    function deleteMessage(id) {
        if (!confirm('¿Borrar este mensaje?')) return;
        api(cfg.deleteUrl.replace(/\/0\/borrar$/, '/' + id + '/borrar'), {})
            .then(function () { removeMessage(id); })
            .catch(function (e) { toast(e.message); });
    }

    // ------------------------------------------------------ WebSocket
    function startPolling() {
        if (pollTimer) return;
        setStatus('poll');
        pollTimer = setInterval(function () { catchUp().catch(function () {}); }, 4000);
    }

    function stopPolling() {
        clearInterval(pollTimer);
        pollTimer = null;
    }

    function connect() {
        if (!('WebSocket' in window)) { startPolling(); return; }
        clearTimeout(retryTimer);
        var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
        try {
            ws = new WebSocket(proto + location.host + cfg.wsPath);
        } catch (e) {
            startPolling();
            return;
        }

        ws.onopen = function () {
            wsOpen = true; everOpened = true; failures = 0;
            stopPolling();
            ws.send(JSON.stringify({ type: 'join', chat: cfg.chat }));
            setStatus('live');
            catchUp().catch(function () {});       // lo que llegó mientras no había conexión
            clearInterval(pingTimer);
            pingTimer = setInterval(function () {
                if (wsOpen) ws.send('{"type":"ping"}');
            }, 25000);
        };

        ws.onmessage = function (ev) {
            var data;
            try { data = JSON.parse(ev.data); } catch (e) { return; }
            if (data.type === 'message' && data.message && data.message.chat === cfg.chat) {
                if (addMessages([data.message])) markRead();
            } else if (data.type === 'deleted' && data.chat === cfg.chat) {
                removeMessage(data.id);
            } else if (data.type === 'presence' && data.chat === cfg.chat) {
                online = data.users || [];
                setStatus('live');
            } else if (data.type === 'sent') {
                if (data.message) addMessages([data.message]);
            } else if (data.type === 'error') {
                toast(data.error || 'No se ha podido completar la acción.');
                if (data.nonce && input && !input.value) input.value = pendingText[data.nonce] || '';
            } else if (data.type === 'chat_deleted' || data.type === 'removed') {
                toast(data.type === 'removed' ? 'Ya no estás en este grupo.' : 'Este chat se ha borrado.');
                setTimeout(function () { location.href = data.type === 'removed' ? '/HomeCloud/grupos/' : location.pathname.replace(/\/chat\/\d+.*$/, ''); }, 1500);
            }
        };

        ws.onclose = function () {
            wsOpen = false;
            clearInterval(pingTimer);
            failures++;
            // Si nunca ha llegado a conectar, el servidor o Nginx no lo
            // admiten: se sigue por consultas y se reintenta de vez en cuando.
            if (!everOpened || failures >= 3) startPolling();
            else setStatus('connecting');
            var wait = Math.min(30000, 1000 * Math.pow(2, failures - 1));
            retryTimer = setTimeout(connect, everOpened ? wait : 30000);
        };

        ws.onerror = function () { /* onclose se encarga */ };
    }

    // ------------------------------------------------------ enviar
    var pendingText = {};

    function send(text) {
        if (wsOpen) {
            nonce++;
            pendingText[nonce] = text;
            ws.send(JSON.stringify({ type: 'send', chat: cfg.chat, body: text, nonce: nonce }));
            return Promise.resolve();
        }
        return api(cfg.sendUrl, { body: text }).then(function (data) {
            if (data.message) addMessages([data.message]);
        });
    }

    if (form && input) {
        function autosize() {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 180) + 'px';
        }
        input.addEventListener('input', autosize);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
            }
        });
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var text = input.value.trim();
            if (!text) return;
            if (text.length > 2000) { toast('Un mensaje puede tener como mucho 2000 caracteres.'); return; }
            input.value = '';
            autosize();
            send(text).catch(function (err) {
                input.value = text;
                autosize();
                toast(err.message);
            });
            scrollToBottom();
        });
    }

    // ------------------------------------------------------ historial
    if (moreBtn) {
        moreBtn.addEventListener('click', function () {
            if (firstId === null) return;
            moreBtn.disabled = true;
            api(cfg.historyUrl + '?before=' + firstId).then(function (data) {
                var list = data.messages || [];
                addMessages(list, 'top');
                moreBtn.hidden = list.length < PAGE;
            }).catch(function (e) { toast(e.message); })
              .then(function () { moreBtn.disabled = false; });
        });
    }

    // ------------------------------------------------------ inicio
    addMessages(initial, 'initial');
    if (moreBtn) moreBtn.hidden = initial.length < PAGE;
    setStatus('connecting');
    connect();
})();
