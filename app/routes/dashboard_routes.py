from flask import Blueprint, render_template, redirect, url_for, session

from app.services import cloud_service
from app.repositories import primary_repo


dashboard_bp = Blueprint("dashboard_bp", __name__, url_prefix="/HomeCloud")


@dashboard_bp.route("/dashboard")
def dashboard():

    # Comprobar sesión
    user_id = session.get("user_id")

    if not user_id:
        return redirect(url_for("home_bp.login"))

    # Obtener usuario mediante el ID de sesión
    user = primary_repo.get_user_by_id(user_id)

    if not user:
        session.clear()
        return redirect(url_for("home_bp.login"))

    # Crear carpeta del usuario si no existe
    cloud_service.create_user_cloud(user.username)

    # Obtener archivos
    files = cloud_service.get_user_files(user.username)

    # Obtener almacenamiento utilizado
    used_storage = cloud_service.get_used_storage_gb(
        user.username
    )

    return render_template("dashboard.html", user=user, files=files, used_storage=used_storage)