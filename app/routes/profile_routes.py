from functools import wraps

from flask import (
    Blueprint, flash, jsonify, redirect, render_template,
    request, session, url_for,
)

from app.services import profile_service
from app.services.profile_service import ProfileError
from app.forms.primary_forms import ProfileForm, PasswordForm

# Ajusta al endpoint real de tu login (p. ej. "home_bp.login")
LOGIN_ENDPOINT = "home_bp.login"

profile_bp = Blueprint("profile_bp", __name__)

def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user_id = session.get("user_id")
        if not user_id:
            return redirect(url_for(LOGIN_ENDPOINT))
        return view(user_id, *args, **kwargs)
    return wrapper

def _render_config(user, profile_form=None, password_form=None):
    return render_template(
        "config.html",
        user=user,
        profile_form=profile_form or ProfileForm(obj=user),
        password_form=password_form or PasswordForm(),
    )

@profile_bp.route("/perfil")
@login_required
def profile(user_id):
    try:
        user = profile_service.get_user(user_id)
    except ProfileError:
        session.clear()
        return redirect(url_for(LOGIN_ENDPOINT))
    return _render_config(user)

@profile_bp.route("/perfil/datos", methods=["POST"])
@login_required
def update_data(user_id):
    user = profile_service.get_user(user_id)
    form = ProfileForm()
    if form.validate_on_submit():
        try:
            user = profile_service.update_profile(
                user_id, form.username.data, form.email.data, form.phone.data
            )
            if "username" in session:
                session["username"] = user.username
            flash("Datos actualizados correctamente.", "success")
            return redirect(url_for("profile_bp.profile"))
        except ProfileError as e:
            flash(str(e), "danger")
    return _render_config(user, profile_form=form)

@profile_bp.route("/perfil/password", methods=["POST"])
@login_required
def update_password(user_id):
    user = profile_service.get_user(user_id)
    form = PasswordForm()
    if form.validate_on_submit():
        try:
            profile_service.change_password(
                user_id,
                form.current_password.data,
                form.new_password.data,
                form.confirm_password.data,
            )
            flash("Contraseña actualizada correctamente.", "success")
            return redirect(url_for("profile_bp.profile"))
        except ProfileError as e:
            flash(str(e), "danger")
    return _render_config(user, password_form=form)

@profile_bp.route("/perfil/check-username")
@login_required
def check_username(user_id):
    available, message = profile_service.check_username(request.args.get("u"), user_id)
    return jsonify(available=available, message=message)