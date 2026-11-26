"""Carpetas de la nube personal compartidas con otros usuarios registrados.

    - Se comparte una carpeta concreta (no la nube entera) con una persona.
    - Permiso «ver»: navegar y descargar. Permiso «editar»: además subir,
      crear carpetas y borrar dentro de esa carpeta.
    - Lo que suba otra persona ocupa espacio del propietario.
    - Si el propietario borra o renombra la carpeta, la compartición la sigue
      o desaparece con ella.
"""
from app.repositories import groups_repo, cloud_repo
from app.services import cloud_service, groups_service


class ShareError(Exception):
    """Error que se puede enseñar al usuario."""


def _clean_folder(path):
    path = cloud_service.normalize_path(path)
    if not path:
        raise ShareError("Elige una carpeta concreta para compartir (no la raíz de tu nube).")
    return path


# ------------------------------------------------------------ propietario
def shares_of_folder(owner, path):
    path = _clean_folder(path)
    if not cloud_repo.folder_exists(owner.username, path):
        raise ShareError("La carpeta no existe.")
    return path, groups_repo.shares_of_folder(owner.id, path)


def share_folder(owner, path, username, can_edit):
    path = _clean_folder(path)
    if not cloud_repo.folder_exists(owner.username, path):
        raise ShareError("La carpeta no existe.")
    username = (username or "").strip().lstrip("@")
    if not username:
        raise ShareError("Escribe el nombre de usuario con quien quieres compartirla.")
    target = groups_repo.find_active_user(username)
    if target is None:
        raise ShareError(f"No hay ningún usuario activo llamado «{username}».")
    if target.id == owner.id:
        raise ShareError("No hace falta compartir una carpeta contigo mismo.")
    if groups_repo.find_share(owner.id, path, target.id):
        raise ShareError(f"Ya compartes esta carpeta con {target.username}.")
    share = groups_repo.create_share(owner.id, path, target.id, bool(can_edit))
    return share


def _own_share(share_id, user):
    share = groups_repo.get_share(share_id)
    if share is None:
        raise ShareError("Esa carpeta ya no está compartida.")
    is_admin = bool(user.is_admin) and user.status == "active"
    if share.owner_id != user.id and not is_admin:
        raise ShareError("Solo el propietario puede cambiar esta compartición.")
    return share


def set_edit(share_id, user, can_edit):
    share = _own_share(share_id, user)
    groups_repo.set_share_edit(share, can_edit)
    return share


def unshare(share_id, user):
    share = _own_share(share_id, user)
    groups_repo.delete_share(share)
    return share


def shared_paths(owner):
    return groups_repo.shared_paths(owner.id)


def shared_by_me(owner):
    return groups_repo.shares_by_owner(owner.id)


# ------------------------------------------------------------- invitado
def shared_with_me(user):
    """Comparticiones recibidas cuyo propietario sigue activo y la carpeta existe."""
    result = []
    for share in groups_repo.shares_for_user(user.id):
        owner = share.owner
        result.append({
            "share": share,
            "owner": owner,
            "name": share.path.split("/")[-1],
            "exists": bool(owner) and cloud_repo.folder_exists(owner.username, share.path),
        })
    return result


class SharedAccess:
    def __init__(self, share, user):
        self.share = share
        self.user = user
        self.owner = share.owner
        self.is_admin = bool(user.is_admin) and user.status == "active"
        self.can_edit = share.can_edit or self.is_admin or share.owner_id == user.id

    def full_path(self, rel_path):
        """Ruta dentro de la nube del propietario. Lanza ShareError si no es válida."""
        rel_path = cloud_service.normalize_path(rel_path)
        if rel_path is None:
            raise ShareError("Ruta no válida.")
        return f"{self.share.path}/{rel_path}" if rel_path else self.share.path


def get_access(share_id, user):
    share = groups_repo.get_share(share_id)
    if share is None:
        raise ShareError("Esa carpeta ya no está compartida contigo.")
    access = SharedAccess(share, user)
    if share.target_user_id != user.id and share.owner_id != user.id and not access.is_admin:
        raise ShareError("Esa carpeta no está compartida contigo.")
    if access.owner is None or access.owner.status != "active":
        raise ShareError("El propietario de esta carpeta ya no está activo.")
    if not cloud_repo.folder_exists(access.owner.username, share.path):
        raise ShareError("El propietario ha borrado o movido esta carpeta.")
    return access


def listing(access, rel_path):
    rel_path = cloud_service.normalize_path(rel_path)
    if rel_path is None:
        return None
    full = access.full_path(rel_path)
    data = cloud_service.get_listing(access.owner.username, full)
    if data is None:
        return None
    # Las migas de pan empiezan en la carpeta compartida, no en la raíz del propietario
    parts = rel_path.split("/") if rel_path else []
    data["breadcrumbs"] = [{"name": p, "path": "/".join(parts[:i + 1])} for i, p in enumerate(parts)]
    data["current_path"] = rel_path
    return data


def _require_edit(access):
    if not access.can_edit:
        raise ShareError("Solo puedes ver esta carpeta: el propietario no te ha dado permiso para cambiarla.")


def upload(access, file, rel_path):
    _require_edit(access)
    quota = groups_service.personal_quota_gb(access.owner)
    ok, error = cloud_service.save_file(access.owner.username, file, quota, access.full_path(rel_path))
    if not ok:
        if error == "No tienes suficiente espacio de almacenamiento.":
            error = "El propietario de la carpeta no tiene espacio suficiente."
        raise ShareError(error)


def create_folder(access, name, rel_path):
    _require_edit(access)
    ok, error = cloud_service.create_folder(access.owner.username, name, access.full_path(rel_path))
    if not ok:
        raise ShareError(error)


def delete_entry(access, name, rel_path):
    _require_edit(access)
    full = access.full_path(rel_path)
    ok, error = cloud_service.delete_file(access.owner.username, name, full)
    if not ok:
        raise ShareError(error)
    # Si dentro había otras carpetas compartidas, dejan de estarlo
    groups_repo.delete_shares_under(access.owner.id, f"{full}/{name}")


def download(access, name, rel_path):
    return cloud_service.download_file(access.owner.username, name, access.full_path(rel_path))


# ------------------------------------------------- cambios en la nube propia
def folder_deleted(owner, rel_path, name):
    """Llamar después de borrar algo en Mis archivos."""
    rel_path = cloud_service.normalize_path(rel_path) or ""
    full = f"{rel_path}/{name}" if rel_path else name
    groups_repo.delete_shares_under(owner.id, full)


def folder_renamed(owner, rel_path, old_name, new_name):
    rel_path = cloud_service.normalize_path(rel_path) or ""
    prefix = f"{rel_path}/" if rel_path else ""
    groups_repo.move_shares(owner.id, prefix + old_name, prefix + new_name)
