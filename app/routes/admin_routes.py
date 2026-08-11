from flask import Blueprint, render_template

admin_bp = Blueprint(
    "admin_bp",
    __name__,
    url_prefix="/admin"
)


@admin_bp.route("/admin")
def admin():
    return render_template("admin/admin_panel.html")