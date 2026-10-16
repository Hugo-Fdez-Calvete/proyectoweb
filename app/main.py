from flask import Flask, session
from flask_session import Session
import json, random, os

from app.routes.primary_routes import home_bp, cv_bp
from app.routes.dashboard_routes import dashboard_bp
from app.routes.admin_routes import admin_bp
from app.routes.cloud_routes import cloud_bp

from app.models.db.users_db import User
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
app.secret_key = "SECRETA"

Session(app)

db.init_app(app)


# Blueprints
app.register_blueprint(home_bp)
app.register_blueprint(dashboard_bp, url_prefix="/HomeCloud")
app.register_blueprint(admin_bp, url_prefix="/HomeCloud")
app.register_blueprint(cloud_bp, url_prefix="/HomeCloud")
app.register_blueprint(cv_bp)

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
