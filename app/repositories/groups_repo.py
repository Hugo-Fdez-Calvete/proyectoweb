"""Acceso a datos de grupos, miembros, chats, mensajes y carpetas compartidas."""
from sqlalchemy import func, or_

from app.models.db.db import db
from app.models.db.users_db import User
from app.models.db.groups_db import (
    Group, GroupMember, GroupInvite, GroupChat, ChatMessage, ChatRead,
    FolderShare, PublicFolder, NotifySettings, NotifyLog, PERMISSIONS,
)


# ---------------------------------------------------------------- usuarios
def get_user(user_id):
    return db.session.get(User, user_id)


def find_active_user(username):
    """Usuario registrado y aprobado (sin distinguir mayúsculas)."""
    return User.query.filter(
        func.lower(User.username) == (username or "").strip().lower(),
        User.status == "active",
    ).first()


def search_active_usernames(prefix, exclude_ids=(), limit=8):
    query = User.query.filter(
        func.lower(User.username).like((prefix or "").lower().replace("%", "").replace("_", r"\_") + "%", escape="\\"),
        User.status == "active",
    )
    if exclude_ids:
        query = query.filter(~User.id.in_(list(exclude_ids)))
    return [u.username for u in query.order_by(User.username).limit(limit)]


# ------------------------------------------------------------------ grupos
def get_group(group_id):
    return db.session.get(Group, group_id)


def groups_of_user(user_id):
    """Grupos en los que está el usuario (como creador o como miembro)."""
    return (Group.query
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == user_id)
            .order_by(Group.name)
            .all())


def groups_owned_by(user_id):
    return Group.query.filter_by(owner_id=user_id).all()


def committed_gb(user_id):
    """Espacio que el usuario ha reservado para sus grupos."""
    total = db.session.query(func.coalesce(func.sum(Group.storage_gb), 0)).filter(Group.owner_id == user_id).scalar()
    return float(total or 0)


def all_groups():
    return Group.query.order_by(Group.created_at.desc()).all()


def create_group(name, description, owner_id, storage_gb):
    group = Group(name=name, description=description, owner_id=owner_id, storage_gb=storage_gb)
    db.session.add(group)
    db.session.flush()
    # El creador también es miembro, con todos los permisos
    owner = GroupMember(group_id=group.id, user_id=owner_id, **{key: True for key, _l, _d in PERMISSIONS})
    db.session.add(owner)
    db.session.flush()
    general = GroupChat(group_id=group.id, name="General", created_by=owner_id)
    db.session.add(general)
    db.session.commit()
    return group


def update_group(group, name, description, storage_gb):
    group.name = name
    group.description = description
    group.storage_gb = storage_gb
    db.session.commit()
    return group


def delete_group(group):
    chat_ids = [c.id for c in GroupChat.query.filter_by(group_id=group.id)]
    if chat_ids:
        ChatMessage.query.filter(ChatMessage.chat_id.in_(chat_ids)).delete(synchronize_session=False)
        ChatRead.query.filter(ChatRead.chat_id.in_(chat_ids)).delete(synchronize_session=False)
        NotifyLog.query.filter(NotifyLog.key.in_([f"chat:{cid}" for cid in chat_ids])).delete(synchronize_session=False)
    NotifyLog.query.filter(NotifyLog.key == f"files:{group.id}").delete(synchronize_session=False)
    GroupChat.query.filter_by(group_id=group.id).delete(synchronize_session=False)
    GroupMember.query.filter_by(group_id=group.id).delete(synchronize_session=False)
    GroupInvite.query.filter_by(group_id=group.id).delete(synchronize_session=False)
    db.session.delete(group)
    db.session.commit()


# ---------------------------------------------------------------- miembros
def get_member(group_id, user_id):
    return GroupMember.query.filter_by(group_id=group_id, user_id=user_id).first()


def members_of(group_id):
    return (GroupMember.query
            .join(User, User.id == GroupMember.user_id)
            .filter(GroupMember.group_id == group_id)
            .order_by(User.username)
            .all())


def member_ids(group_id):
    return [m.user_id for m in GroupMember.query.filter_by(group_id=group_id)]


def count_members(group_id):
    return GroupMember.query.filter_by(group_id=group_id).count()


def add_member(group_id, user_id, permissions):
    member = GroupMember(group_id=group_id, user_id=user_id, **permissions)
    db.session.add(member)
    db.session.commit()
    return member


def set_permissions(member, permissions):
    for key, value in permissions.items():
        setattr(member, key, bool(value))
    db.session.commit()
    return member


def remove_member(member):
    chat_ids = [c.id for c in GroupChat.query.filter_by(group_id=member.group_id)]
    if chat_ids:
        ChatRead.query.filter(ChatRead.user_id == member.user_id,
                              ChatRead.chat_id.in_(chat_ids)).delete(synchronize_session=False)
    db.session.delete(member)
    db.session.commit()


# ------------------------------------------------------------ invitaciones
def get_invite(invite_id):
    return db.session.get(GroupInvite, invite_id)


def find_invite(group_id, user_id):
    return GroupInvite.query.filter_by(group_id=group_id, user_id=user_id).first()


def invites_for_user(user_id):
    return GroupInvite.query.filter_by(user_id=user_id).order_by(GroupInvite.created_at.desc()).all()


def count_invites_for_user(user_id):
    return GroupInvite.query.filter_by(user_id=user_id).count()


def invites_of_group(group_id):
    return GroupInvite.query.filter_by(group_id=group_id).order_by(GroupInvite.created_at).all()


def invited_ids(group_id):
    return [i.user_id for i in GroupInvite.query.filter_by(group_id=group_id)]


def count_invites_of_group(group_id):
    return GroupInvite.query.filter_by(group_id=group_id).count()


def create_invite(group_id, user_id, invited_by):
    invite = GroupInvite(group_id=group_id, user_id=user_id, invited_by=invited_by)
    db.session.add(invite)
    db.session.commit()
    return invite


def delete_invite(invite):
    db.session.delete(invite)
    db.session.commit()


def accept_invite(invite, permissions):
    """Convierte la invitación en miembro (en una sola transacción)."""
    member = GroupMember(group_id=invite.group_id, user_id=invite.user_id, **permissions)
    db.session.add(member)
    db.session.delete(invite)
    db.session.commit()
    return member


# ------------------------------------------------------------------- chats
def get_chat(chat_id):
    return db.session.get(GroupChat, chat_id)


def chats_of(group_id):
    return GroupChat.query.filter_by(group_id=group_id).order_by(GroupChat.id).all()


def count_chats(group_id):
    return GroupChat.query.filter_by(group_id=group_id).count()


def create_chat(group_id, name, user_id):
    chat = GroupChat(group_id=group_id, name=name, created_by=user_id)
    db.session.add(chat)
    db.session.commit()
    return chat


def delete_chat(chat):
    ChatMessage.query.filter_by(chat_id=chat.id).delete(synchronize_session=False)
    ChatRead.query.filter_by(chat_id=chat.id).delete(synchronize_session=False)
    NotifyLog.query.filter_by(key=f"chat:{chat.id}").delete(synchronize_session=False)
    db.session.delete(chat)
    db.session.commit()


# ---------------------------------------------------------------- mensajes
def add_message(chat_id, user_id, body):
    message = ChatMessage(chat_id=chat_id, user_id=user_id, body=body)
    db.session.add(message)
    db.session.commit()
    return message


def get_message(message_id):
    return db.session.get(ChatMessage, message_id)


def delete_message(message):
    db.session.delete(message)
    db.session.commit()


def messages(chat_id, after_id=None, before_id=None, limit=50):
    """Mensajes en orden cronológico.
    after_id  -> solo los posteriores (para ponerse al día)
    before_id -> los anteriores (para cargar historial)
    sin nada  -> los últimos «limit»."""
    query = ChatMessage.query.filter(ChatMessage.chat_id == chat_id)
    if after_id is not None:
        return query.filter(ChatMessage.id > after_id).order_by(ChatMessage.id).limit(limit).all()
    if before_id is not None:
        query = query.filter(ChatMessage.id < before_id)
    rows = query.order_by(ChatMessage.id.desc()).limit(limit).all()
    return list(reversed(rows))


def last_message_id(chat_id):
    return db.session.query(func.max(ChatMessage.id)).filter(ChatMessage.chat_id == chat_id).scalar() or 0


def get_read(chat_id, user_id):
    return db.session.get(ChatRead, (chat_id, user_id))


def mark_read(chat_id, user_id, last_id):
    row = get_read(chat_id, user_id)
    if row is None:
        row = ChatRead(chat_id=chat_id, user_id=user_id, last_read_id=0)
        db.session.add(row)
    if last_id > (row.last_read_id or 0):
        row.last_read_id = last_id
    db.session.commit()


def unread_counts(user_id, chat_ids):
    """{chat_id: mensajes sin leer} (sin contar los propios)."""
    if not chat_ids:
        return {}
    reads = {r.chat_id: r.last_read_id for r in
             ChatRead.query.filter(ChatRead.user_id == user_id, ChatRead.chat_id.in_(chat_ids))}
    result = {}
    for chat_id in chat_ids:
        result[chat_id] = (ChatMessage.query
                           .filter(ChatMessage.chat_id == chat_id,
                                   ChatMessage.id > reads.get(chat_id, 0),
                                   or_(ChatMessage.user_id.is_(None), ChatMessage.user_id != user_id))
                           .count())
    return result


def count_messages_in_group(group_id):
    return (ChatMessage.query.join(GroupChat, GroupChat.id == ChatMessage.chat_id)
            .filter(GroupChat.group_id == group_id).count())


# -------------------------------------------------------- carpetas compartidas
def get_share(share_id):
    return db.session.get(FolderShare, share_id)


def find_share(owner_id, path, target_user_id):
    return FolderShare.query.filter_by(owner_id=owner_id, path=path, target_user_id=target_user_id).first()


def shares_of_folder(owner_id, path):
    return FolderShare.query.filter_by(owner_id=owner_id, path=path).order_by(FolderShare.id).all()


def shares_by_owner(owner_id):
    return FolderShare.query.filter_by(owner_id=owner_id).order_by(FolderShare.path).all()


def shares_for_user(user_id):
    return FolderShare.query.filter_by(target_user_id=user_id).order_by(FolderShare.created_at.desc()).all()


def shared_paths(owner_id):
    """{ruta: número de personas} para marcar las carpetas compartidas."""
    rows = (db.session.query(FolderShare.path, func.count(FolderShare.id))
            .filter(FolderShare.owner_id == owner_id)
            .group_by(FolderShare.path).all())
    return {path: count for path, count in rows}


def all_shares():
    return FolderShare.query.order_by(FolderShare.created_at.desc()).all()


def create_share(owner_id, path, target_user_id, can_edit):
    share = FolderShare(owner_id=owner_id, path=path, target_user_id=target_user_id, can_edit=can_edit)
    db.session.add(share)
    db.session.commit()
    return share


def set_share_edit(share, can_edit):
    share.can_edit = bool(can_edit)
    db.session.commit()
    return share


def delete_share(share):
    db.session.delete(share)
    db.session.commit()


def move_shares(owner_id, old_path, new_path):
    """Si se renombra una carpeta compartida o pública, la compartición la sigue."""
    for item in list(FolderShare.query.filter_by(owner_id=owner_id)) + list(PublicFolder.query.filter_by(owner_id=owner_id)):
        if item.path == old_path or item.path.startswith(old_path + "/"):
            item.path = new_path + item.path[len(old_path):]
    db.session.commit()


def delete_shares_under(owner_id, path):
    """Al borrar una carpeta se quitan las comparticiones (y el enlace público)
    de ella y de sus subcarpetas."""
    for item in list(FolderShare.query.filter_by(owner_id=owner_id)) + list(PublicFolder.query.filter_by(owner_id=owner_id)):
        if item.path == path or item.path.startswith(path + "/"):
            db.session.delete(item)
    db.session.commit()


# ------------------------------------------------------- carpetas públicas
def get_public(public_id):
    return db.session.get(PublicFolder, public_id)


def get_public_by_token(token):
    return PublicFolder.query.filter_by(token=token).first()


def find_public(owner_id, path):
    return PublicFolder.query.filter_by(owner_id=owner_id, path=path).first()


def publics_by_owner(owner_id):
    return PublicFolder.query.filter_by(owner_id=owner_id).order_by(PublicFolder.path).all()


def public_paths(owner_id):
    return {p.path for p in PublicFolder.query.filter_by(owner_id=owner_id)}


def listed_publics():
    return (PublicFolder.query.join(User, User.id == PublicFolder.owner_id)
            .filter(PublicFolder.listed.is_(True), User.status == "active")
            .order_by(PublicFolder.created_at.desc()).all())


def all_publics():
    return PublicFolder.query.order_by(PublicFolder.created_at.desc()).all()


def create_public(owner_id, path, token, listed, description):
    public = PublicFolder(owner_id=owner_id, path=path, token=token, listed=listed, description=description)
    db.session.add(public)
    db.session.commit()
    return public


def update_public(public, **values):
    for key, value in values.items():
        setattr(public, key, value)
    db.session.commit()
    return public


def delete_public(public):
    db.session.delete(public)
    db.session.commit()


# ------------------------------------------------------------ avisos (correo)
def get_settings(user_id, create=True):
    settings = db.session.get(NotifySettings, user_id)
    if settings is None and create:
        settings = NotifySettings(user_id=user_id)
        db.session.add(settings)
        db.session.commit()
    return settings


def save_settings(settings, **values):
    for key, value in values.items():
        setattr(settings, key, value)
    db.session.commit()
    return settings


def get_notify_log(user_id, key):
    return db.session.get(NotifyLog, (user_id, key))


def touch_notify_log(user_id, key, when):
    row = get_notify_log(user_id, key)
    if row is None:
        row = NotifyLog(user_id=user_id, key=key, sent_at=when)
        db.session.add(row)
    else:
        row.sent_at = when
    db.session.commit()


# ------------------------------------------------------- limpieza de usuarios
def purge_user(user_id):
    """Quita todo lo del usuario salvo los grupos que ha creado (eso lo hace
    el servicio, que también borra sus archivos). Sus mensajes en grupos de
    otros se conservan como «usuario eliminado»."""
    ChatMessage.query.filter_by(user_id=user_id).update({"user_id": None}, synchronize_session=False)
    GroupInvite.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    GroupInvite.query.filter_by(invited_by=user_id).update({"invited_by": None}, synchronize_session=False)
    PublicFolder.query.filter_by(owner_id=user_id).delete(synchronize_session=False)
    ChatRead.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    GroupMember.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    FolderShare.query.filter((FolderShare.owner_id == user_id) |
                             (FolderShare.target_user_id == user_id)).delete(synchronize_session=False)
    NotifyLog.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    NotifySettings.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    db.session.commit()
