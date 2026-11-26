"""Música de Pulso guardada en la nube (Home Cloud) de cada usuario.

- Las canciones nuevas se suben a la carpeta «Musica» de su nube.
- En la lista aparecen todos los archivos de audio de su nube (también los
  que haya subido desde «Mis archivos»).
- Ocupan espacio de su cuota personal (su espacio menos lo que reserva para
  sus grupos), igual que cualquier otro archivo.
"""
import os
import re

from flask import send_file

from app.repositories import cloud_repo
from app.repositories.cloud_repo import InvalidPathError
from app.services import cloud_service

MUSIC_FOLDER = "Musica"

MIME = {
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".opus": "audio/ogg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".webm": "audio/webm",
}


def is_audio(name):
    return os.path.splitext(name or "")[1].lower() in MIME


def _pretty_title(filename):
    """'01_mi-cancion_final.mp3' -> 'Mi cancion final'"""
    name = os.path.splitext(filename)[0]
    name = re.sub(r"^\d+[\s._-]+", "", name)      # quita numeración inicial
    name = re.sub(r"[_\-]+", " ", name).strip()
    return name[:1].upper() + name[1:] if name else filename


def _personal_quota_gb(user):
    # Lo reservado para grupos no cuenta para la nube personal
    from app.services import groups_service
    return groups_service.personal_quota_gb(user)


def usage(user):
    used = cloud_service.get_used_storage(user.username)
    quota = _personal_quota_gb(user) * (1024 ** 3)
    return {"used": used, "quota": quota}


def list_tracks(user):
    base = cloud_repo.get_user_folder(user.username).resolve()
    tracks = []
    for f in base.rglob("*"):
        if not f.is_file() or not is_audio(f.name):
            continue
        rel = f.relative_to(base).as_posix()
        folder = f.parent.relative_to(base).as_posix()
        tracks.append({
            "title": _pretty_title(f.name),
            "path": rel,
            "folder": "" if folder == "." else folder,
            "size": f.stat().st_size,
        })
    # primero la carpeta Musica, luego el resto por carpeta y nombre
    tracks.sort(key=lambda t: (t["folder"] != MUSIC_FOLDER, t["folder"].lower(), t["path"].lower()))
    return tracks


def _resolve(user, rel_path):
    rel = cloud_service.normalize_path(rel_path)
    if not rel or not is_audio(rel):
        return None
    try:
        path = cloud_repo.resolve_path(user.username, rel)
    except InvalidPathError:
        return None
    return path if path.is_file() else None


def stream(user, rel_path):
    """Envía el audio con soporte de rangos (para poder saltar a cualquier punto)."""
    path = _resolve(user, rel_path)
    if path is None:
        return None
    return send_file(
        path,
        mimetype=MIME.get(path.suffix.lower(), "application/octet-stream"),
        conditional=True,
        max_age=0,
    )


def upload(user, files):
    """Guarda las canciones en <nube>/Musica respetando la cuota del usuario."""
    cloud_service.create_user_cloud(user.username)
    if not cloud_repo.folder_exists(user.username, MUSIC_FOLDER):
        cloud_service.create_folder(user.username, MUSIC_FOLDER)

    saved, errors = [], []
    for f in files:
        name = f.filename or "archivo"
        if not is_audio(name):
            errors.append(f"«{name}» no es un archivo de audio compatible.")
            continue
        ok, error = cloud_service.save_file(user.username, f, _personal_quota_gb(user), MUSIC_FOLDER)
        if ok:
            saved.append(name)
        else:
            errors.append(f"«{name}»: {error}")
    return saved, errors


def delete(user, rel_path):
    path = _resolve(user, rel_path)
    if path is None:
        return False
    path.unlink()
    return True
