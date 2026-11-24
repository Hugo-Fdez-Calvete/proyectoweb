import hashlib

from flask import Blueprint, render_template, request, jsonify, session, current_app

from app.services import pixel_service
from app.services.pixel_service import PixelError, NoInk


pixel_bp = Blueprint("pixel_bp", __name__, url_prefix="/pixel-art")


def _who():
    """A quién se le cuenta la tinta: (clave, depósito, recarga) o None si no tiene límite."""
    if session.get("is_admin"):
        return None
    user_id = session.get("user_id")
    if user_id:
        cap, rate = pixel_service.LIMITS["user"]
        return ("u:%s" % user_id, cap, rate)
    # la web va detrás de Cloudflare: la IP real del visitante viene en CF-Connecting-IP
    ip = request.headers.get("CF-Connecting-IP") or request.remote_addr or "?"
    digest = hashlib.sha256((current_app.secret_key or "").encode() + ip.encode()).hexdigest()[:40]
    cap, rate = pixel_service.LIMITS["anon"]
    return ("ip:" + digest, cap, rate)


@pixel_bp.route("/")
def pixel_art():
    return render_template("pixel_art.html", w=pixel_service.WIDTH, h=pixel_service.HEIGHT)


@pixel_bp.route("/api/board")
def api_board():
    data = dict(pixel_service.board())
    data["ink"] = pixel_service.ink_info(_who())
    resp = jsonify(data)
    resp.headers["Cache-Control"] = "no-store"
    return resp


@pixel_bp.route("/api/changes")
def api_changes():
    since = request.args.get("since", default=0, type=int)
    resp = jsonify(pixel_service.changes(max(0, since)))
    resp.headers["Cache-Control"] = "no-store"
    return resp


@pixel_bp.route("/api/paint", methods=["POST"])
def api_paint():
    body = request.get_json(silent=True) or {}
    try:
        return jsonify(pixel_service.paint(body.get("pixels"), _who()))
    except NoInk as e:
        return jsonify(error=str(e), ink=e.ink), 429
    except PixelError as e:
        return jsonify(error=str(e)), 400
