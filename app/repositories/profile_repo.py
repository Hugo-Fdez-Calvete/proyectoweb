from sqlalchemy import func

from app.models.db import db
from app.models.db.users_db import User


class ProfileRepository:
    """Acceso a datos del perfil de usuario."""

    def find_by_id(self, user_id):
        return db.session.get(User, user_id)

    # Comparaciones sin distinguir mayúsculas (evita "Admin" vs "admin")
    def _taken(self, column, value, exclude_id):
        query = User.query.filter(func.lower(column) == value.lower())
        if exclude_id is not None:
            query = query.filter(User.id != exclude_id)
        return db.session.query(query.exists()).scalar()

    def username_taken(self, username, exclude_id=None):
        return self._taken(User.username, username, exclude_id)

    def email_taken(self, email, exclude_id=None):
        return self._taken(User.email, email, exclude_id)

    def phone_taken(self, phone, exclude_id=None):
        return User.query.filter(
            User.phone == phone, User.id != exclude_id
        ).first() is not None

    def save_profile(self, user, username, email, phone):
        user.username = username
        user.email = email.strip() if email and email.strip() else None
        user.phone = phone.strip() if phone and phone.strip() else None
    
        db.session.commit()
        return user

    def set_password_hash(self, user, password_hash):
        user.password_hash = password_hash
        db.session.commit()
        return user
