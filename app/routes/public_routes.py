"""Carpetas públicas.

Visitantes (sin cuenta):
    /publico                                   listado de carpetas públicas
    /publico/<enlace>?path=...                 ver una carpeta pública
    /publico/<enlace>/descargar?name=...       descargar un archivo
    (el nombre va en ?name= para que la URL no termine en .log, .sql… y
     Nginx no la confunda con ruido de bots)

Propietario (con sesión):
    POST /HomeCloud/publicar                   hacer pública una carpeta
    POST /HomeCloud/publica/<id>/ajustes       listado sí/no y descripción
    POST /HomeCloud/publica/<id>/enlace        cambiar el enlace
    POST /HomeCloud/publica/<id>/quitar        dejar de publicarla
"""
from flask import Blueprint, abort, flash, redirect, render_template, request, url_for

from app.routes.groups_routes import login_required
from app.services import public_service
from app.services.public_service import PublicError


public_bp = Blueprint("public_bp", __name__)


# ------------------------------------------------------------- visitantes
@public_bp.route("/publico")
def listing():
    return render_template("publico/listado.html", cards=public_service.listing_page())


def _access(token):
    try:
        return public_service.get_access(token)
    except PublicError:
        abort(404)


@public_bp.route("/publico/<token>")
def folder(token):
    access = _access(token)
    data = public_service.listing(access, request.args.get("path", ""))
    if data is None:
        abort(404)
    return render_template("publico/carpeta.html", access=access, listing=data, token=token)


@public_bp.route("/publico/<token>/descargar")
def download(token):
    access = _access(token)
    response = public_service.download(access, request.args.get("name"), request.args.get("path", ""))
    if response is None:
        abort(404)
    return response


# ------------------------------------------------------------ propietario
def _back(path):
    nxt = request.form.get("next")
    if nxt == "perfil":
        return redirect(url_for("profile_bp.profile") + "#publicas")
    if nxt == "admin":
        return redirect(url_for("admin_bp.shares") + "#publicas")
    return redirect(url_for("shares_bp.manage", path=path) if path else url_for("dashboard_bp.dashboard"))


@public_bp.route("/HomeCloud/publicar", methods=["POST"])
@login_required
def publish(user):
    path = request.form.get("path", "")
    try:
        public_service.publish(user, path, request.form.get("listed") == "1", request.form.get("description"))
        flash("La carpeta ya es pública. Comparte el enlace con quien quieras.", "success")
    except PublicError as e:
        flash(str(e), "danger")
    return _back(path)


@public_bp.route("/HomeCloud/publica/<int:public_id>/ajustes", methods=["POST"])
@login_required
def settings(user, public_id):
    try:
        public = public_service.update(public_id, user, request.form.get("listed") == "1",
                                       request.form.get("description"))
        flash("Carpeta pública actualizada.", "success")
        path = public.path
    except PublicError as e:
        flash(str(e), "danger")
        path = request.form.get("path", "")
    return _back(path)


@public_bp.route("/HomeCloud/publica/<int:public_id>/enlace", methods=["POST"])
@login_required
def new_link(user, public_id):
    try:
        public = public_service.new_link(public_id, user)
        flash("Enlace cambiado: el anterior ya no funciona.", "success")
        path = public.path
    except PublicError as e:
        flash(str(e), "danger")
        path = request.form.get("path", "")
    return _back(path)


@public_bp.route("/HomeCloud/publica/<int:public_id>/quitar", methods=["POST"])
@login_required
def unpublish(user, public_id):
    try:
        public = public_service.unpublish(public_id, user)
        flash(f"«{public.path.split('/')[-1]}» ya no es pública.", "success")
        path = public.path
    except PublicError as e:
        flash(str(e), "danger")
        path = request.form.get("path", "")
    return _back(path)
