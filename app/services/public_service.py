"""Carpetas públicas: cualquiera (también sin cuenta) puede verlas y descargar
sus archivos, pero no cambiarlas.

    - Cada carpeta pública tiene un enlace secreto (/publico/<token>).
    - Si está «en el listado», aparece además en la página /publico.
    - El propietario puede quitarla del listado, cambiar el enlace (el
      anterior deja de funcionar) o dejar de publicarla.
    - Si borra o renombra la carpeta, el enlace la sigue o desaparece.
"""
import secrets

from app.repositories import groups_repo, cloud_repo
from app.services import cloud_service

MAX_DESCRIPTION = 200
MAX_COUNT = 5000          # al calcular tamaños del listado no se recorren más archivos


class PublicError(Exception):
    """Error que se puede enseñar al usuario."""


def _new_token():
    while True:
        token = secrets.token_urlsafe(16)
        if groups_repo.get_public_by_token(token) is None:
            return token


def _clean_description(text):
    text = " ".join((text or "").split())
    if len(text) > MAX_DESCRIPTION:
        raise PublicError(f"La descripción no puede superar los {MAX_DESCRIPTION} caracteres.")
    return text or None


# ------------------------------------------------------------ propietario
def of_folder(owner, path):
    return groups_repo.find_public(owner.id, path)


def publish(owner, path, listed, description):
    path = cloud_service.normalize_path(path)
    if not path:
        raise PublicError("Elige una carpeta concreta (no la raíz de tu nube).")
    if not cloud_repo.folder_exists(owner.username, path):
        raise PublicError("La carpeta no existe.")
    if groups_repo.find_public(owner.id, path):
        raise PublicError("Esta carpeta ya es pública.")
    return groups_repo.create_public(owner.id, path, _new_token(), bool(listed), _clean_description(description))


def _own(public_id, user):
    public = groups_repo.get_public(public_id)
    if public is None:
        raise PublicError("Esa carpeta ya no es pública.")
    is_admin = bool(user.is_admin) and user.status == "active"
    if public.owner_id != user.id and not is_admin:
        raise PublicError("Solo el propietario puede cambiar esta carpeta pública.")
    return public


def update(public_id, user, listed, description):
    public = _own(public_id, user)
    return groups_repo.update_public(public, listed=bool(listed), description=_clean_description(description))


def new_link(public_id, user):
    public = _own(public_id, user)
    return groups_repo.update_public(public, token=_new_token())


def unpublish(public_id, user):
    public = _own(public_id, user)
    groups_repo.delete_public(public)
    return public


def of_owner(owner):
    return groups_repo.publics_by_owner(owner.id)


def paths_of(owner):
    return groups_repo.public_paths(owner.id)


# ------------------------------------------------------------ visitantes
def _stats(owner, path):
    """(número de archivos, bytes) de la carpeta, sin pasar de MAX_COUNT archivos."""
    try:
        folder = cloud_repo.resolve_path(owner.username, path)
    except cloud_repo.InvalidPathError:
        return 0, 0
    files = size = 0
    for item in folder.rglob("*"):
        if item.is_file():
            files += 1
            size += item.stat().st_size
            if files >= MAX_COUNT:
                break
    return files, size


def listing_page():
    """Tarjetas de /publico: solo carpetas en el listado, de usuarios activos y que existen."""
    cards = []
    for public in groups_repo.listed_publics():
        owner = public.owner
        if owner is None or not cloud_repo.folder_exists(owner.username, public.path):
            continue
        files, size = _stats(owner, public.path)
        cards.append({"public": public, "owner": owner, "name": public.path.split("/")[-1],
                      "files": files, "size": size})
    return cards


class PublicAccess:
    def __init__(self, public):
        self.public = public
        self.owner = public.owner
        self.name = public.path.split("/")[-1]

    def full_path(self, rel_path):
        rel_path = cloud_service.normalize_path(rel_path)
        if rel_path is None:
            raise PublicError("Ruta no válida.")
        return f"{self.public.path}/{rel_path}" if rel_path else self.public.path


def get_access(token):
    public = groups_repo.get_public_by_token(token or "")
    if public is None:
        raise PublicError("Este enlace no existe o ya no está activo.")
    owner = public.owner
    if owner is None or owner.status != "active" or not cloud_repo.folder_exists(owner.username, public.path):
        raise PublicError("Esta carpeta ya no está disponible.")
    return PublicAccess(public)


def listing(access, rel_path):
    rel_path = cloud_service.normalize_path(rel_path)
    if rel_path is None:
        return None
    data = cloud_service.get_listing(access.owner.username, access.full_path(rel_path))
    if data is None:
        return None
    parts = rel_path.split("/") if rel_path else []
    data["breadcrumbs"] = [{"name": p, "path": "/".join(parts[:i + 1])} for i, p in enumerate(parts)]
    data["current_path"] = rel_path
    return data


def download(access, name, rel_path):
    return cloud_service.download_file(access.owner.username, name or "", access.full_path(rel_path))
