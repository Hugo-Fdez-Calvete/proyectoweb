from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from functools import wraps
from app.services import login_service, register_service
from app.forms.primary_forms import LoginForm, RegisterForm
from app.models.cv_tecnologias import (orbita_externa,orbita_interna,stack,)
from app.models.cv_trayectoria import trayectoria
from app.models.cv_perfil import (idiomas,habilidades,)
from app.models.index_modulos import modulos, arranque



home_bp = Blueprint("home_bp", __name__)
cv_bp = Blueprint("cv_bp",__name__)


@home_bp.route("/")
def index():
    return render_template("index.html", modulos=modulos, arranque=arranque)


@home_bp.route("/login", methods=["GET", "POST"])
def login():
    form = LoginForm()
    if form.validate_on_submit():
        success, user, error = login_service.login_user(
            form.identifier.data.strip(),
            form.login_method.data,
            form.password.data,
        )
        if not success:
            flash(error, "danger")
            return render_template("login.html", form=form)

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

@home_bp.route("/logout")
def logout():
    login_service.logout_user()
    return redirect(url_for("home_bp.index"))

@cv_bp.route("/info")
def curriculum():
    return render_template( "cv.html", orbita_externa=orbita_externa, orbita_interna=orbita_interna, stack=stack, trayectoria=trayectoria,idiomas=idiomas,habilidades=habilidades,)