from app.services import hash_service
from app.repositories import primary_repo


def register_user(username, email, phone, password, password_confirm):

    # Comprobar contraseñas
    if password != password_confirm:
        return False, "Las contraseñas no coinciden."

    # Comprobar nombre de usuario
    if primary_repo.get_user_by_username(username):
        return False, "Ese nombre de usuario ya está registrado."

    # Comprobar correo
    if email and primary_repo.get_user_by_email(email):
        return False, "Ese correo electrónico ya está registrado."

    # Comprobar teléfono
    if phone and primary_repo.get_user_by_phone(phone):
        return False, "Ese número de teléfono ya está registrado."

    # Crear hash
    password_hash = hash_service.hash_password(password)

    # Crear usuario
    primary_repo.create_user(username=username, email=email, phone=phone, password_hash=password_hash)

    return True, "Registro realizado correctamente."