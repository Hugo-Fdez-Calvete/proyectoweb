from flask import Flask, session, request, jsonify, flash, redirect, url_for
from flask_wtf.csrf import CSRFProtect, CSRFError
from flask_session import Session
from werkzeug.middleware.proxy_fix import ProxyFix
import json, random, os

from app.routes.primary_routes import home_bp, cv_bp
from app.routes.dashboard_routes import dashboard_bp
from app.routes.admin_routes import admin_bp
from app.routes.cloud_routes import cloud_bp
from app.routes.profile_routes import profile_bp
from app.routes.music_routes import pulso_bp
from app.routes.pixel_routes import pixel_bp
from app.routes.groups_routes import groups_bp, ws_bp
from app.routes.shares_routes import shares_bp
from app.routes.public_routes import public_bp
from app.routes.health_routes import health_bp
from app import observability

from app.models.db.users_db import User
from app.models.db.google_link_db import GoogleLink
from app.models.db.pixel_db import Pixel, PixelChange, PixelQuota
from app.models.db.groups_db import ALL_TABLES as GROUP_TABLES
from app.models.db.db import db

app = Flask(__name__)

# Rutas de datos. Todo va dentro de app/data (volumen flask_data), así la base
# de datos y las sesiones sobreviven a un «Pull and redeploy».
# Se pueden cambiar con variables de entorno (los tests las usan).
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.environ.get("DATABASE_PATH") or os.path.join(DATA_DIR, "users.db")
# Sesiones fuera del contenedor (antes estaban en ./.flask_session y se perdían al redesplegar)
SESSION_DIR = os.environ.get("SESSION_FILE_DIR") or os.path.join(DATA_DIR, "sessions")

# SQLite no crea carpetas: asegurar que existan (Git no sube carpetas vacías)
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(SESSION_DIR, exist_ok=True)

# Logs con identificador de petición (ver app/observability.py)
observability.init_app(app)


# Config de la app
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_FILE_DIR"] = SESSION_DIR
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DB_PATH}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.secret_key = "SECRET_KEY"

# Cookie de sesión: solo por HTTPS, invisible para JavaScript y sin viajar en
# peticiones que vengan de otras webs. Para probar en local por http (no
# localhost) se puede desactivar con COOKIE_SECURE=0.
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("COOKIE_SECURE", "1") != "0"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

# Protección CSRF en todos los formularios y peticiones que cambian algo
# (POST, PUT, PATCH, DELETE). El token vale mientras dure la sesión.
app.config["WTF_CSRF_TIME_LIMIT"] = None
csrf = CSRFProtect(app)

# Google (sección Pulso: iniciar sesión con Google y vincular YouTube / YouTube Music).
# Sin estas dos variables la página funciona, pero sin el vínculo con Google.
app.config["GOOGLE_CLIENT_ID"] = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
app.config["GOOGLE_CLIENT_SECRET"] = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
# Opcional: URL exacta de vuelta registrada en Google Cloud
# (p. ej. https://hugofernandezcalvete.es/pulso/google/callback)
app.config["GOOGLE_REDIRECT_URI"] = os.environ.get("GOOGLE_REDIRECT_URI", "").strip()

# La app va detrás de Nginx: así Flask sabe que la petición original era https
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)


# Las páginas solo se pueden abrir en un marco desde esta misma web
# (Pulso las abre encima para que la música no se corte) y nunca desde otra
# (protección contra clickjacking).
@app.after_request
def _frame_policy(resp):
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    return resp


# Cabeceras básicas de seguridad (Nginx puede añadir más; ver README)
@app.after_request
def _security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return resp


@app.errorhandler(CSRFError)
def _csrf_error(e):
    msg = "La página llevaba demasiado tiempo abierta o la petición no venía de esta web. Vuelve a intentarlo."
    wants_json = (request.path.startswith("/pulso/api") or request.path.startswith("/pulso/google")
                  or request.path.startswith("/pixel-art/api")
                  or request.accept_mimetypes.best == "application/json"
                  or request.headers.get("X-Requested-With"))
    if wants_json:
        return jsonify(error=msg), 400
    flash(msg, "danger")
    return redirect(request.referrer or url_for("home_bp.index"))


# Los CSS y JS llevan ?v=<fecha de modificación>: así el navegador descarga
# la versión nueva en cuanto cambia el archivo, sin tener que borrar la caché.
@app.url_defaults
def _static_version(endpoint, values):
    if endpoint == "static" and "filename" in values and "v" not in values:
        try:
            values["v"] = int(os.path.getmtime(os.path.join(app.static_folder, values["filename"])))
        except OSError:
            pass

if not app.secret_key:
    raise RuntimeError("Falta configurar SECRET_KEY")

Session(app)

db.init_app(app)

# Crea las tablas que aún no existan (no toca las demás). Con una base de
# datos vacía (instalación nueva o tests) también crea la de usuarios.
with app.app_context():
    User.__table__.create(db.engine, checkfirst=True)
    GoogleLink.__table__.create(db.engine, checkfirst=True)
    Pixel.__table__.create(db.engine, checkfirst=True)
    PixelChange.__table__.create(db.engine, checkfirst=True)
    PixelQuota.__table__.create(db.engine, checkfirst=True)
    # Grupos, chats, carpetas compartidas y avisos por correo
    for table in GROUP_TABLES:
        table.__table__.create(db.engine, checkfirst=True)
    # Gunicorn crea los procesos después de esto: que no hereden conexiones abiertas
    db.engine.dispose()


# Blueprints
app.register_blueprint(home_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(dashboard_bp, url_prefix="/HomeCloud")
app.register_blueprint(admin_bp, url_prefix="/HomeCloud")
app.register_blueprint(cloud_bp, url_prefix="/HomeCloud")
app.register_blueprint(cv_bp)
app.register_blueprint(pulso_bp)
app.register_blueprint(pixel_bp)
app.register_blueprint(groups_bp)
app.register_blueprint(shares_bp)
app.register_blueprint(public_bp)
app.register_blueprint(ws_bp)
app.register_blueprint(health_bp)

# Comando para crear la db
@app.cli.command("crear-tablas")
def crear_tablas():
    print("Creando tablas de base de datos")
    db.create_all()
    print("Base de datos creada correctamente")


# Abierto a toda la red local / al exterior del contenedor.
# El modo debug solo se activa si defines FLASK_DEBUG=1 (no usar en producción).
if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
