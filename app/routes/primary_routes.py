from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from functools import wraps
from app.services import login_service, register_service

home_bp = Blueprint("home_bp", __name__)
cv_bp = Blueprint("cv_bp",__name__)


@home_bp.route("/")
def index():
    return render_template("index.html")


@home_bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":

        login_method = request.form.get("login_method", "username")
        identifier = request.form.get("identifier", "").strip()
        password = request.form.get("password", "")

        success, user, error = login_service.login_user(identifier, login_method, password)

        if not success:
            flash(error, "danger")
            return render_template("login.html")

        session["user_id"] = user.id
        session["username"] = user.username
        session["is_admin"] = user.is_admin

        return redirect(url_for("dashboard_bp.dashboard"))
    return render_template("login.html")

@home_bp.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":

        username = request.form.get("username", "").strip()
        email = request.form.get("email", "").strip() or None
        phone = request.form.get("phone", "").strip() or None
        password = request.form.get("password", "")
        password_confirm = request.form.get("password_confirm", "")

        success, message = register_service.register_user(username=username, email=email, phone=phone, password=password, password_confirm=password_confirm)

        if not success:
            flash(message, "danger")
            return render_template("register.html")

        flash("Registro realizado correctamente. " "Un administrador debe aprobar tu cuenta.", "success")

        return redirect(url_for("home_bp.login"))
    return render_template("register.html")

@home_bp.route("/logout")
def logout():
    login_service.logout_user()
    return redirect(url_for("home_bp.index"))

@cv_bp.route("/info")
def curriculum():
    return render_template("cv.html")