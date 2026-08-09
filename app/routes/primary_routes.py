from flask import Blueprint, render_template, request, redirect, url_for, session
from functools import wraps
from app.services import service_x
import random

root_bp = Blueprint("root", __name__)
home_bp = Blueprint("home_bp", __name__)

@root_bp.route("/")
def redirect_homecloud():
    return redirect(url_for("home_bp.index"))

@home_bp.route("/")
def index():
    return render_template("index.html")


@home_bp.route("/login")
def login():
    return render_template("login.html")

@home_bp.route("/register")
def register():
    return render_template("register.html")
