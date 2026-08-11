from flask import Blueprint, render_template, redirect, url_for
from app.services import login_service

dashboard_bp = Blueprint("dashboard_bp",__name__)

@dashboard_bp.route("/dashboard")
def dashboard():

    if not login_service.is_logged_in():
        return redirect(url_for("home_bp.login"))

    return render_template("dashboard.html")