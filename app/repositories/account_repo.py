"""Datos que hay que borrar al eliminar una cuenta y que no son de grupos."""
from sqlalchemy import func

from app.models.db.db import db
from app.models.db.users_db import User
from app.models.db.google_link_db import GoogleLink
from app.models.db.pixel_db import PixelQuota


def get_user(user_id):
    return db.session.get(User, user_id)


def count_admins():
    return db.session.query(func.count(User.id)).filter(User.is_admin.is_(True)).scalar() or 0


def delete_google_links(user_id):
    """Vínculos de Pulso con Google (incluidos los tokens)."""
    GoogleLink.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    db.session.commit()


def delete_pixel_quota(user_id):
    """La «tinta» de Pixel Art del usuario (los píxeles pintados siguen en el lienzo común)."""
    PixelQuota.query.filter_by(key=f"u:{user_id}").delete(synchronize_session=False)
    db.session.commit()


def delete_user(user):
    db.session.delete(user)
    db.session.commit()
