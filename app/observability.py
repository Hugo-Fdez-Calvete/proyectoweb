"""Logs ordenados e identificador de petición.

- Cada petición recibe un identificador corto (X-Request-ID). Si Nginx o el
  navegador ya traen uno válido, se respeta. Se devuelve en la respuesta y
  aparece en todas las líneas de log de esa petición y en el log de accesos
  de Gunicorn, así se pueden seguir todos los pasos de una petición.
- Formato de cada línea:
      2026-11-25 16:20:01,123 INFO [a1b2c3d4e5f6a7b8] app.services.mail_service: mensaje
- Las peticiones lentas (más de SLOW_REQUEST_MS, 2 s por defecto) se avisan
  con un WARNING; las subidas grandes y el WebSocket del chat no cuentan.
- Nivel de log con la variable LOG_LEVEL (INFO por defecto).
"""
import logging
import os
import re
import time
import uuid

from flask import g, has_request_context, request
from flask.logging import default_handler

START_TIME = time.time()
SLOW_REQUEST_MS = int(os.environ.get("SLOW_REQUEST_MS", "2000") or 2000)
_VALID_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
# Subidas de archivos (tardan lo que tarde la conexión) y el WebSocket (dura lo que dure el chat)
_SKIP_SLOW_PREFIX = ("/ws/", "/pulso/api/music")
_SKIP_SLOW_SUFFIX = ("/upload", "/subir")

log = logging.getLogger("app.peticiones")


class RequestIdFilter(logging.Filter):
    """Añade request_id a cada línea (o «-» si no hay petición en curso)."""

    def filter(self, record):
        record.request_id = getattr(g, "request_id", "-") if has_request_context() else "-"
        return True


def _setup_logging():
    root = logging.getLogger()
    if any(getattr(h, "_hfc", False) for h in root.handlers):
        return                               # ya configurado (p. ej. en los tests)
    handler = logging.StreamHandler()
    handler._hfc = True
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s"))
    root.addHandler(handler)
    root.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())


def init_app(app):
    _setup_logging()
    # app.logger escribe a través del manejador común (sin duplicar líneas)
    app.logger.removeHandler(default_handler)
    app.logger.propagate = True

    @app.before_request
    def _start_request():
        incoming = request.headers.get("X-Request-ID", "")
        g.request_id = incoming if _VALID_ID.match(incoming) else uuid.uuid4().hex[:16]
        g.request_start = time.perf_counter()

    @app.after_request
    def _finish_request(response):
        request_id = getattr(g, "request_id", None)
        if request_id:
            response.headers["X-Request-ID"] = request_id
        start = getattr(g, "request_start", None)
        path = request.path
        if start is not None and not path.startswith(_SKIP_SLOW_PREFIX) and not path.endswith(_SKIP_SLOW_SUFFIX):
            ms = (time.perf_counter() - start) * 1000
            if ms > SLOW_REQUEST_MS:
                log.warning("Petición lenta: %s %s -> %s en %.0f ms",
                            request.method, path, response.status_code, ms)
        return response
