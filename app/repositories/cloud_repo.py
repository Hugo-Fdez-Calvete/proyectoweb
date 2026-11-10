import shutil
from pathlib import Path


# app/cloud/
CLOUD_PATH = Path(__file__).resolve().parent.parent / "cloud"


class InvalidPathError(ValueError):
    """
    Se lanza cuando una ruta intenta salirse de la carpeta del usuario.
    """


def create_cloud_folder():
    """
    Crea la carpeta principal cloud si no existe.
    """
    CLOUD_PATH.mkdir(parents=True, exist_ok=True)


def create_user_folder(username):
    """
    Crea la carpeta del usuario si no existe.
    """
    create_cloud_folder()

    user_folder = CLOUD_PATH / username
    user_folder.mkdir(parents=True, exist_ok=True)

    return user_folder


def user_folder_exists(username):
    """
    Comprueba si existe la carpeta del usuario.
    """
    user_folder = CLOUD_PATH / username

    return user_folder.exists() and user_folder.is_dir()


def get_user_folder(username):
    """
    Obtiene la ruta de la carpeta del usuario.
    Si no existe, la crea.
    """
    return create_user_folder(username)


def resolve_path(username, rel_path=""):
    """
    Convierte una ruta relativa (por ejemplo "documentos/2026") en la ruta
    real dentro de la carpeta del usuario.

    Lanza InvalidPathError si la ruta intenta salirse de la carpeta del
    usuario (por ejemplo con ".." o con una ruta absoluta).
    """
    base = get_user_folder(username).resolve()

    if not rel_path:
        return base

    target = (base / rel_path).resolve()

    if not target.is_relative_to(base):
        raise InvalidPathError("Ruta no válida.")

    return target


def folder_exists(username, rel_path=""):
    """
    Comprueba si existe una carpeta dentro del almacenamiento del usuario.
    La cadena vacía representa la carpeta raíz del usuario.
    """
    try:
        return resolve_path(username, rel_path).is_dir()
    except InvalidPathError:
        return False


def get_user_files(username, rel_path=""):
    """
    Obtiene el contenido (archivos y carpetas) de una carpeta del usuario.
    Las carpetas aparecen primero y después todo ordenado por nombre.
    """
    folder = resolve_path(username, rel_path)

    if not folder.is_dir():
        return []

    return sorted(
        folder.iterdir(),
        key=lambda item: (not item.is_dir(), item.name.lower())
    )


def get_used_storage(username):
    """
    Obtiene el espacio utilizado por el usuario en bytes
    (incluye todas las subcarpetas).
    """
    user_folder = get_user_folder(username)

    total_size = 0

    for file in user_folder.rglob("*"):
        if file.is_file():
            total_size += file.stat().st_size

    return total_size


def create_folder(username, folder_name, rel_path=""):
    """
    Crea una carpeta dentro de rel_path.

    Devuelve:
        Ruta de la carpeta creada.
    """
    parent = resolve_path(username, rel_path)

    folder = parent / folder_name
    folder.mkdir()

    return folder


def entry_exists(username, name, rel_path=""):
    """
    Comprueba si ya existe un archivo O una carpeta con ese nombre
    dentro de rel_path.
    """
    parent = resolve_path(username, rel_path)

    return (parent / name).exists()


def save_file(username, file, rel_path=""):
    """
    Guarda un archivo en la carpeta rel_path del usuario.

    Recibe:
        username -> nombre del usuario
        file     -> archivo recibido desde Flask
        rel_path -> carpeta de destino (vacía = raíz del usuario)

    Devuelve:
        Ruta del archivo guardado.
    """
    folder = resolve_path(username, rel_path)

    file_path = folder / file.filename

    file.save(file_path)

    return file_path


def file_exists(username, filename, rel_path=""):
    """
    Comprueba si existe un archivo dentro de la carpeta indicada.
    """
    folder = resolve_path(username, rel_path)

    file_path = folder / filename

    return file_path.exists() and file_path.is_file()


def get_file(username, filename, rel_path=""):
    """
    Obtiene la ruta de un archivo del usuario.

    Devuelve:
        Path si existe.
        None si no existe.
    """
    folder = resolve_path(username, rel_path)

    file_path = folder / filename

    if not file_path.exists() or not file_path.is_file():
        return None

    return file_path


def delete_file(username, filename, rel_path=""):
    """
    Elimina un archivo del usuario.

    Devuelve:
        True si se ha eliminado.
        False si el archivo no existe.
    """
    file_path = get_file(username, filename, rel_path)

    if file_path is None:
        return False

    file_path.unlink()

    return True


def delete_folder(username, folder_name, rel_path=""):
    """
    Elimina una carpeta del usuario junto con todo su contenido.

    Devuelve:
        True si se ha eliminado.
        False si la carpeta no existe.
    """
    folder = resolve_path(username, rel_path) / folder_name

    if not folder.is_dir():
        return False

    shutil.rmtree(folder)

    return True


def rename_entry(username, old_name, new_name, rel_path=""):
    """
    Cambia el nombre de un archivo o de una carpeta.

    Devuelve:
        True si se ha renombrado.
        False si el original no existe.
    """
    folder = resolve_path(username, rel_path)

    old_path = folder / old_name

    if not old_path.exists():
        return False

    old_path.rename(folder / new_name)

    return True