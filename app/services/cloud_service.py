from flask import send_file
from werkzeug.utils import secure_filename

from app.repositories import cloud_repo


# Límites para las carpetas
MAX_FOLDER_NAME_LENGTH = 100
MAX_FOLDER_DEPTH = 10


def create_user_cloud(username):
    """
    Crea la carpeta de almacenamiento del usuario.
    """
    return cloud_repo.create_user_folder(username)


def user_cloud_exists(username):
    """
    Comprueba si existe la carpeta del usuario.
    """
    return cloud_repo.user_folder_exists(username)


def normalize_path(rel_path):
    """
    Limpia una ruta relativa recibida desde el navegador
    (por ejemplo "documentos//2026/").

    Devuelve:
        La ruta normalizada ("" = raíz del usuario).
        None si la ruta no es válida (".." o demasiado profunda).
    """
    if not rel_path:
        return ""

    parts = [
        part
        for part in rel_path.replace("\\", "/").split("/")
        if part
    ]

    if len(parts) > MAX_FOLDER_DEPTH:
        return None

    if any(part in (".", "..") for part in parts):
        return None

    return "/".join(parts)


def get_listing(username, rel_path=""):
    """
    Prepara todo lo necesario para mostrar una carpeta.

    Devuelve:
        Diccionario con:
            entries      -> archivos y carpetas de la carpeta actual
            current_path -> ruta normalizada de la carpeta actual
            breadcrumbs  -> lista de {"name", "path"} desde la raíz
            parent_path  -> ruta de la carpeta superior (None en la raíz)
        None si la carpeta no existe o la ruta no es válida.
    """
    current_path = normalize_path(rel_path)

    if current_path is None:
        return None

    if not cloud_repo.folder_exists(username, current_path):
        return None

    parts = current_path.split("/") if current_path else []

    breadcrumbs = []
    for index, part in enumerate(parts):
        breadcrumbs.append({
            "name": part,
            "path": "/".join(parts[:index + 1])
        })

    parent_path = "/".join(parts[:-1]) if parts else None

    return {
        "entries": cloud_repo.get_user_files(username, current_path),
        "current_path": current_path,
        "breadcrumbs": breadcrumbs,
        "parent_path": parent_path
    }


def get_user_files(username, rel_path=""):
    """
    Obtiene los archivos y carpetas almacenados por el usuario
    en la carpeta indicada.
    """
    return cloud_repo.get_user_files(username, normalize_path(rel_path) or "")


def get_used_storage(username):
    """
    Obtiene el espacio utilizado por el usuario en bytes.
    """
    return cloud_repo.get_used_storage(username)


def bytes_to_gb(size_bytes):
    """
    Convierte bytes a GB.
    """
    return size_bytes / (1024 ** 3)


def get_used_storage_gb(username):
    """
    Obtiene el espacio utilizado por el usuario en GB.
    """
    used_bytes = get_used_storage(username)

    return bytes_to_gb(used_bytes)


def has_enough_storage(username, file_size, storage_gb):
    """
    Comprueba si el usuario dispone de espacio suficiente.

    file_size:
        Tamaño del archivo en bytes.

    storage_gb:
        Cuota máxima del usuario en GB.
    """
    used_bytes = get_used_storage(username)

    total_bytes = storage_gb * (1024 ** 3)

    return used_bytes + file_size <= total_bytes


def create_folder(username, folder_name, rel_path=""):
    """
    Crea una carpeta nueva dentro de la carpeta indicada.

    Devuelve:
        True, None si se ha creado correctamente.
        False, mensaje de error si no se puede crear.
    """
    rel_path = normalize_path(rel_path)

    if rel_path is None or not cloud_repo.folder_exists(username, rel_path):
        return False, "La carpeta de destino no existe."

    if not folder_name or not folder_name.strip():
        return False, "Debes introducir un nombre para la carpeta."

    # Mismo criterio de limpieza que se usa con los archivos
    folder_name = secure_filename(folder_name.strip())

    if not folder_name:
        return False, "El nombre de la carpeta no es válido."

    if len(folder_name) > MAX_FOLDER_NAME_LENGTH:
        return False, (
            f"El nombre de la carpeta no puede superar los "
            f"{MAX_FOLDER_NAME_LENGTH} caracteres."
        )

    # Profundidad máxima (la nueva carpeta cuenta como un nivel más)
    depth = len(rel_path.split("/")) if rel_path else 0

    if depth + 1 > MAX_FOLDER_DEPTH:
        return False, "Has alcanzado el máximo de niveles de carpetas."

    # Evitar nombres repetidos (ya sea un archivo o una carpeta)
    if cloud_repo.entry_exists(username, folder_name, rel_path):
        return False, "Ya existe un archivo o carpeta con ese nombre."

    cloud_repo.create_folder(username, folder_name, rel_path)

    return True, None


def save_file(username, file, storage_gb, rel_path=""):
    """
    Guarda un archivo en el almacenamiento del usuario.

    Devuelve:
        True, None si se ha guardado correctamente.
        False, mensaje de error si no se puede guardar.
    """

    if not file:
        return False, "No se ha seleccionado ningún archivo."

    if not file.filename:
        return False, "El archivo no tiene un nombre válido."

    rel_path = normalize_path(rel_path)

    if rel_path is None or not cloud_repo.folder_exists(username, rel_path):
        return False, "La carpeta de destino no existe."

    # Limpiar el nombre del archivo
    filename = secure_filename(file.filename)

    if not filename:
        return False, "El nombre del archivo no es válido."

    # Comprobar tamaño
    file.seek(0, 2)
    file_size = file.tell()
    file.seek(0)

    # Comprobar cuota
    if not has_enough_storage(username, file_size, storage_gb):
        return False, "No tienes suficiente espacio de almacenamiento."

    # Evitar sobrescribir archivos o carpetas existentes
    if cloud_repo.entry_exists(username, filename, rel_path):
        return False, "Ya existe un archivo o carpeta con ese nombre."

    # Cambiar temporalmente el nombre utilizado por el objeto FileStorage
    original_filename = file.filename
    file.filename = filename

    try:
        cloud_repo.save_file(username, file, rel_path)
    finally:
        file.filename = original_filename

    return True, None


def get_file(username, filename, rel_path=""):
    """
    Obtiene un archivo del usuario.

    Devuelve:
        Path si existe.
        None si no existe.
    """
    filename = secure_filename(filename)

    rel_path = normalize_path(rel_path)

    if not filename or rel_path is None:
        return None

    return cloud_repo.get_file(username, filename, rel_path)


def download_file(username, filename, rel_path=""):
    """
    Prepara un archivo para su descarga.

    Devuelve:
        Respuesta de Flask si existe.
        None si no existe.
    """
    file_path = get_file(username, filename, rel_path)

    if file_path is None:
        return None

    return send_file(
        file_path,
        as_attachment=True,
        download_name=file_path.name
    )


def delete_file(username, filename, rel_path=""):
    """
    Elimina un archivo o una carpeta (con todo su contenido) del usuario.

    Devuelve:
        True, None si se ha eliminado.
        False, mensaje de error si no existe.
    """
    filename = secure_filename(filename)

    rel_path = normalize_path(rel_path)

    if not filename or rel_path is None:
        return False, "Nombre de archivo no válido."

    if cloud_repo.file_exists(username, filename, rel_path):
        cloud_repo.delete_file(username, filename, rel_path)
        return True, None

    if cloud_repo.delete_folder(username, filename, rel_path):
        return True, None

    return False, "El archivo o carpeta no existe."


def rename_file(username, old_filename, new_filename, rel_path=""):
    """
    Cambia el nombre de un archivo o de una carpeta.
    """

    old_filename = secure_filename(old_filename)
    new_filename = secure_filename(new_filename)

    rel_path = normalize_path(rel_path)

    if not old_filename or not new_filename or rel_path is None:
        return False, "Nombre de archivo no válido."

    if not cloud_repo.entry_exists(username, old_filename, rel_path):
        return False, "El archivo original no existe."

    if cloud_repo.entry_exists(username, new_filename, rel_path):
        return False, "Ya existe un archivo o carpeta con ese nombre."

    cloud_repo.rename_entry(
        username,
        old_filename,
        new_filename,
        rel_path
    )

    return True, None