from datetime import datetime, timezone

from app.models.db.db import db


class GoogleLink(db.Model):
    """Cuenta de Google/YouTube vinculada desde la sección Pulso.

    - id: hash SHA-256 del valor de la cookie del navegador (la cookie real no se guarda).
    - user_id: si el visitante tenía sesión iniciada en la web, la cuenta de Google
      queda unida a su usuario y le sigue en cualquier dispositivo.
    """
    __tablename__ = "google_links"

    id = db.Column(db.String(64), primary_key=True)

    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)

    google_sub = db.Column(db.String(64), nullable=False, index=True)
    email = db.Column(db.String(255), nullable=True)
    name = db.Column(db.String(255), nullable=True)
    picture = db.Column(db.String(512), nullable=True)

    refresh_token = db.Column(db.Text, nullable=True)
    access_token = db.Column(db.Text, nullable=True)
    expires_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    last_used = db.Column(db.DateTime, nullable=True)
