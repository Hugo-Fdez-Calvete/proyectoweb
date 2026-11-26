"""Grupos de usuarios: creación, miembros, permisos, espacio y archivos.

Reglas del espacio:
    - El espacio de un grupo sale del de su creador: si tiene 500 GB y crea
      un grupo de 200 GB, para su nube personal le quedan 300 GB.
    - Al crear o ampliar un grupo solo se puede reservar lo que el creador
      tiene libre en ese momento.
    - Los archivos del grupo se guardan en app/cloud_groups/<id del grupo>.

Permisos:
    - Cualquier miembro puede ver los archivos y leer los chats.
    - El resto (subir, borrar, crear carpetas, escribir, crear chats y añadir
      miembros) lo decide el creador para cada miembro.
    - El creador y los administradores de la web pueden hacerlo todo.
"""
from pathlib import Path

from app.models.db.groups_db import PERMISSIONS, PERMISSION_KEYS
from app.repositories import groups_repo, cloud_repo
from app.services import cloud_service


# app/cloud_groups/  (volumen propio en docker-compose)
GROUPS_PATH = Path(__file__).resolve().parent.parent / "cloud_groups"

MAX_GROUP_NAME = 60
MAX_GROUP_DESCRIPTION = 300
MAX_CHAT_NAME = 60
MAX_CHATS_PER_GROUP = 30
MAX_MEMBERS_PER_GROUP = 100
GB = 1024 ** 3
EPS = 1e-6


class GroupError(Exception):
    """Error que se puede enseñar al usuario."""


# ------------------------------------------------------------------ espacio
def group_root(group_id):
    """Carpeta de archivos de un grupo (se le pasa a cloud_service como «usuario»)."""
    return GROUPS_PATH / str(int(group_id))


def committed_gb(user):
    """GB que el usuario ha reservado para sus grupos."""
    return groups_repo.committed_gb(user.id)


def personal_quota_gb(user):
    """Espacio para la nube personal: el total menos lo reservado para grupos."""
    return max(0.0, float(user.storage_gb or 0) - committed_gb(user))


def available_for_groups_gb(user):
    """Lo que el usuario puede reservar ahora para un grupo nuevo o ampliar uno."""
    used = cloud_service.get_used_storage_gb(user.username)
    return max(0.0, float(user.storage_gb or 0) - committed_gb(user) - used)


def group_used_gb(group):
    return cloud_service.get_used_storage_gb(group_root(group.id))


def parse_gb(value):
    """«2», «2.5» o «2,5» -> 2.5. Lanza GroupError si no es válido."""
    try:
        gb = round(float(str(value).replace(",", ".").strip()), 2)
    except (TypeError, ValueError):
        raise GroupError("El espacio debe ser un número de GB (por ejemplo 2 o 0,5).")
    if gb < 0.1:
        raise GroupError("El grupo necesita al menos 0,1 GB.")
    return gb


# ------------------------------------------------------------------ acceso
class Access:
    """Lo que un usuario puede hacer dentro de un grupo."""

    def __init__(self, group, user, member):
        self.group = group
        self.user = user
        self.member = member
        self.is_owner = group.owner_id == user.id
        self.is_admin = bool(user.is_admin) and user.status == "active"
        # Gestionar = cambiar ajustes, permisos, quitar miembros y borrar el grupo
        self.manage = self.is_owner or self.is_admin

    def can(self, key):
        if self.manage:
            return True
        return bool(self.member and getattr(self.member, key, False))

    def permissions(self):
        """{permiso: True/False} para las plantillas."""
        return {key: self.can(key) for key in PERMISSION_KEYS}


def get_access(group_id, user):
    """Comprueba que el usuario puede entrar en el grupo.
    Los administradores de la web pueden entrar en todos."""
    group = groups_repo.get_group(group_id)
    if group is None:
        raise GroupError("El grupo no existe.")
    member = groups_repo.get_member(group.id, user.id)
    access = Access(group, user, member)
    if member is None and not access.is_admin:
        raise GroupError("No perteneces a ese grupo.")
    return access


def _require(access, key, message):
    if not access.can(key):
        raise GroupError(message)


# ------------------------------------------------------------------ grupos
def list_for_user(user):
    """Tarjetas de «Mis grupos» con miembros, espacio y mensajes sin leer."""
    cards = []
    for group in groups_repo.groups_of_user(user.id):
        chat_ids = [c.id for c in groups_repo.chats_of(group.id)]
        unread = sum(groups_repo.unread_counts(user.id, chat_ids).values())
        cards.append({
            "group": group,
            "is_owner": group.owner_id == user.id,
            "members": groups_repo.count_members(group.id),
            "chats": len(chat_ids),
            "used_gb": group_used_gb(group),
            "unread": unread,
        })
    return cards


def _clean_name(name, limit, what):
    name = " ".join((name or "").split())
    if not name:
        raise GroupError(f"Escribe un nombre para el {what}.")
    if len(name) > limit:
        raise GroupError(f"El nombre del {what} no puede superar los {limit} caracteres.")
    return name


def _clean_description(description):
    description = (description or "").strip()
    if len(description) > MAX_GROUP_DESCRIPTION:
        raise GroupError(f"La descripción no puede superar los {MAX_GROUP_DESCRIPTION} caracteres.")
    return description or None


def create_group(user, name, description, storage_gb):
    name = _clean_name(name, MAX_GROUP_NAME, "grupo")
    description = _clean_description(description)
    gb = parse_gb(storage_gb)
    free = available_for_groups_gb(user)
    if gb > free + EPS:
        raise GroupError(
            f"Solo tienes {free:.2f} GB libres para reservar. "
            "Libera espacio o pide más a un administrador."
        )
    group = groups_repo.create_group(name, description, user.id, gb)
    cloud_repo.create_user_folder(group_root(group.id))
    return group


def update_group(access, name, description, storage_gb):
    if not access.manage:
        raise GroupError("Solo el creador del grupo puede cambiar sus ajustes.")
    group = access.group
    name = _clean_name(name, MAX_GROUP_NAME, "grupo")
    description = _clean_description(description)
    gb = parse_gb(storage_gb)

    used = group_used_gb(group)
    if gb + EPS < used:
        raise GroupError(f"El grupo ya usa {used:.2f} GB: no puedes dejarle menos espacio.")

    extra = gb - float(group.storage_gb or 0)
    if extra > EPS:
        owner = groups_repo.get_user(group.owner_id)
        free = available_for_groups_gb(owner)
        if extra > free + EPS:
            raise GroupError(
                f"El creador solo tiene {free:.2f} GB libres: "
                f"el grupo puede llegar como mucho a {float(group.storage_gb) + free:.2f} GB."
            )
    return groups_repo.update_group(group, name, description, gb)


def delete_group(access):
    if not access.manage:
        raise GroupError("Solo el creador del grupo puede borrarlo.")
    group_id = access.group.id
    groups_repo.delete_group(access.group)
    cloud_repo.delete_root(group_root(group_id))


# ---------------------------------------------------------------- miembros
def members(access):
    return groups_repo.members_of(access.group.id)


def invite_member(access, username):
    """Invita a un usuario. Entra en el grupo cuando acepta la invitación."""
    _require(access, "can_invite", "No tienes permiso para invitar a nadie a este grupo.")
    username = (username or "").strip().lstrip("@")
    if not username:
        raise GroupError("Escribe el nombre de usuario que quieres invitar.")
    user = groups_repo.find_active_user(username)
    if user is None:
        raise GroupError(f"No hay ningún usuario activo llamado «{username}».")
    if groups_repo.get_member(access.group.id, user.id):
        raise GroupError(f"{user.username} ya está en el grupo.")
    if groups_repo.find_invite(access.group.id, user.id):
        raise GroupError(f"{user.username} ya tiene una invitación pendiente.")
    total = groups_repo.count_members(access.group.id) + groups_repo.count_invites_of_group(access.group.id)
    if total >= MAX_MEMBERS_PER_GROUP:
        raise GroupError(f"Un grupo puede tener como mucho {MAX_MEMBERS_PER_GROUP} miembros (contando invitaciones).")
    groups_repo.create_invite(access.group.id, user.id, access.user.id)
    return user


def pending_invites(access):
    return groups_repo.invites_of_group(access.group.id)


def cancel_invite(access, invite_id):
    """Retira una invitación: quien la envió, el creador o un administrador."""
    invite = groups_repo.get_invite(invite_id)
    if invite is None or invite.group_id != access.group.id:
        raise GroupError("Esa invitación ya no existe.")
    if not (access.manage or invite.invited_by == access.user.id):
        raise GroupError("Solo quien envió la invitación o el creador del grupo pueden retirarla.")
    user = invite.user
    groups_repo.delete_invite(invite)
    return user


def invites_for(user):
    return groups_repo.invites_for_user(user.id)


def _own_invite(invite_id, user):
    invite = groups_repo.get_invite(invite_id)
    if invite is None or invite.user_id != user.id:
        raise GroupError("Esa invitación ya no existe.")
    return invite


def accept_invite(invite_id, user):
    """Devuelve el grupo al que se ha unido."""
    invite = _own_invite(invite_id, user)
    group = invite.group
    if groups_repo.get_member(group.id, user.id):          # por si acaso
        groups_repo.delete_invite(invite)
        return group
    defaults = {key: default for key, _label, default in PERMISSIONS}
    groups_repo.accept_invite(invite, defaults)
    return group


def decline_invite(invite_id, user):
    invite = _own_invite(invite_id, user)
    group = invite.group
    groups_repo.delete_invite(invite)
    return group


def parse_permissions(form):
    """Casillas marcadas del formulario -> {permiso: True/False}."""
    return {key: form.get(key) in ("1", "on", "true", "True") for key in PERMISSION_KEYS}


def set_permissions(access, user_id, permissions):
    if not access.manage:
        raise GroupError("Solo el creador del grupo puede cambiar los permisos.")
    if user_id == access.group.owner_id:
        raise GroupError("El creador del grupo siempre tiene todos los permisos.")
    member = groups_repo.get_member(access.group.id, user_id)
    if member is None:
        raise GroupError("Ese usuario no está en el grupo.")
    groups_repo.set_permissions(member, permissions)
    return member


def remove_member(access, user_id):
    """El creador (o un admin) quita a alguien. Para irse uno mismo: leave()."""
    if not access.manage:
        raise GroupError("Solo el creador del grupo puede quitar miembros.")
    if user_id == access.group.owner_id:
        raise GroupError("El creador no puede salir de su grupo: si quieres, bórralo.")
    member = groups_repo.get_member(access.group.id, user_id)
    if member is None:
        raise GroupError("Ese usuario no está en el grupo.")
    user = member.user
    groups_repo.remove_member(member)
    return user


def leave(access):
    if access.is_owner:
        raise GroupError("El creador no puede salir de su grupo: si quieres, bórralo.")
    if access.member is None:
        raise GroupError("No estás en este grupo.")
    groups_repo.remove_member(access.member)


# ---------------------------------------------------------------- archivos
def listing(access, rel_path):
    root = group_root(access.group.id)
    cloud_repo.create_user_folder(root)
    return cloud_service.get_listing(root, rel_path)


def upload(access, file, rel_path):
    _require(access, "can_upload", "No tienes permiso para subir archivos a este grupo.")
    root = group_root(access.group.id)
    ok, error = cloud_service.save_file(root, file, float(access.group.storage_gb), rel_path)
    if not ok:
        if error == "No tienes suficiente espacio de almacenamiento.":
            error = "El grupo no tiene espacio suficiente. Su creador puede ampliarlo en Ajustes."
        raise GroupError(error)


def create_folder(access, folder_name, rel_path):
    _require(access, "can_create_folders", "No tienes permiso para crear carpetas en este grupo.")
    ok, error = cloud_service.create_folder(group_root(access.group.id), folder_name, rel_path)
    if not ok:
        raise GroupError(error)


def delete_entry(access, name, rel_path):
    _require(access, "can_delete", "No tienes permiso para borrar en este grupo.")
    ok, error = cloud_service.delete_file(group_root(access.group.id), name, rel_path)
    if not ok:
        raise GroupError(error)


def download(access, name, rel_path):
    return cloud_service.download_file(group_root(access.group.id), name, rel_path)


# ------------------------------------------------------------- administración
def admin_overview():
    rows = []
    for group in groups_repo.all_groups():
        rows.append({
            "group": group,
            "members": groups_repo.count_members(group.id),
            "chats": groups_repo.count_chats(group.id),
            "messages": groups_repo.count_messages_in_group(group.id),
            "used_gb": group_used_gb(group),
        })
    return rows


def purge_user(user_id):
    """Antes de eliminar un usuario: borra sus grupos (con sus archivos), le
    saca de los demás, quita sus comparticiones y sus ajustes de avisos."""
    for group in groups_repo.groups_owned_by(user_id):
        group_id = group.id
        groups_repo.delete_group(group)
        cloud_repo.delete_root(group_root(group_id))
    groups_repo.purge_user(user_id)
