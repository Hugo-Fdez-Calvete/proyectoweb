from flask import send_file
from werkzeug.utils import secure_filename

from app.repositories import cloud_repo


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


def get_user_files(username):
    """
    Obtiene los archivos almacenados por el usuario.
    """
    return cloud_repo.get_user_files(username)


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


def save_file(username, file, storage_gb):
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

    # Evitar sobrescribir archivos existentes
    if cloud_repo.file_exists(username, filename):
        return False, "Ya existe un archivo con ese nombre."

    # Cambiar temporalmente el nombre utilizado por el objeto FileStorage
    original_filename = file.filename
    file.filename = filename

    try:
        cloud_repo.save_file(username, file)
    finally:
        file.filename = original_filename

    return True, None


def get_file(username, filename):
    """
    Obtiene un archivo del usuario.

    Devuelve:
        Path si existe.
        None si no existe.
    """
    filename = secure_filename(filename)

    if not filename:
        return None

    return cloud_repo.get_file(username, filename)


def download_file(username, filename):
    """
    Prepara un archivo para su descarga.

    Devuelve:
        Respuesta de Flask si existe.
        None si no existe.
    """
    file_path = get_file(username, filename)

    if file_path is None:
        return None

    return send_file(
        file_path,
        as_attachment=True,
        download_name=file_path.name
    )


def delete_file(username, filename):
    """
    Elimina un archivo del usuario.

    Devuelve:
        True, None si se ha eliminado.
        False, mensaje de error si no existe.
    """
    filename = secure_filename(filename)

    if not filename:
        return False, "Nombre de archivo no válido."

    if not cloud_repo.file_exists(username, filename):
        return False, "El archivo no existe."

    cloud_repo.delete_file(username, filename)

    return True, None


def rename_file(username, old_filename, new_filename):
    """
    Cambia el nombre de un archivo.
    """

    old_filename = secure_filename(old_filename)
    new_filename = secure_filename(new_filename)

    if not old_filename or not new_filename:
        return False, "Nombre de archivo no válido."

    if not cloud_repo.file_exists(username, old_filename):
        return False, "El archivo original no existe."

    if cloud_repo.file_exists(username, new_filename):
        return False, "Ya existe un archivo con ese nombre."

    cloud_repo.rename_file(
        username,
        old_filename,
        new_filename
    )

    return True, None