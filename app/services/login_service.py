from app.services import hash_service
from app.services import query_service
from flask import session

def login_user(identifier, login_method, password):

    if login_method == "username":
        user = query_service.get_user_by_username(identifier)

    elif login_method == "email":
        user = query_service.get_user_by_email(identifier)

    elif login_method == "phone":
        user = query_service.get_user_by_phone(identifier)

    else:
        return False, None, "Método de acceso no válido."

    # Usuario inexistente
    if not user:
        return False, None, "Usuario o contraseña incorrectos."

    # Contraseña incorrecta
    if not hash_service.verify_password(password, user.password_hash):
        return False, None, "Usuario o contraseña incorrectos."

    # Cuenta pendiente
    if user.status == "pending":
        return (False,None,"Tu cuenta todavía no ha sido aprobada por un administrador.")

    # Cuenta rechazada
    if user.status == "rejected":
        return (False,None,"Tu solicitud de registro ha sido rechazada.")

    # Actualizar última conexión
    query_service.update_last_login(user.id)

    return True, user, None

def logout_user():
    session.clear()