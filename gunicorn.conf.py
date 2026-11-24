# Configuración de gunicorn (el Dockerfile la carga con --config).
# Los demás ajustes (workers, puerto, logs…) siguen en el CMD del Dockerfile.
from gunicorn.glogging import Logger


class QuietLogger(Logger):
    """Log de accesos sin las consultas periódicas del Pixel Art: cada pestaña
    abierta pregunta por los cambios cada pocos segundos y llenaría el log
    (y escribiría en la tarjeta SD sin parar). Los errores sí se registran."""

    QUIET = ("/pixel-art/api/changes",)

    def access(self, resp, req, environ, request_time):
        path = environ.get("PATH_INFO", "")
        status = getattr(resp, "status_code", None) or 0
        if path.startswith(self.QUIET) and int(status) < 400:
            return
        super().access(resp, req, environ, request_time)


logger_class = QuietLogger
