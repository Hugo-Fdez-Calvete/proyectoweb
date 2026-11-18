from datetime import datetime, timezone

from app.models.db.google_link_db import GoogleLink, db


def get_link(link_id):
    return GoogleLink.query.get(link_id) if link_id else None


def get_latest_for_user(user_id):
    return (
        GoogleLink.query.filter_by(user_id=user_id)
        .filter(GoogleLink.refresh_token.isnot(None))
        .order_by(GoogleLink.last_used.desc())
        .first()
    )


def get_refresh_token_for_sub(google_sub):
    """Google solo envía el refresh_token la primera vez: se reutiliza el de otro dispositivo."""
    link = (
        GoogleLink.query.filter_by(google_sub=google_sub)
        .filter(GoogleLink.refresh_token.isnot(None))
        .first()
    )
    return link.refresh_token if link else None


def save_link(link_id, **fields):
    link = GoogleLink.query.get(link_id)
    if not link:
        link = GoogleLink(id=link_id)
        db.session.add(link)
    for key, value in fields.items():
        setattr(link, key, value)
    link.last_used = datetime.now(timezone.utc)
    db.session.commit()
    return link


def update_tokens(link, access_token, expires_at):
    link.access_token = access_token
    link.expires_at = expires_at
    link.last_used = datetime.now(timezone.utc)
    db.session.commit()


def attach_user(link, user_id):
    if link.user_id != user_id:
        link.user_id = user_id
        db.session.commit()


def delete_link(link):
    """Borra este vínculo y los demás de la misma cuenta de Google (se revoca el permiso)."""
    GoogleLink.query.filter_by(google_sub=link.google_sub).delete()
    db.session.commit()
