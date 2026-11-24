from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.dialects.sqlite import insert

from app.models.db.pixel_db import Pixel, PixelChange, PixelQuota, db

KEEP_CHANGES = 20000          # cambios que se guardan para la sincronización en directo


def all_pixels():
    return db.session.query(Pixel.x, Pixel.y, Pixel.color).all()


def last_change_id():
    return db.session.query(func.max(PixelChange.id)).scalar() or 0


def first_change_id():
    return db.session.query(func.min(PixelChange.id)).scalar() or 0


def changes_since(since, limit):
    return (
        db.session.query(PixelChange.id, PixelChange.x, PixelChange.y, PixelChange.color)
        .filter(PixelChange.id > since)
        .order_by(PixelChange.id)
        .limit(limit)
        .all()
    )


def get_quota(key):
    q = db.session.get(PixelQuota, key)
    return (q.tokens, q.updated) if q else None


def save_quota(key, tokens, updated, commit=True):
    q = db.session.get(PixelQuota, key)
    if q is None:
        db.session.add(PixelQuota(key=key, tokens=tokens, updated=updated))
    else:
        q.tokens = tokens
        q.updated = updated
    if commit:
        db.session.commit()


def paint(pixels, quota=None):
    """pixels: lista de (x, y, color). Guarda el estado, el historial y (si hay límite)
    la tinta que queda, todo en una transacción."""
    if quota:
        save_quota(*quota, commit=False)
    now = datetime.now(timezone.utc)
    rows = [{"x": x, "y": y, "color": c, "updated_at": now} for x, y, c in pixels]
    stmt = insert(Pixel).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Pixel.x, Pixel.y],
        set_={"color": stmt.excluded.color, "updated_at": stmt.excluded.updated_at},
    )
    db.session.execute(stmt)
    db.session.add_all([PixelChange(x=x, y=y, color=c) for x, y, c in pixels])
    db.session.commit()
    last = last_change_id()
    # de vez en cuando se borra el historial antiguo (el estado no se toca)
    if last % 500 < len(pixels):
        db.session.query(PixelChange).filter(PixelChange.id <= last - KEEP_CHANGES).delete()
        db.session.commit()
    return last


def count_painted():
    return db.session.query(func.count()).select_from(Pixel).filter(Pixel.color != 0xFFFFFF).scalar() or 0
