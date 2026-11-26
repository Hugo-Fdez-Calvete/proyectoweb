"""Preparación común de los tests.

Cada test usa una base de datos vacía y carpetas temporales para la nube y
los grupos, así no toca nunca tus datos reales. Los correos no se envían:
se guardan en la lista que devuelve el fixture «mails».

Ejecutar:  pip install -r requirements-dev.txt  y  pytest
"""
import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Variables ANTES de importar la app (main.py las lee al cargarse)
_TMP = Path(tempfile.mkdtemp(prefix="hfc-tests-"))
os.environ["SECRET_KEY"] = "clave-solo-para-tests"
os.environ["DATABASE_PATH"] = str(_TMP / "tests.db")
os.environ["SESSION_FILE_DIR"] = str(_TMP / "sesiones")
os.environ["COOKIE_SECURE"] = "0"          # el cliente de pruebas usa http
for _var in ("MAIL_USERNAME", "MAIL_PASSWORD", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"):
    os.environ.pop(_var, None)

from app.main import app as flask_app                      # noqa: E402
from app.models.db.db import db                            # noqa: E402
from app.models.db.users_db import User                    # noqa: E402
from app.repositories import cloud_repo                    # noqa: E402
from app.services import groups_service, mail_service      # noqa: E402
from app.services.hash_service import hash_password        # noqa: E402

PASSWORD = "clave1234"


@pytest.fixture
def mails(monkeypatch):
    """Correos «enviados» durante el test: [{"to", "subject", "text"}]."""
    sent = []

    def fake_send(to, subject, text, html=None):
        sent.append({"to": to, "subject": subject, "text": text})
        return True

    monkeypatch.setattr(mail_service, "configured", lambda: True)
    monkeypatch.setattr(mail_service, "send", fake_send)
    return sent


@pytest.fixture
def app(tmp_path, monkeypatch, mails):
    flask_app.config.update(TESTING=True, WTF_CSRF_ENABLED=False)
    monkeypatch.setattr(cloud_repo, "CLOUD_PATH", tmp_path / "cloud")
    monkeypatch.setattr(groups_service, "GROUPS_PATH", tmp_path / "cloud_groups")
    with flask_app.app_context():
        db.drop_all()
        db.create_all()
    yield flask_app
    with flask_app.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture
def make_user(app):
    """Crea un usuario activo y devuelve su id."""
    def _make(username, storage_gb=10, is_admin=False, email=None, status="active"):
        with app.app_context():
            user = User(username=username, email=email, password_hash=hash_password(PASSWORD),
                        storage_gb=storage_gb, is_admin=is_admin, status=status)
            db.session.add(user)
            db.session.commit()
            return user.id
    return _make


@pytest.fixture
def client_for(app):
    """Cliente de pruebas con la sesión iniciada como ese usuario."""
    def _client(user_id):
        client = app.test_client()
        with app.app_context():
            user = db.session.get(User, user_id)
            username, is_admin = user.username, user.is_admin
        with client.session_transaction() as session:
            session["user_id"] = user_id
            session["username"] = username
            session["is_admin"] = is_admin
        return client
    return _client


@pytest.fixture
def anon(app):
    """Cliente sin sesión."""
    return app.test_client()


@pytest.fixture
def cloud_dir():
    """Carpeta de la nube de un usuario (en la carpeta temporal del test)."""
    return lambda username: cloud_repo.CLOUD_PATH / username


@pytest.fixture
def query(app):
    """Ejecuta una función dentro del contexto de la app (para mirar la base de datos)."""
    def _query(fn):
        with app.app_context():
            return fn()
    return _query
