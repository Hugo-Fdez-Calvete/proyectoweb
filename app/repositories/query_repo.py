from app.models.db import db
from datetime import datetime, timezone
from app.models.db.users_db import User

class UserRepository:
    def find_by_username(self, username):
        return User.query.filter_by(username=username).first()

    def find_by_email(self, email):
        return User.query.filter_by(email=email).first()

    def find_by_phone(self, phone):
        return User.query.filter_by(phone=phone).first()

    def find_by_id(self, user_id):
        return User.query.get(user_id)

    def create(self, username, email, phone, password_hash):
        user = User(
            username=username, 
            email=email, 
            phone=phone, 
            password_hash=password_hash, 
            storage_gb=0, 
            is_admin=False, 
            status="pending"
        )
        db.session.add(user)
        db.session.commit()
        return user

    def update_last_login(self, user):
        user.last_login = datetime.now(timezone.utc)
        db.session.commit()
        return user