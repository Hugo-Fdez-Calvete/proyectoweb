from sqlalchemy import func, or_

from app.models.db import db
from app.models.users_db import User


class AdminRepository:
    # ---------- Estadísticas ----------
    def count_users(self, status=None):
        query = db.session.query(func.count(User.id))
        if status:
            query = query.filter(User.status == status)
        return query.scalar() or 0

    def count_admins(self):
        return db.session.query(func.count(User.id)).filter(User.is_admin.is_(True)).scalar() or 0

    def total_storage_gb(self):
        return db.session.query(func.coalesce(func.sum(User.storage_gb), 0)).scalar() or 0

    # ---------- Consultas ----------
    def find_by_id(self, user_id):
        return db.session.get(User, user_id)

    def latest_users(self, limit=5):
        return User.query.order_by(User.id.desc()).limit(limit).all()

    def list_by_status(self, status, limit=None):
        query = User.query.filter_by(status=status).order_by(User.id.desc())
        if limit:
            query = query.limit(limit)
        return query.all()

    def search_users(self, search=None, status=None, page=1, per_page=10):
        query = User.query
        if status:
            query = query.filter(User.status == status)
        if search:
            like = f"%{search}%"
            query = query.filter(
                or_(
                    User.username.ilike(like),
                    User.email.ilike(like),
                    User.phone.ilike(like),
                )
            )
        return query.order_by(User.id.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )

    # ---------- Modificaciones ----------
    def set_status(self, user, status):
        user.status = status
        db.session.commit()
        return user

    def set_admin(self, user, is_admin):
        user.is_admin = is_admin
        db.session.commit()
        return user

    def set_storage(self, user, storage_gb):
        user.storage_gb = storage_gb
        db.session.commit()
        return user

    def delete(self, user):
        db.session.delete(user)
        db.session.commit()
