from flask import Flask, session
from flask_session import Session 
import json, random, os

from app.routes.primary_routes import root_bp, home_bp
from app.routes.dashboard_routes import dashboard_bp
from app.routes.admin_routes import admin_bp
from app.routes.cloud_routes import cloud_bp
from app.models.users_db import User
from app.models.db import db

app = Flask(__name__)

# Configuración de Flask-Session
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__)))
DB_PATH = os.path.join(BASE_DIR, "database", "users.db")

app.config["SESSION_TYPE"] = "filesystem"   
app.config["SESSION_PERMANENT"] = False    
app.config["SESSION_FILE_DIR"] = "./.flask_session"
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DB_PATH}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False 
app.secret_key= "SECRETA"

Session(app)

db.init_app(app)
app.register_blueprint(root_bp, url_prefix="/")
app.register_blueprint(home_bp, url_prefix="/HomeCloud")
app.register_blueprint(dashboard_bp, url_prefix="/HomeCloud")
app.register_blueprint(admin_bp, url_prefix="/HomeCloud")
app.register_blueprint(cloud_bp, url_prefix="/HomeCloud")

@app.cli.command("crear-tablas")
def crear_tablas():
    print("Creando tablas de base de datos")
    db.create_all()
    print("Base de datos creada correctamente")

# if __name__ == "__main__":
#     app.run(host="0.0.0.0", port=5000, debug=True)

if __name__ == "__main__":
    app.run(debug=True)