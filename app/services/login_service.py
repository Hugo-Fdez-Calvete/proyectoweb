from app.services import hash_service
from app.services import query_service


def login_user(username, password):

    user = query_service.get_user_by_username(username)

    # Usuario inexistente
    if not user:
        return False, None, "Usuario o contraseña incorrectos."

    # Contraseña incorrecta
    if not hash_service.verify_password(
        password,
        user.password_hash
    ):
        return False, None, "Usuario o contraseña incorrectos."

    # Cuenta pendiente
    if user.status == "pending":
        return (
            False,
            None,
            "Tu cuenta todavía no ha sido aprobada por un administrador."
        )

    # Cuenta rechazada
    if user.status == "rejected":
        return (
            False,
            None,
            "Tu solicitud de registro ha sido rechazada."
        )

    # Actualizar última conexión
    query_service.update_last_login(user.id)

    return True, user, None