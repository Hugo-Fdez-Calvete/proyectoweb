from flask import Flask, session
from flask_session import Session
from werkzeug.middleware.proxy_fix import ProxyFix
import json, random, os

from app.routes.primary_routes import home_bp, cv_bp
from app.routes.dashboard_routes import dashboard_bp
from app.routes.admin_routes import admin_bp
from app.routes.cloud_routes import cloud_bp
from app.routes.profile_routes import profile_bp
from app.routes.music_routes import pulso_bp

from app.models.db.users_db import User
from app.models.db.google_link_db import GoogleLink
from app.models.db.db import db

app = Flask(__name__)

# Configuración de Flask-Session
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "users.db")

# SQLite no crea carpetas: asegurar que exista (Git no sube carpetas vacías)
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


# Config de la app
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_FILE_DIR"] = "./.flask_session"
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DB_PATH}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.secret_key = os.environ.get("SECRET_KEY")

# Google (sección Pulso: iniciar sesión con Google y vincular YouTube / YouTube Music).
# Sin estas dos variables la página funciona, pero sin el vínculo con Google.
app.config["GOOGLE_CLIENT_ID"] = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
app.config["GOOGLE_CLIENT_SECRET"] = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
# Opcional: URL exacta de vuelta registrada en Google Cloud
# (p. ej. https://hugofernandezcalvete.es/pulso/google/callback)
app.config["GOOGLE_REDIRECT_URI"] = os.environ.get("GOOGLE_REDIRECT_URI", "").strip()

# La app va detrás de Nginx: así Flask sabe que la petición original era https
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)


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

# Crea la tabla de vínculos con Google si aún no existe (no toca las demás)
with app.app_context():
    GoogleLink.__table__.create(db.engine, checkfirst=True)


# Blueprints
app.register_blueprint(home_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(dashboard_bp, url_prefix="/HomeCloud")
app.register_blueprint(admin_bp, url_prefix="/HomeCloud")
app.register_blueprint(cloud_bp, url_prefix="/HomeCloud")
app.register_blueprint(cv_bp)
app.register_blueprint(pulso_bp)

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
