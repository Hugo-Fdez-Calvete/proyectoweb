from flask import Blueprint, render_template, request, redirect, url_for, session, flash, current_app
from functools import wraps
from app.services import login_service, register_service

from app.forms.primary_forms import LoginForm, RegisterForm
from app.models.list.cv_tecnologias import (orbita_externa,orbita_interna,stack,)
from app.models.list.cv_trayectoria import trayectoria
from app.models.list.cv_perfil import (idiomas,habilidades,)
from app.models.list.index_modulos import modulos, arranque, destacados



home_bp = Blueprint("home_bp", __name__)
cv_bp = Blueprint("cv_bp",__name__)


@home_bp.route("/")
def index():
    # tecnologías para la banda de texto y la zona con física de la portada
    tecnologias = list(dict.fromkeys(
        nombre for cat in stack for nombre, _ in cat["tecnologias"]))
    return render_template("index.html", modulos=modulos, arranque=arranque,
                           tecnologias=tecnologias, destacados=destacados)


@home_bp.route("/login", methods=["GET", "POST"])
def login():
    form = LoginForm()
    if form.validate_on_submit():
        identifier = form.identifier.data.strip()

        success, user, error = login_service.login_user(
            identifier,
            form.login_method.data,
            form.password.data,
        )
        if not success:
            flash(error, "danger")
            return render_template("login.html", form=form)

        # sesión nueva al entrar: un identificador de sesión anterior no sirve para nada
        session.clear()
        try:
            current_app.session_interface.regenerate(session)
        except Exception:
            pass
        session["user_id"] = user.id
        session["username"] = user.username
        session["is_admin"] = user.is_admin
        return redirect(url_for("dashboard_bp.dashboard"))

    return render_template("login.html", form=form)


@home_bp.route("/register", methods=["GET", "POST"])
def register():
    form = RegisterForm()
    if form.validate_on_submit():
        success, message = register_service.register_user(
            username=form.username.data.strip(),
            email=(form.email.data or "").strip() or None,
            phone=(form.phone.data or "").strip() or None,
            password=form.password.data,
            password_confirm=form.password_confirm.data,
        )
        if not success:
            flash(message, "danger")
            return render_template("register.html", form=form)

        flash("Registro realizado correctamente. Un administrador debe aprobar tu cuenta.", "success")
        return redirect(url_for("home_bp.login"))

    return render_template("register.html", form=form)

@home_bp.route("/cookies")
def cookies():
    return render_template("cookies.html")


@home_bp.route("/aviso-legal")
def aviso_legal():
    return render_template("aviso_legal.html")


@home_bp.route("/privacidad")
def privacidad():
    return render_template("privacidad.html")

@home_bp.route("/logout")
def logout():
    login_service.logout_user()
    return redirect(url_for("home_bp.index"))

@cv_bp.route("/info")
def curriculum():
    return render_template( "cv.html", orbita_externa=orbita_externa, orbita_interna=orbita_interna, stack=stack, trayectoria=trayectoria,idiomas=idiomas,habilidades=habilidades,)