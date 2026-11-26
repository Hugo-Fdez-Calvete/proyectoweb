from functools import wraps

from flask import (
    Blueprint, flash, jsonify, redirect, render_template,
    request, session, url_for,
)

from app.services import (account_service, groups_service, mail_service, notify_service,
                          profile_service, public_service)
from app.services.account_service import AccountError
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
    settings = notify_service.get_settings(user)
    return render_template(
        "config.html",
        user=user,
        profile_form=profile_form or ProfileForm(obj=user),
        password_form=password_form or PasswordForm(),
        notify=settings,
        notify_verified=notify_service.is_verified(user, settings),
        notify_preferences=notify_service.PREFERENCES,
        mail_ready=mail_service.configured(),
        invites=groups_service.invites_for(user),
        publics=public_service.of_owner(user),
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
            # El correo ya no va en este formulario: se gestiona en «Correo y avisos»
            user = profile_service.update_profile(
                user_id, form.username.data, user.email or "", form.phone.data
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

# ---------- Avisos por correo ----------
@profile_bp.route("/perfil/notificaciones", methods=["POST"])
@login_required
def update_notifications(user_id):
    user = profile_service.get_user(user_id)
    notify_service.save_preferences(user, request.form)
    flash("Preferencias de avisos guardadas.", "success")
    return redirect(url_for("profile_bp.profile") + "#avisos")


@profile_bp.route("/perfil/correo", methods=["POST"])
@login_required
def change_email(user_id):
    try:
        user, changed = profile_service.change_email(user_id, request.form.get("email"))
    except ProfileError as e:
        flash(str(e), "danger")
        return redirect(url_for("profile_bp.profile") + "#correo")
    if changed or not notify_service.is_verified(user):
        ok, message = notify_service.send_verification(user)
        flash(("Correo guardado. " if changed else "") + message, "success" if ok else "warning")
    else:
        flash("Ese correo ya está vinculado y confirmado.", "success")
    return redirect(url_for("profile_bp.profile") + "#correo")


@profile_bp.route("/perfil/correo/desvincular", methods=["POST"])
@login_required
def unlink_email(user_id):
    try:
        user = profile_service.unlink_email(user_id)
        notify_service.forget_email(user)
        flash("Correo desvinculado. Ya no recibirás avisos por correo.", "success")
    except ProfileError as e:
        flash(str(e), "danger")
    return redirect(url_for("profile_bp.profile") + "#correo")


@profile_bp.route("/perfil/eliminar", methods=["POST"])
@login_required
def delete_account(user_id):
    try:
        username = account_service.delete_own_account(
            user_id, request.form.get("password"), request.form.get("confirm"))
    except AccountError as e:
        flash(str(e), "danger")
        return redirect(url_for("profile_bp.profile") + "#eliminar")
    session.clear()
    flash(f"La cuenta «{username}» y todos sus datos se han eliminado. ¡Gracias por pasar por aquí!", "success")
    # La página de inicio de sesión es la que enseña los avisos (flash)
    return redirect(url_for(LOGIN_ENDPOINT))


@profile_bp.route("/perfil/verificar-correo", methods=["POST"])
@login_required
def send_verification(user_id):
    user = profile_service.get_user(user_id)
    ok, message = notify_service.send_verification(user)
    flash(message, "success" if ok else "danger")
    return redirect(url_for("profile_bp.profile") + "#correo")


@profile_bp.route("/perfil/verificar/<token>")
def verify_email(token):
    ok, message = notify_service.confirm_verification(token)
    flash(message, "success" if ok else "danger")
    if session.get("user_id"):
        return redirect(url_for("profile_bp.profile") + "#correo")
    return redirect(url_for(LOGIN_ENDPOINT))
