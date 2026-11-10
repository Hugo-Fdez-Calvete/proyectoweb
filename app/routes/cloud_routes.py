from flask import Blueprint, render_template, request, redirect, url_for, flash, session

from app.services import cloud_service
from app.repositories import primary_repo


cloud_bp = Blueprint("cloud_bp", __name__, url_prefix="/cloud")


@cloud_bp.route("/")
def cloud():

    # Comprobar sesión
    user_id = session.get("user_id")

    if not user_id:
        return redirect(url_for("home_bp.index"))

    # Obtener usuario
    user = primary_repo.get_user_by_id(user_id)

    if not user:
        session.clear()
        return redirect(url_for("home_bp.index"))

    # Crear carpeta del usuario
    cloud_service.create_user_cloud(user.username)

    # Carpeta actual (vacía = raíz del usuario)
    listing = cloud_service.get_listing(
        user.username,
        request.args.get("path", "")
    )

    if listing is None:
        flash("La carpeta no existe.", "danger")

        return redirect(url_for("dashboard_bp.dashboard"))

    # Obtener almacenamiento utilizado
    used_storage = cloud_service.get_used_storage_gb(user.username)

    return render_template(
        "dashboard.html",
        user=user,
        files=listing["entries"],
        current_path=listing["current_path"],
        breadcrumbs=listing["breadcrumbs"],
        parent_path=listing["parent_path"],
        used_storage=used_storage
    )


@cloud_bp.route("/upload", methods=["POST"])
def upload():

    # Comprobar sesión
    user_id = session.get("user_id")

    if not user_id:
        return redirect(url_for("home_bp.index"))

    # Obtener usuario
    user = primary_repo.get_user_by_id(user_id)

    if not user:
        session.clear()
        return redirect(url_for("home_bp.index"))

    # Carpeta actual (vacía = raíz del usuario)
    current_path = request.values.get("path", "")

    # Obtener archivo
    file = request.files.get("file")

    if not file or file.filename == "":
        flash(
            "No se ha seleccionado ningún archivo.",
            "danger"
        )

        return redirect(url_for("dashboard_bp.dashboard", path=current_path or None))

    # Guardar archivo
    success, error = cloud_service.save_file(
        user.username,
        file,
        user.storage_gb,
        current_path
    )

    if not success:
        flash(error, "danger")

        return redirect(url_for("dashboard_bp.dashboard", path=current_path or None))

    flash(
        "Archivo subido correctamente.",
        "success"
    )

    return redirect(url_for("dashboard_bp.dashboard", path=current_path or None))


@cloud_bp.route("/folder/create", methods=["POST"])
def create_folder():

    # Comprobar sesión
    user_id = session.get("user_id")

    if not user_id:
        return redirect(url_for("home_bp.index"))

    # Obtener usuario
    user = primary_repo.get_user_by_id(user_id)

    if not user:
        session.clear()
        return redirect(url_for("home_bp.index"))

    # Carpeta actual (vacía = raíz del usuario)
    current_path = request.values.get("path", "")

    # Nombre de la nueva carpeta
    folder_name = request.form.get("folder_name", "")

    # Crear carpeta
    success, error = cloud_service.create_folder(
        user.username,
        folder_name,
        current_path
    )

    if not success:
        flash(error, "danger")

        return redirect(url_for("dashboard_bp.dashboard", path=current_path or None))

    flash(
        "Carpeta creada correctamente.",
        "success"
    )

    return redirect(url_for("dashboard_bp.dashboard", path=current_path or None))


@cloud_bp.route("/download/<filename>")
def download(filename):

    # Comprobar sesión
    user_id = session.get("user_id")

    if not user_id:
        return redirect(url_for("home_bp.index"))

    # Obtener usuario
    user = primary_repo.get_user_by_id(user_id)

    if not user:
        session.clear()
        return redirect(url_for("home_bp.index"))

    # Carpeta actual (vacía = raíz del usuario)
    current_path = request.values.get("path", "")

    # Obtener archivo
    file = cloud_service.download_file(
        user.username,
        filename,
        current_path
    )

    if file is None:
        flash(
            "El archivo no existe.",
            "danger"
        )

        return redirect(url_for("dashboard_bp.dashboard", path=current_path or None))

    return file


@cloud_bp.route("/delete/<filename>", methods=["POST"])
def delete(filename):

    # Comprobar sesión
    user_id = session.get("user_id")

    if not user_id:
        return redirect(url_for("home_bp.index"))

    # Obtener usuario
    user = primary_repo.get_user_by_id(user_id)

    if not user:
        session.clear()
        return redirect(url_for("home_bp.index"))

    # Carpeta actual (vacía = raíz del usuario)
    current_path = request.values.get("path", "")

    # Eliminar archivo o carpeta
    success, error = cloud_service.delete_file(
        user.username,
        filename,
        current_path
    )

    if not success:
        flash(error, "danger")

        return redirect(url_for("dashboard_bp.dashboard", path=current_path or None))

    flash(
        "Elemento eliminado correctamente.",
        "success"
    )

    return redirect(url_for("dashboard_bp.dashboard", path=current_path or None))


@cloud_bp.route("/rename/<filename>", methods=["POST"])
def rename(filename):

    # Comprobar sesión
    user_id = session.get("user_id")

    if not user_id:
        return redirect(url_for("home_bp.index"))

    # Obtener usuario
    user = primary_repo.get_user_by_id(user_id)

    if not user:
        session.clear()
        return redirect(url_for("home_bp.index"))

    # Carpeta actual (vacía = raíz del usuario)
    current_path = request.values.get("path", "")

    # Nuevo nombre
    new_filename = request.form.get("new_filename")

    if not new_filename:
        flash(
            "Debes introducir un nuevo nombre.",
            "danger"
        )

        return redirect(url_for("dashboard_bp.dashboard", path=current_path or None))

    # Renombrar
    success, error = cloud_service.rename_file(
        user.username,
        filename,
        new_filename,
        current_path
    )

    if not success:
        flash(error, "danger")

        return redirect(url_for("dashboard_bp.dashboard", path=current_path or None))

    flash(
        "Renombrado correctamente.",
        "success"
    )

    return redirect(url_for("dashboard_bp.dashboard", path=current_path or None))