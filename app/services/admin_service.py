from app.repositories.admin_repo import AdminRepository

admin_repo = AdminRepository()

STATUS_PENDING = "pending"
STATUS_ACTIVE = "active"
STATUS_SUSPENDED = "suspended"
VALID_STATUSES = (STATUS_PENDING, STATUS_ACTIVE, STATUS_SUSPENDED)


class AdminError(Exception):
    """Error de negocio que se puede mostrar al administrador."""


def _get_user_or_fail(user_id, repo):
    user = repo.find_by_id(user_id)
    if not user:
        raise AdminError("El usuario no existe.")
    return user


# ---------- Dashboard ----------
def get_dashboard_stats(repo: AdminRepository = None):
    repo = repo or admin_repo
    return {
        "users": repo.count_users(),
        "pending": repo.count_users(STATUS_PENDING),
        "active": repo.count_users(STATUS_ACTIVE),
        "suspended": repo.count_users(STATUS_SUSPENDED),
        "storage_gb": repo.total_storage_gb(),
        # TODO: cuando exista el modelo de archivos, contar aquí
        "files": 0,
    }


def get_pending_users(limit=5, repo: AdminRepository = None):
    repo = repo or admin_repo
    return repo.list_by_status(STATUS_PENDING, limit)


def get_latest_users(limit=5, repo: AdminRepository = None):
    repo = repo or admin_repo
    return repo.latest_users(limit)


# ---------- Listado ----------
def list_users(search=None, status=None, page=1, per_page=10, repo: AdminRepository = None):
    repo = repo or admin_repo
    if status not in VALID_STATUSES:
        status = None
    return repo.search_users(search=search or None, status=status, page=page, per_page=per_page)


# ---------- Acciones ----------
def approve_user(user_id, repo: AdminRepository = None):
    repo = repo or admin_repo
    user = _get_user_or_fail(user_id, repo)
    repo.set_status(user, STATUS_ACTIVE)
    return user


def suspend_user(user_id, current_user_id, repo: AdminRepository = None):
    repo = repo or admin_repo
    user = _get_user_or_fail(user_id, repo)
    if user.id == current_user_id:
        raise AdminError("No puedes suspender tu propia cuenta.")
    repo.set_status(user, STATUS_SUSPENDED)
    return user


def toggle_admin(user_id, current_user_id, repo: AdminRepository = None):
    repo = repo or admin_repo
    user = _get_user_or_fail(user_id, repo)
    if user.id == current_user_id:
        raise AdminError("No puedes cambiar tu propio rol.")
    if user.is_admin and repo.count_admins() <= 1:
        raise AdminError("Debe quedar al menos un administrador.")
    repo.set_admin(user, not user.is_admin)
    return user


def set_user_storage(user_id, storage_gb, repo: AdminRepository = None):
    repo = repo or admin_repo
    user = _get_user_or_fail(user_id, repo)
    try:
        storage_gb = float(storage_gb)
    except (TypeError, ValueError):
        raise AdminError("El almacenamiento debe ser un número.")
    if storage_gb < 0:
        raise AdminError("El almacenamiento no puede ser negativo.")
    repo.set_storage(user, storage_gb)
    return user


def delete_user(user_id, current_user_id, repo: AdminRepository = None):
    repo = repo or admin_repo
    user = _get_user_or_fail(user_id, repo)
    if user.id == current_user_id:
        raise AdminError("No puedes eliminar tu propia cuenta.")
    if user.is_admin and repo.count_admins() <= 1:
        raise AdminError("No puedes eliminar al último administrador.")
    repo.delete(user)
    return user
