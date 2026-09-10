from pathlib import Path


# app/cloud/
CLOUD_PATH = Path(__file__).resolve().parent.parent / "cloud"


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


def get_user_files(username):
    """
    Obtiene todos los archivos del usuario.
    """
    user_folder = get_user_folder(username)

    return [
        file
        for file in user_folder.iterdir()
        if file.is_file()
    ]


def get_used_storage(username):
    """
    Obtiene el espacio utilizado por el usuario en bytes.
    """
    user_folder = get_user_folder(username)

    total_size = 0

    for file in user_folder.rglob("*"):
        if file.is_file():
            total_size += file.stat().st_size

    return total_size


def save_file(username, file):
    """
    Guarda un archivo en la carpeta del usuario.

    Recibe:
        username -> nombre del usuario
        file     -> archivo recibido desde Flask

    Devuelve:
        Ruta del archivo guardado.
    """
    user_folder = get_user_folder(username)

    file_path = user_folder / file.filename

    file.save(file_path)

    return file_path


def file_exists(username, filename):
    """
    Comprueba si existe un archivo dentro de la carpeta del usuario.
    """
    user_folder = get_user_folder(username)

    file_path = user_folder / filename

    return file_path.exists() and file_path.is_file()


def get_file(username, filename):
    """
    Obtiene la ruta de un archivo del usuario.

    Devuelve:
        Path si existe.
        None si no existe.
    """
    user_folder = get_user_folder(username)

    file_path = user_folder / filename

    if not file_path.exists() or not file_path.is_file():
        return None

    return file_path

def get_user_files(username):
    user_folder = get_user_folder(username)

    if not user_folder.exists():
        return []

    return list(user_folder.iterdir())

def delete_file(username, filename):
    """
    Elimina un archivo del usuario.

    Devuelve:
        True si se ha eliminado.
        False si el archivo no existe.
    """
    file_path = get_file(username, filename)

    if file_path is None:
        return False

    file_path.unlink()

    return True


def rename_file(username, old_filename, new_filename):
    """
    Cambia el nombre de un archivo.

    Devuelve:
        True si se ha renombrado.
        False si el archivo original no existe.
    """
    old_file = get_file(username, old_filename)

    if old_file is None:
        return False

    user_folder = get_user_folder(username)
    new_file = user_folder / new_filename

    old_file.rename(new_file)

    return True