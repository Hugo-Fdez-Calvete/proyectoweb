from functools import wraps

from flask import (Blueprint, abort, flash, redirect, render_template, request, session, url_for,)

from app.services import admin_service
from app.services.admin_service import AdminError
from app.services.query_service import user_repo

admin_bp = Blueprint("admin_bp", __name__, url_prefix="/admin")


# ---------- Protección ----------
def admin_required(view):
    """Solo deja pasar a usuarios autenticados, activos y administradores.

    Adáptalo si guardas la sesión de otra forma (p. ej. Flask-Login).
    """
    @wraps(view)
    def wrapper(*args, **kwargs):
        user_id = session.get("user_id")
        if not user_id:
            return redirect(url_for("home_bp.login"))
        user = user_repo.find_by_id(user_id)
        if not user or not user.is_admin or user.status != "active":
            abort(403)
        return view(user, *args, **kwargs)
    return wrapper


def _run(action, success_msg, *args):
    try:
        action(*args)
        flash(success_msg, "success")
    except AdminError as e:
        flash(str(e), "danger")


# ---------- Dashboard ----------
@admin_bp.route("/")
@admin_required
def admin(current_user):
    return render_template(
        "admin/admin_panel.html",
        stats=admin_service.get_dashboard_stats(),
        pending_users=admin_service.get_pending_users(),
        latest_users=admin_service.get_latest_users(),
        current_user=current_user,
        active_page="dashboard",
    )


# ---------- Usuarios ----------
@admin_bp.route("/users")
@admin_required
def users(current_user):
    search = request.args.get("q", "").strip()
    status = request.args.get("status", "").strip()
    page = request.args.get("page", 1, type=int)
    pagination = admin_service.list_users(search, status, page)
    return render_template(
        "admin/admin_users.html",
        pagination=pagination,
        search=search,
        status=status,
        current_user=current_user,
        active_page="users",
    )


def _back():
    return redirect(request.referrer or url_for("admin_bp.users"))


@admin_bp.route("/users/<int:user_id>/approve", methods=["POST"])
@admin_required
def approve(current_user, user_id):
    _run(admin_service.approve_user, "Usuario aprobado.", user_id)
    return _back()


@admin_bp.route("/users/<int:user_id>/suspend", methods=["POST"])
@admin_required
def suspend(current_user, user_id):
    _run(admin_service.suspend_user, "Usuario suspendido.", user_id, current_user.id)
    return _back()


@admin_bp.route("/users/<int:user_id>/toggle-admin", methods=["POST"])
@admin_required
def toggle_admin(current_user, user_id):
    _run(admin_service.toggle_admin, "Rol actualizado.", user_id, current_user.id)
    return _back()


@admin_bp.route("/users/<int:user_id>/storage", methods=["POST"])
@admin_required
def storage(current_user, user_id):
    _run(admin_service.set_user_storage, "Almacenamiento actualizado.",
         user_id, request.form.get("storage_gb"))
    return _back()


@admin_bp.route("/users/<int:user_id>/delete", methods=["POST"])
@admin_required
def delete(current_user, user_id):
    _run(admin_service.delete_user, "Usuario eliminado.", user_id, current_user.id)
    return _back()
