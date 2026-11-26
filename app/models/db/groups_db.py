"""Grupos de usuarios, chats internos, carpetas compartidas y avisos por correo.

Tablas nuevas (main.py las crea si no existen; no toca las que ya hay):
    groups              -> grupo (nombre, creador y espacio reservado)
    group_members       -> quién está en cada grupo y qué puede hacer
    group_chats         -> chats de cada grupo
    chat_messages       -> mensajes
    chat_reads          -> último mensaje leído por cada usuario en cada chat
    folder_shares       -> carpetas de la nube personal compartidas con otros usuarios
    notify_settings     -> correo verificado y qué avisos quiere recibir cada usuario
    notify_log          -> cuándo se envió el último aviso de cada tipo (evita spam)
    group_invites       -> invitaciones a grupos pendientes de aceptar
    public_folders      -> carpetas abiertas a todo el mundo (enlace y listado público)
"""
from datetime import datetime, timezone

from app.models.db.db import db


def _now():
    return datetime.now(timezone.utc)


# Permisos que el creador puede dar o quitar a cada miembro.
# Ver los archivos y leer los chats lo puede hacer siempre cualquier miembro.
#   (columna, texto para la página, valor por defecto al entrar en el grupo)
PERMISSIONS = [
    ("can_upload", "Subir archivos", True),
    ("can_create_folders", "Crear carpetas", True),
    ("can_delete", "Borrar archivos y carpetas", False),
    ("can_chat", "Escribir en los chats", True),
    ("can_create_chats", "Crear chats", False),
    ("can_invite", "Añadir miembros", False),
]
PERMISSION_KEYS = [key for key, _label, _default in PERMISSIONS]


class Group(db.Model):
    __tablename__ = "groups"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(60), nullable=False)
    description = db.Column(db.String(300), nullable=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    # Espacio reservado para el grupo (sale del espacio del creador)
    storage_gb = db.Column(db.Float, nullable=False, default=1)
    created_at = db.Column(db.DateTime, nullable=False, default=_now)

    owner = db.relationship("User", foreign_keys=[owner_id], lazy="joined")


class GroupMember(db.Model):
    __tablename__ = "group_members"
    __table_args__ = (db.UniqueConstraint("group_id", "user_id", name="uq_group_member"),)

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    group_id = db.Column(db.Integer, db.ForeignKey("groups.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    can_upload = db.Column(db.Boolean, nullable=False, default=True)
    can_create_folders = db.Column(db.Boolean, nullable=False, default=True)
    can_delete = db.Column(db.Boolean, nullable=False, default=False)
    can_chat = db.Column(db.Boolean, nullable=False, default=True)
    can_create_chats = db.Column(db.Boolean, nullable=False, default=False)
    can_invite = db.Column(db.Boolean, nullable=False, default=False)

    joined_at = db.Column(db.DateTime, nullable=False, default=_now)

    user = db.relationship("User", lazy="joined")


class GroupInvite(db.Model):
    """Invitación a un grupo: la persona entra cuando la acepta."""
    __tablename__ = "group_invites"
    __table_args__ = (db.UniqueConstraint("group_id", "user_id", name="uq_group_invite"),)

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    group_id = db.Column(db.Integer, db.ForeignKey("groups.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    invited_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=_now)

    group = db.relationship("Group", lazy="joined")
    user = db.relationship("User", foreign_keys=[user_id], lazy="joined")
    inviter = db.relationship("User", foreign_keys=[invited_by], lazy="joined")


class GroupChat(db.Model):
    __tablename__ = "group_chats"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    group_id = db.Column(db.Integer, db.ForeignKey("groups.id"), nullable=False, index=True)
    name = db.Column(db.String(60), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=_now)


class ChatMessage(db.Model):
    __tablename__ = "chat_messages"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    chat_id = db.Column(db.Integer, db.ForeignKey("group_chats.id"), nullable=False, index=True)
    # None si el usuario se ha eliminado (el mensaje se conserva)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=_now)

    user = db.relationship("User", lazy="joined")


class ChatRead(db.Model):
    __tablename__ = "chat_reads"

    chat_id = db.Column(db.Integer, db.ForeignKey("group_chats.id"), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), primary_key=True)
    last_read_id = db.Column(db.Integer, nullable=False, default=0)


class FolderShare(db.Model):
    __tablename__ = "folder_shares"
    __table_args__ = (db.UniqueConstraint("owner_id", "path", "target_user_id", name="uq_folder_share"),)

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    # Carpeta compartida, relativa a la nube del propietario ("Fotos/2026")
    path = db.Column(db.String(1000), nullable=False)
    target_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    # False: solo ver y descargar · True: también subir, crear carpetas y borrar
    can_edit = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=_now)

    owner = db.relationship("User", foreign_keys=[owner_id], lazy="joined")
    target = db.relationship("User", foreign_keys=[target_user_id], lazy="joined")


class PublicFolder(db.Model):
    """Carpeta de la nube personal que cualquiera puede ver y descargar (sin
    cuenta), con un enlace secreto. Si «listed» es True aparece además en la
    página pública /publico."""
    __tablename__ = "public_folders"
    __table_args__ = (db.UniqueConstraint("owner_id", "path", name="uq_public_folder"),)

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    path = db.Column(db.String(1000), nullable=False)
    token = db.Column(db.String(40), nullable=False, unique=True, index=True)
    listed = db.Column(db.Boolean, nullable=False, default=True)
    description = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=_now)

    owner = db.relationship("User", lazy="joined")


class NotifySettings(db.Model):
    __tablename__ = "notify_settings"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), primary_key=True)
    # Correo confirmado con el enlace de verificación. Si el usuario cambia su
    # correo en el perfil deja de coincidir y no se envía nada hasta confirmarlo.
    verified_email = db.Column(db.String(120), nullable=True)

    notify_messages = db.Column(db.Boolean, nullable=False, default=True)   # mensajes en chats
    notify_groups = db.Column(db.Boolean, nullable=False, default=True)     # te añaden, quitan o cambian permisos
    notify_shares = db.Column(db.Boolean, nullable=False, default=True)     # te comparten una carpeta
    notify_files = db.Column(db.Boolean, nullable=False, default=False)     # archivos nuevos en tus grupos
    notify_account = db.Column(db.Boolean, nullable=False, default=True)    # cuenta aprobada, espacio cambiado


class NotifyLog(db.Model):
    __tablename__ = "notify_log"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), primary_key=True)
    key = db.Column(db.String(60), primary_key=True)        # «chat:12», «files:3»…
    sent_at = db.Column(db.DateTime, nullable=False, default=_now)


ALL_TABLES = [Group, GroupMember, GroupInvite, GroupChat, ChatMessage, ChatRead,
              FolderShare, PublicFolder, NotifySettings, NotifyLog]
