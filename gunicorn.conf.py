# Configuración de gunicorn (el Dockerfile la carga con --config).
# Los demás ajustes (workers, puerto, logs…) siguen en el CMD del Dockerfile.
from gunicorn.glogging import Logger


class QuietLogger(Logger):
    """Log de accesos sin las consultas periódicas del Pixel Art: cada pestaña
    abierta pregunta por los cambios cada pocos segundos y llenaría el log
    (y escribiría en la tarjeta SD sin parar). Los errores sí se registran."""

    # También las consultas del chat cuando no hay WebSocket (cada 4 s por pestaña)
    # y la comprobación de salud de Docker (cada 30 s)
    QUIET = ("/pixel-art/api/changes", "/HomeCloud/grupos/api/chats/", "/salud")

    def access(self, resp, req, environ, request_time):
        path = environ.get("PATH_INFO", "")
        status = getattr(resp, "status_code", None) or 0
        if path.startswith(self.QUIET) and environ.get("REQUEST_METHOD") == "GET" and int(status) < 400:
            return
        super().access(resp, req, environ, request_time)


logger_class = QuietLogger

# Una línea por petición: IP real (la que pasa Nginx), petición, estado,
# tamaño, duración en ms e identificador de petición (el mismo que aparece
# en los logs de la app y en la cabecera X-Request-ID de la respuesta).
access_log_format = '%({x-forwarded-for}i)s "%(r)s" %(s)s %(b)s %(M)sms id=%({x-request-id}o)s "%(a)s"'
