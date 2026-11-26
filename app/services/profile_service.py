import re

from app.repositories.profile_repo import ProfileRepository
from app.repositories import cloud_repo

# --- ADAPTA ESTAS DOS LÍNEAS a las funciones reales de tu hash_service.py ---
from app.services.hash_service import hash_password, verify_password
# ---------------------------------------------------------------------------

profile_repo = ProfileRepository()

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,30}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^\+?[0-9]{9,15}$")
MIN_PASSWORD = 8


class ProfileError(Exception):
    """Error de validación que se puede mostrar al usuario."""


def get_user(user_id, repo: ProfileRepository = None):
    repo = repo or profile_repo
    user = repo.find_by_id(user_id)
    if not user:
        raise ProfileError("El usuario no existe.")
    return user


def check_username(username, user_id, repo: ProfileRepository = None):
    """Devuelve (disponible, mensaje). Se usa también en la comprobación en vivo."""
    repo = repo or profile_repo
    username = (username or "").strip()
    if not USERNAME_RE.match(username):
        return False, "Entre 3 y 30 caracteres: letras, números, punto, guion y guion bajo."
    if repo.username_taken(username, exclude_id=user_id):
        return False, "Ese nombre de usuario ya está en uso."
    return True, "Nombre de usuario disponible."


def update_profile(user_id, username, email, phone, repo: ProfileRepository = None):
    repo = repo or profile_repo
    user = get_user(user_id, repo)

    username = (username or "").strip()
    email = (email or "").strip().lower()
    phone = (phone or "").replace(" ", "").strip()

    if username != user.username:
        ok, msg = check_username(username, user.id, repo)
        if not ok:
            raise ProfileError(msg)

    if email and email != (user.email or "").lower():
        if not EMAIL_RE.match(email):
            raise ProfileError("El correo electrónico no es válido.")
        if repo.email_taken(email, exclude_id=user.id):
            raise ProfileError("Ese correo ya está registrado.")

    if phone and phone != user.phone:
        if not PHONE_RE.match(phone):
            raise ProfileError("El teléfono debe tener entre 9 y 15 dígitos (puede empezar por +).")
        if repo.phone_taken(phone, exclude_id=user.id):
            raise ProfileError("Ese teléfono ya está registrado.")

    old_username = user.username
    renamed = False
    if username != old_username:
        # La nube del usuario está en app/cloud/<usuario>: se mueve con él
        if not cloud_repo.rename_user_folder(old_username, username):
            raise ProfileError("No se ha podido mover tu carpeta de La Nube al nuevo nombre.")
        renamed = True

    try:
        return repo.save_profile(user, username, email, phone)
    except Exception:
        if renamed:
            cloud_repo.rename_user_folder(username, old_username)
        raise


def change_email(user_id, email, repo: ProfileRepository = None):
    """Vincula o cambia el correo. Queda sin confirmar hasta pulsar el enlace."""
    repo = repo or profile_repo
    user = get_user(user_id, repo)
    email = (email or "").strip().lower()
    if not email:
        raise ProfileError("Escribe un correo.")
    if not EMAIL_RE.match(email) or len(email) > 120:
        raise ProfileError("El correo electrónico no es válido.")
    if email == (user.email or "").lower():
        return user, False
    if repo.email_taken(email, exclude_id=user.id):
        raise ProfileError("Ese correo ya está vinculado a otra cuenta.")
    return repo.save_profile(user, user.username, email, user.phone or ""), True


def unlink_email(user_id, repo: ProfileRepository = None):
    """Quita el correo de la cuenta."""
    repo = repo or profile_repo
    user = get_user(user_id, repo)
    if not user.email:
        raise ProfileError("No tienes ningún correo vinculado.")
    return repo.save_profile(user, user.username, "", user.phone or "")


def change_password(user_id, current, new, confirm, repo: ProfileRepository = None):
    repo = repo or profile_repo
    user = get_user(user_id, repo)

    if not verify_password(current or "", user.password_hash):
        raise ProfileError("La contraseña actual no es correcta.")
    if len(new or "") < MIN_PASSWORD:
        raise ProfileError(f"La nueva contraseña debe tener al menos {MIN_PASSWORD} caracteres.")
    if new != confirm:
        raise ProfileError("Las contraseñas nuevas no coinciden.")
    if verify_password(new, user.password_hash):
        raise ProfileError("La nueva contraseña debe ser distinta de la actual.")

    return repo.set_password_hash(user, hash_password(new))