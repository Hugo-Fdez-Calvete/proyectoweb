from datetime import datetime, timezone

from app.models.db.db import db


class Pixel(db.Model):
    """Estado actual del lienzo de Pixel Art: un registro por casilla pintada.
    Las casillas que no aparecen son blancas."""
    __tablename__ = "pixel_art"

    x = db.Column(db.Integer, primary_key=True, autoincrement=False)
    y = db.Column(db.Integer, primary_key=True, autoincrement=False)
    color = db.Column(db.Integer, nullable=False)          # 0xRRGGBB
    updated_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class PixelChange(db.Model):
    """Historial reciente de cambios: los navegadores piden «lo que ha cambiado
    desde el cambio N» para ver en directo lo que pintan los demás."""
    __tablename__ = "pixel_art_changes"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    x = db.Column(db.Integer, nullable=False)
    y = db.Column(db.Integer, nullable=False)
    color = db.Column(db.Integer, nullable=False)


class PixelQuota(db.Model):
    """«Tinta» de cada persona: píxeles disponibles, que se recargan con el tiempo.
    key: «u:<id>» para usuarios con sesión o «ip:<hash>» para visitantes
    (la IP no se guarda, solo un hash con la clave secreta de la app)."""
    __tablename__ = "pixel_art_quota"

    key = db.Column(db.String(80), primary_key=True)
    tokens = db.Column(db.Float, nullable=False)
    updated = db.Column(db.Float, nullable=False)            # time.time() del último cálculo
