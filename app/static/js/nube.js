/* ============================================================
   La Nube · comportamiento común
   - «Subir archivo»: abre el selector y envía el formulario al elegir
   - ventanas (modales) que se abren con data-modal="id"
   - sugerencias de nombres de usuario en los campos data-suggest
   - formularios .nb-autosubmit: se envían al cambiar un desplegable
   ============================================================ */
(function () {
    'use strict';

    // ---------- Subir archivo ----------
    document.querySelectorAll('.nb-upload-form').forEach(function (form) {
        var input = form.querySelector('input[type="file"]');
        var button = form.querySelector('.nb-upload-btn');
        if (!input || !button) return;
        button.addEventListener('click', function () { input.click(); });
        input.addEventListener('change', function () {
            if (!input.files.length) return;
            button.classList.add('is-loading');
            button.disabled = true;
            form.submit();
        });
    });

    // ---------- Ventanas ----------
    var openModal = null;

    function closeModal() {
        if (!openModal) return;
        openModal.classList.remove('is-active');
        if (openModal._opener) openModal._opener.focus();
        openModal = null;
    }

    document.querySelectorAll('.nb-open-modal').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var modal = document.getElementById(btn.dataset.modal);
            if (!modal) return;
            modal._opener = btn;
            modal.classList.add('is-active');
            openModal = modal;
            var first = modal.querySelector('input:not([type="hidden"]), textarea, select');
            if (first) { if (first.type === 'text') first.value = first.defaultValue; first.focus(); }
        });
    });

    document.querySelectorAll('.modal').forEach(function (modal) {
        modal.querySelectorAll('.nb-close-modal, .modal-background').forEach(function (el) {
            el.addEventListener('click', closeModal);
        });
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeModal();
    });

    // ---------- Sugerencias de usuarios ----------
    document.querySelectorAll('input[data-suggest]').forEach(function (input) {
        var list = document.getElementById(input.getAttribute('list'));
        if (!list) return;
        var timer = null, last = '';
        input.addEventListener('input', function () {
            var q = input.value.trim();
            clearTimeout(timer);
            if (q.length < 2 || q === last) return;
            timer = setTimeout(function () {
                last = q;
                var url = input.dataset.suggest + (input.dataset.suggest.indexOf('?') < 0 ? '?' : '&') + 'q=' + encodeURIComponent(q);
                fetch(url, { headers: { 'Accept': 'application/json' } })
                    .then(function (r) { return r.ok ? r.json() : { users: [] }; })
                    .then(function (data) {
                        list.innerHTML = '';
                        (data.users || []).forEach(function (name) {
                            var opt = document.createElement('option');
                            opt.value = name;
                            list.appendChild(opt);
                        });
                    })
                    .catch(function () {});
            }, 200);
        });
    });

    // ---------- Copiar un texto (enlace público) ----------
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var field = document.querySelector(btn.dataset.copy);
            if (!field) return;
            var label = btn.querySelector('span:last-child');
            function done() {
                if (!label) return;
                var old = label.textContent;
                label.textContent = '¡Copiado!';
                setTimeout(function () { label.textContent = old; }, 1600);
            }
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(field.value).then(done, function () { field.select(); });
            } else {
                field.select();
                try { document.execCommand('copy'); done(); } catch (e) {}
            }
        });
    });

    // ---------- Formularios que se envían solos ----------
    document.querySelectorAll('form.nb-autosubmit select').forEach(function (select) {
        select.addEventListener('change', function () { select.form.submit(); });
    });
})();
