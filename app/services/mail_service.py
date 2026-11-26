"""Envío de correos por SMTP (pensado para Gmail con contraseña de aplicación).

Variables de entorno (en Portainer, junto a SECRET_KEY):
    MAIL_USERNAME   cuenta que envía, p. ej. hugofernandezcalvete@gmail.com
    MAIL_PASSWORD   contraseña de aplicación de Google (16 letras; los espacios dan igual)
    MAIL_FROM_NAME  nombre del remitente (opcional)
    MAIL_SERVER     smtp.gmail.com por defecto
    MAIL_PORT       587 por defecto (STARTTLS)

Si faltan MAIL_USERNAME o MAIL_PASSWORD la web funciona igual, pero no
envía correos (se avisa en el perfil).

Los correos salen desde un hilo aparte para no hacer esperar a quien
manda un mensaje o sube un archivo.
"""
import logging
import os
import queue
import smtplib
import ssl
import threading
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

log = logging.getLogger(__name__)

_queue = queue.Queue(maxsize=500)
_worker = None
_worker_lock = threading.Lock()


def _config():
    return {
        "server": os.environ.get("MAIL_SERVER", "smtp.gmail.com").strip(),
        "port": int(os.environ.get("MAIL_PORT", "587") or 587),
        "username": os.environ.get("MAIL_USERNAME", "").strip(),
        # quita cualquier espacio (también los «no separables» que se cuelan al copiarla)
        "password": "".join(os.environ.get("MAIL_PASSWORD", "").split()),
        "from_name": os.environ.get("MAIL_FROM_NAME", "HFC · Home Cloud").strip(),
    }


def configured():
    config = _config()
    return bool(config["username"] and config["password"])


def _deliver(message):
    config = _config()
    context = ssl.create_default_context()
    if config["port"] == 465:
        with smtplib.SMTP_SSL(config["server"], config["port"], timeout=30, context=context) as smtp:
            smtp.login(config["username"], config["password"])
            smtp.send_message(message)
    else:
        with smtplib.SMTP(config["server"], config["port"], timeout=30) as smtp:
            smtp.starttls(context=context)
            smtp.login(config["username"], config["password"])
            smtp.send_message(message)


def _run():
    while True:
        message = _queue.get()
        try:
            _deliver(message)
        except Exception:                       # un correo que falla no debe tirar la web
            log.exception("No se ha podido enviar el correo a %s", message.get("To"))
        finally:
            _queue.task_done()


def _ensure_worker():
    # El hilo se crea en el proceso que atiende las peticiones (no antes:
    # con --preload los hilos del proceso padre no pasan a los hijos)
    global _worker
    with _worker_lock:
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_run, name="mail-sender", daemon=True)
            _worker.start()


def send(to, subject, text, html=None):
    """Pone un correo en la cola. Devuelve False si no se puede enviar."""
    if not configured() or not to:
        return False
    config = _config()
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((config["from_name"], config["username"]))
    message["To"] = to
    message["Message-ID"] = make_msgid(domain=config["username"].split("@")[-1] or None)
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")
    try:
        _queue.put_nowait(message)
    except queue.Full:
        log.warning("Cola de correo llena: se descarta el aviso a %s", to)
        return False
    _ensure_worker()
    return True
