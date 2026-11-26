"""Carpetas compartidas con otros usuarios.

    /HomeCloud/compartir?path=<carpeta>       con quién compartes una carpeta (propietario)
    /HomeCloud/compartido                     lo que te han compartido y lo que compartes
    /HomeCloud/compartido/<id>?path=...       navegar por una carpeta compartida contigo
"""
from flask import Blueprint, flash, redirect, render_template, request, url_for

from app.routes.groups_routes import login_required
from app.services import notify_service, public_service, share_service
from app.services.share_service import ShareError


shares_bp = Blueprint("shares_bp", __name__, url_prefix="/HomeCloud")


# ------------------------------------------------------------ propietario
@shares_bp.route("/compartir")
@login_required
def manage(user):
    path = request.args.get("path", "")
    try:
        path, shares = share_service.shares_of_folder(user, path)
    except ShareError as e:
        flash(str(e), "danger")
        return redirect(url_for("dashboard_bp.dashboard"))
    return render_template("compartir/compartir.html", user=user, path=path, shares=shares,
                           public=public_service.of_folder(user, path),
                           folder=path.split("/")[-1],
                           parent="/".join(path.split("/")[:-1]))


@shares_bp.route("/compartir", methods=["POST"])
@login_required
def share(user):
    path = request.form.get("path", "")
    try:
        share = share_service.share_folder(user, path, request.form.get("username"),
                                           request.form.get("can_edit") == "1")
        flash(f"Carpeta compartida con {share.target.username}.", "success")
        notify_service.safe(notify_service.share_created, share.target, user, share.path, share.can_edit)
    except ShareError as e:
        flash(str(e), "danger")
    return redirect(url_for("shares_bp.manage", path=path))


@shares_bp.route("/compartir/<int:share_id>/permiso", methods=["POST"])
@login_required
def set_permission(user, share_id):
    try:
        share = share_service.set_edit(share_id, user, request.form.get("can_edit") == "1")
        flash(f"Permiso de {share.target.username} actualizado.", "success")
        path = share.path
    except ShareError as e:
        flash(str(e), "danger")
        path = request.form.get("path", "")
    return _back(path)


@shares_bp.route("/compartir/<int:share_id>/quitar", methods=["POST"])
@login_required
def unshare(user, share_id):
    try:
        share = share_service.unshare(share_id, user)
        flash(f"Has dejado de compartir «{share.path.split('/')[-1]}» con {share.target.username}.", "success")
        path = share.path
    except ShareError as e:
        flash(str(e), "danger")
        path = request.form.get("path", "")
    return _back(path)


def _back(path):
    nxt = request.form.get("next")
    if nxt == "list":
        return redirect(url_for("shares_bp.shared_with_me"))
    if nxt == "admin":
        return redirect(url_for("admin_bp.shares"))
    return redirect(url_for("shares_bp.manage", path=path) if path else url_for("dashboard_bp.dashboard"))


# ----------------------------------------------------------- compartido
@shares_bp.route("/compartido")
@login_required
def shared_with_me(user):
    return render_template("compartir/compartido.html", user=user,
                           received=share_service.shared_with_me(user),
                           given=share_service.shared_by_me(user))


def _access(share_id, user):
    try:
        return share_service.get_access(share_id, user)
    except ShareError as e:
        flash(str(e), "danger")
        return None


def _path():
    return request.values.get("path", "")


def _back_to_share(share_id):
    return redirect(url_for("shares_bp.browse", share_id=share_id, path=_path() or None))


@shares_bp.route("/compartido/<int:share_id>")
@login_required
def browse(user, share_id):
    access = _access(share_id, user)
    if access is None:
        return redirect(url_for("shares_bp.shared_with_me"))
    data = share_service.listing(access, request.args.get("path", ""))
    if data is None:
        flash("La carpeta no existe.", "danger")
        return redirect(url_for("shares_bp.browse", share_id=share_id))
    return render_template("compartir/carpeta.html", user=user, access=access,
                           share=access.share, listing=data)


@shares_bp.route("/compartido/<int:share_id>/subir", methods=["POST"])
@login_required
def upload(user, share_id):
    access = _access(share_id, user)
    if access is None:
        return redirect(url_for("shares_bp.shared_with_me"))
    file = request.files.get("file")
    if not file or not file.filename:
        flash("No se ha seleccionado ningún archivo.", "danger")
        return _back_to_share(share_id)
    try:
        share_service.upload(access, file, _path())
        flash("Archivo subido correctamente.", "success")
    except ShareError as e:
        flash(str(e), "danger")
    return _back_to_share(share_id)


@shares_bp.route("/compartido/<int:share_id>/carpeta", methods=["POST"])
@login_required
def create_folder(user, share_id):
    access = _access(share_id, user)
    if access is None:
        return redirect(url_for("shares_bp.shared_with_me"))
    try:
        share_service.create_folder(access, request.form.get("folder_name", ""), _path())
        flash("Carpeta creada correctamente.", "success")
    except ShareError as e:
        flash(str(e), "danger")
    return _back_to_share(share_id)


@shares_bp.route("/compartido/<int:share_id>/borrar/<path:name>", methods=["POST"])
@login_required
def delete_entry(user, share_id, name):
    access = _access(share_id, user)
    if access is None:
        return redirect(url_for("shares_bp.shared_with_me"))
    try:
        share_service.delete_entry(access, name, _path())
        flash("Elemento eliminado correctamente.", "success")
    except ShareError as e:
        flash(str(e), "danger")
    return _back_to_share(share_id)


@shares_bp.route("/compartido/<int:share_id>/descargar/<path:name>")
@login_required
def download(user, share_id, name):
    access = _access(share_id, user)
    if access is None:
        return redirect(url_for("shares_bp.shared_with_me"))
    response = share_service.download(access, name, _path())
    if response is None:
        flash("El archivo no existe.", "danger")
        return _back_to_share(share_id)
    return response
