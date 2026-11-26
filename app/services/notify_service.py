"""Avisos por correo: verificación del correo, preferencias y eventos.

Solo se envía a correos verificados (el usuario pulsa el enlace que le
llega). Cada usuario elige en su perfil qué avisos quiere.

Para no llenar la bandeja de entrada:
    - mensajes de chat: como mucho un correo por chat cada 20 minutos, y
      solo si no tienes ese chat abierto y tienes mensajes sin leer;
    - archivos nuevos en un grupo: como mucho uno por grupo cada 30 minutos.
"""
from datetime import datetime, timedelta, timezone

from flask import current_app, render_template, url_for
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.models.db.groups_db import PERMISSIONS
from app.repositories import groups_repo
from app.services import mail_service

VERIFY_SALT = "verificar-correo"
VERIFY_MAX_AGE = 2 * 24 * 3600          # el enlace vale 2 días
CHAT_COOLDOWN = timedelta(minutes=20)
FILES_COOLDOWN = timedelta(minutes=30)

PREFERENCES = [
    ("notify_messages", "Mensajes nuevos en los chats de tus grupos",
     "Como mucho un correo por chat cada 20 minutos, y solo si no lo tienes abierto."),
    ("notify_groups", "Invitaciones a grupos, cambios de permisos o si te sacan de uno", None),
    ("notify_shares", "Alguien comparte una carpeta contigo", None),
    ("notify_files", "Archivos nuevos en tus grupos", "Como mucho un correo por grupo cada 30 minutos."),
    ("notify_account", "Tu cuenta: aprobación y cambios de espacio", None),
]
PREFERENCE_KEYS = [key for key, _label, _help in PREFERENCES]


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)      # SQLite guarda fechas sin zona


# ---------------------------------------------------------------- ajustes
def get_settings(user):
    return groups_repo.get_settings(user.id)


def is_verified(user, settings=None):
    settings = settings or groups_repo.get_settings(user.id, create=False)
    return bool(settings and user.email and settings.verified_email
                and settings.verified_email.lower() == user.email.lower())


def forget_email(user):
    """Al desvincular el correo se olvida también la confirmación."""
    settings = groups_repo.get_settings(user.id, create=False)
    if settings is not None:
        groups_repo.save_settings(settings, verified_email=None)


def save_preferences(user, form):
    values = {key: form.get(key) in ("1", "on", "true") for key in PREFERENCE_KEYS}
    return groups_repo.save_settings(get_settings(user), **values)


def _serializer():
    return URLSafeTimedSerializer(current_app.secret_key, salt=VERIFY_SALT)


def send_verification(user):
    """Devuelve (enviado, mensaje para el usuario)."""
    if not user.email:
        return False, "Primero vincula un correo en «Correo y avisos»."
    if not mail_service.configured():
        return False, "El envío de correos aún no está configurado en el servidor."
    token = _serializer().dumps({"u": user.id, "e": user.email.lower()})
    link = url_for("profile_bp.verify_email", token=token, _external=True)
    _send(user.email, "Confirma tu correo",
          f"Hola, {user.username}:",
          ["Pulsa el botón para confirmar que este correo es tuyo y empezar a recibir avisos de la web.",
           "Si no has sido tú, ignora este mensaje."],
          link, "Confirmar correo")
    return True, f"Te hemos enviado un enlace a {user.email}. Caduca en 2 días."


def confirm_verification(token):
    """No hace falta tener la sesión iniciada: el enlace va firmado con la
    clave secreta de la web. Devuelve (ok, mensaje)."""
    try:
        data = _serializer().loads(token, max_age=VERIFY_MAX_AGE)
    except SignatureExpired:
        return False, "El enlace ha caducado. Pide otro desde tu perfil."
    except BadSignature:
        return False, "El enlace no es válido."
    user = groups_repo.get_user(data.get("u"))
    if user is None:
        return False, "La cuenta ya no existe."
    if not user.email or data.get("e") != user.email.lower():
        return False, "El correo de la cuenta ha cambiado desde que se pidió el enlace. Pide otro desde tu perfil."
    groups_repo.save_settings(get_settings(user), verified_email=user.email)
    return True, "Correo confirmado. Ya recibirás los avisos que elijas."


# ------------------------------------------------------------------ envío
def _send(to, subject, greeting, lines, link=None, link_text=None):
    text = "\n\n".join([greeting, *lines] + ([f"{link_text}: {link}"] if link else []))
    text += "\n\n—\nPuedes elegir qué avisos recibes en tu perfil de la web."
    try:
        html = render_template("emails/aviso.html", subject=subject, greeting=greeting,
                               lines=lines, link=link, link_text=link_text,
                               profile_url=url_for("profile_bp.profile", _external=True))
    except Exception:
        html = None
    return mail_service.send(to, subject, text, html)


def _notify(user, preference, subject, lines, link=None, link_text=None, throttle_key=None, cooldown=None):
    """Envía el aviso si el usuario lo quiere, tiene el correo verificado y
    (si hay throttle_key) no se le ha avisado de lo mismo hace poco."""
    if user is None or user.status != "active" or not mail_service.configured():
        return False
    settings = groups_repo.get_settings(user.id, create=False)
    if settings is None:
        return False                    # nunca ha verificado su correo
    if not is_verified(user, settings) or not getattr(settings, preference, False):
        return False
    if throttle_key:
        row = groups_repo.get_notify_log(user.id, throttle_key)
        now = _utcnow()
        if row and row.sent_at and now - row.sent_at.replace(tzinfo=None) < cooldown:
            return False
        groups_repo.touch_notify_log(user.id, throttle_key, now)
    return _send(user.email, subject, f"Hola, {user.username}:", lines, link, link_text)


# ----------------------------------------------------------------- eventos
def group_invited(user, group, by_user):
    _notify(user, "notify_groups", f"Te han invitado al grupo «{group.name}»",
            [f"{by_user.username} te ha invitado al grupo «{group.name}».",
             "Entra en la web para aceptar o rechazar la invitación."],
            url_for("groups_bp.groups", _external=True), "Ver la invitación")


def invite_accepted(inviter, user, group):
    _notify(inviter, "notify_groups", f"{user.username} se ha unido a «{group.name}»",
            [f"{user.username} ha aceptado tu invitación al grupo «{group.name}»."],
            url_for("groups_bp.members", group_id=group.id, _external=True), "Ver los miembros")


def member_removed(user, group):
    _notify(user, "notify_groups", f"Ya no estás en el grupo «{group.name}»",
            [f"Te han sacado del grupo «{group.name}». Ya no puedes ver sus archivos ni sus chats."])


def permissions_changed(user, group, permissions):
    allowed = [label.lower() for key, label, _d in PERMISSIONS if permissions.get(key)]
    summary = ", ".join(allowed) if allowed else "solo ver archivos y leer los chats"
    _notify(user, "notify_groups", f"Tus permisos en «{group.name}» han cambiado",
            [f"Ahora en el grupo «{group.name}» puedes: {summary}."],
            url_for("groups_bp.group_home", group_id=group.id, _external=True), "Abrir el grupo")


def share_created(target, owner, path, can_edit):
    folder = path.split("/")[-1]
    mode = "verla, subir archivos, crear carpetas y borrar" if can_edit else "verla y descargar sus archivos"
    _notify(target, "notify_shares", f"{owner.username} ha compartido «{folder}» contigo",
            [f"{owner.username} ha compartido contigo la carpeta «{folder}».", f"Puedes {mode}."],
            url_for("shares_bp.shared_with_me", _external=True), "Ver carpetas compartidas")


def new_message(chat, group, message, sender, watching_ids):
    link = url_for("groups_bp.chat_page", group_id=group.id, chat_id=chat.id, _external=True)
    preview = message.body if len(message.body) <= 140 else message.body[:137] + "…"
    for user_id in groups_repo.member_ids(group.id):
        if user_id == sender.id or user_id in watching_ids:
            continue
        read = groups_repo.get_read(chat.id, user_id)
        if read and read.last_read_id >= message.id:
            continue
        _notify(groups_repo.get_user(user_id), "notify_messages",
                f"Mensajes nuevos en «{chat.name}» ({group.name})",
                [f"{sender.username} ha escrito en «{chat.name}» del grupo «{group.name}»:", f"«{preview}»"],
                link, "Abrir el chat",
                throttle_key=f"chat:{chat.id}", cooldown=CHAT_COOLDOWN)


def file_uploaded(group, uploader, filename):
    link = url_for("groups_bp.files", group_id=group.id, _external=True)
    for user_id in groups_repo.member_ids(group.id):
        if user_id == uploader.id:
            continue
        _notify(groups_repo.get_user(user_id), "notify_files",
                f"Archivos nuevos en «{group.name}»",
                [f"{uploader.username} ha subido «{filename}» al grupo «{group.name}»."],
                link, "Ver los archivos",
                throttle_key=f"files:{group.id}", cooldown=FILES_COOLDOWN)


def account_approved(user):
    _notify(user, "notify_account", "Tu cuenta ya está activa",
            ["Un administrador ha aprobado tu cuenta. Ya puedes usar tu nube y los grupos."],
            url_for("home_bp.login", _external=True), "Iniciar sesión")


def storage_changed(user, storage_gb):
    _notify(user, "notify_account", "Tu espacio de almacenamiento ha cambiado",
            [f"Ahora tienes {float(storage_gb):g} GB en total (incluido lo que reservas para tus grupos)."],
            url_for("dashboard_bp.dashboard", _external=True), "Abrir mi nube")


def safe(event, *args, **kwargs):
    """Lanza un aviso sin que un fallo (correo, plantilla…) estropee la acción
    que lo ha provocado: el mensaje se envía o el archivo se sube igual."""
    try:
        event(*args, **kwargs)
    except Exception:
        current_app.logger.exception("Fallo al preparar el aviso %s", getattr(event, "__name__", event))
