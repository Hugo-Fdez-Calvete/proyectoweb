from datetime import datetime, timezone
from app.models.db.users_db import User,db


def get_user_by_username(username):
    return User.query.filter_by(username=username).first()


def get_user_by_email(email):
    return User.query.filter_by(email=email).first()


def get_user_by_phone(phone):
    return User.query.filter_by(phone=phone).first()

def get_user_by_id(user_id):
    return User.query.get(user_id)


def create_user(username, email, phone, password_hash):
    user = User(username=username, email=email, phone=phone, password_hash=password_hash, storage_gb=0, is_admin=False, status="pending")

    db.session.add(user)
    db.session.commit()

    return user


def update_last_login(user_id):
    user = db.session.get(User, user_id)

    if user:
        user.last_login = datetime.now(timezone.utc)
        db.session.commit()

    return user