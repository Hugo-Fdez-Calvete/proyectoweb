"""Estado de la app: GET /salud

Lo usan el HEALTHCHECK de Docker (Portainer muestra el contenedor como
«healthy» o «unhealthy») y cualquiera que quiera comprobar que la web
responde. Devuelve 200 si todo va bien y 503 si algo importante falla
(la base de datos o las carpetas de archivos). No enseña datos privados.

    {"status": "ok", "version": "dev", "uptime_s": 1234,
     "checks": {"database": "ok", "cloud": "ok", "groups": "ok",
                "disk_free_gb": 41.2, "mail": "configured", "chat_connections": 3}}
"""
import os
import shutil
import time

from flask import Blueprint, jsonify
from sqlalchemy import text

from app.models.db.db import db
from app.observability import START_TIME
from app.repositories import cloud_repo
from app.services import chat_hub, groups_service, mail_service


health_bp = Blueprint("health_bp", __name__)

LOW_DISK_GB = 1.0


def check_database():
    try:
        db.session.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
    finally:
        db.session.remove()


def check_folder(path):
    """La carpeta existe (o se puede crear) y se puede escribir en ella."""
    try:
        path.mkdir(parents=True, exist_ok=True)
        return os.access(path, os.W_OK)
    except OSError:
        return False


def free_disk_gb(path):
    try:
        return round(shutil.disk_usage(path).free / 1024 ** 3, 1)
    except OSError:
        return None


@health_bp.route("/salud")
def health():
    database = check_database()
    cloud = check_folder(cloud_repo.CLOUD_PATH)
    groups = check_folder(groups_service.GROUPS_PATH)
    disk = free_disk_gb(cloud_repo.CLOUD_PATH)

    healthy = database and cloud and groups
    if not healthy:
        status = "error"
    elif disk is not None and disk < LOW_DISK_GB:
        status = "degraded"              # funciona, pero queda poco disco
    else:
        status = "ok"

    body = {
        "status": status,
        "version": os.environ.get("APP_VERSION", "dev"),
        "uptime_s": int(time.time() - START_TIME),
        "checks": {
            "database": "ok" if database else "error",
            "cloud": "ok" if cloud else "error",
            "groups": "ok" if groups else "error",
            "disk_free_gb": disk,
            "mail": "configured" if mail_service.configured() else "off",
            "chat_connections": chat_hub.connection_count(),
        },
    }
    response = jsonify(body)
    response.status_code = 200 if healthy else 503
    response.headers["Cache-Control"] = "no-store"
    return response
