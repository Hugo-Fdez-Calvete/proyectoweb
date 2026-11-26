"""Eliminar una cuenta con todos sus datos.

Lo usan el propio usuario (desde su perfil) y los administradores.
Se borra:
    - su nube personal (todos los archivos de app/cloud/<usuario>)
    - los grupos que ha creado, con sus archivos, chats y mensajes
    - su sitio en los grupos de otros e invitaciones
    - las carpetas que comparte o le comparten y sus carpetas públicas
    - sus ajustes de avisos, su vínculo con Google (Pulso) y su «tinta» de Pixel Art
    - la cuenta
Sus mensajes en grupos de otras personas se conservan como «Usuario
eliminado» para no romper esas conversaciones. Los píxeles que pintó siguen
en el lienzo común de Pixel Art.
"""
from app.repositories import account_repo, cloud_repo
from app.services import groups_service
from app.services.hash_service import verify_password

CONFIRM_WORD = "ELIMINAR"


class AccountError(Exception):
    """Error que se puede enseñar al usuario."""


def delete_user_data(user):
    """Borra todo lo asociado al usuario, menos la fila de la cuenta."""
    groups_service.purge_user(user.id)
    cloud_repo.delete_root(user.username)
    account_repo.delete_google_links(user.id)
    account_repo.delete_pixel_quota(user.id)


def delete_own_account(user_id, password, confirm):
    user = account_repo.get_user(user_id)
    if user is None:
        raise AccountError("La cuenta no existe.")
    if (confirm or "").strip().upper() != CONFIRM_WORD:
        raise AccountError(f"Escribe {CONFIRM_WORD} para confirmar.")
    if not verify_password(password or "", user.password_hash):
        raise AccountError("La contraseña no es correcta.")
    if user.is_admin and account_repo.count_admins() <= 1:
        raise AccountError("Eres el único administrador: nombra a otro antes de eliminar tu cuenta.")
    username = user.username
    delete_user_data(user)
    account_repo.delete_user(user)
    return username
