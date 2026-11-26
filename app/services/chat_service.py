"""Chats de los grupos: crear, borrar, mensajes y «leído».

Lo usan tanto las rutas HTTP como el WebSocket (services/ws_chat.py), así
que todas las comprobaciones de permisos están aquí y no en las rutas.
"""
from app.repositories import groups_repo
from app.services import groups_service
from app.services.groups_service import GroupError, MAX_CHAT_NAME, MAX_CHATS_PER_GROUP


MAX_MESSAGE = 2000          # caracteres por mensaje
PAGE = 50                   # mensajes por página de historial


def chat_access(chat_id, user):
    """Devuelve (chat, acceso al grupo) o lanza GroupError."""
    chat = groups_repo.get_chat(chat_id)
    if chat is None:
        raise GroupError("El chat no existe.")
    access = groups_service.get_access(chat.group_id, user)
    return chat, access


def chats_with_unread(access):
    chats = groups_repo.chats_of(access.group.id)
    unread = groups_repo.unread_counts(access.user.id, [c.id for c in chats])
    return [{"chat": c, "unread": unread.get(c.id, 0)} for c in chats]


def create_chat(access, name):
    if not access.can("can_create_chats"):
        raise GroupError("No tienes permiso para crear chats en este grupo.")
    name = " ".join((name or "").split())
    if not name:
        raise GroupError("Escribe un nombre para el chat.")
    if len(name) > MAX_CHAT_NAME:
        raise GroupError(f"El nombre del chat no puede superar los {MAX_CHAT_NAME} caracteres.")
    if groups_repo.count_chats(access.group.id) >= MAX_CHATS_PER_GROUP:
        raise GroupError(f"Un grupo puede tener como mucho {MAX_CHATS_PER_GROUP} chats.")
    return groups_repo.create_chat(access.group.id, name, access.user.id)


def delete_chat(chat, access):
    """Puede borrarlo quien lo creó, el creador del grupo o un administrador."""
    if not (access.manage or chat.created_by == access.user.id):
        raise GroupError("Solo quien creó el chat o el creador del grupo pueden borrarlo.")
    if groups_repo.count_chats(access.group.id) <= 1:
        raise GroupError("El grupo necesita al menos un chat.")
    groups_repo.delete_chat(chat)


def message_dict(message):
    user = message.user
    return {
        "id": message.id,
        "chat": message.chat_id,
        "user_id": message.user_id,
        "user": user.username if user else "Usuario eliminado",
        "body": message.body,
        # ISO en UTC: el navegador lo pasa a la hora local
        "at": message.created_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def history(chat, access, after_id=None, before_id=None):
    rows = groups_repo.messages(chat.id, after_id=after_id, before_id=before_id, limit=PAGE)
    return [message_dict(m) for m in rows]


def post_message(chat, access, body):
    if not access.can("can_chat"):
        raise GroupError("No tienes permiso para escribir en este grupo.")
    body = (body or "").replace("\r\n", "\n").strip()
    if not body:
        raise GroupError("El mensaje está vacío.")
    if len(body) > MAX_MESSAGE:
        raise GroupError(f"Un mensaje puede tener como mucho {MAX_MESSAGE} caracteres.")
    message = groups_repo.add_message(chat.id, access.user.id, body)
    groups_repo.mark_read(chat.id, access.user.id, message.id)
    return message


def delete_message(message_id, user):
    """Cada uno puede borrar sus mensajes; el creador del grupo y los
    administradores, cualquiera. Devuelve el id del chat."""
    message = groups_repo.get_message(message_id)
    if message is None:
        raise GroupError("El mensaje no existe.")
    chat, access = chat_access(message.chat_id, user)
    if not (access.manage or message.user_id == user.id):
        raise GroupError("Solo puedes borrar tus propios mensajes.")
    groups_repo.delete_message(message)
    return chat.id


def mark_read(chat, access, last_id):
    try:
        last_id = int(last_id)
    except (TypeError, ValueError):
        return
    if access.member is not None:          # los admins que solo miran no cuentan
        groups_repo.mark_read(chat.id, access.user.id, min(last_id, groups_repo.last_message_id(chat.id)))
