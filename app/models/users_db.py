from sqlalchemy import Column, Integer,String,ForeignKey,DateTime
from datetime import datetime, timezone
from sqlalchemy.orm import relationship
from app.models.db import db

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    username = db.Column(
        db.String(50),
        unique=True,
        nullable=False
    )

    email = db.Column(
        db.String(120),
        unique=True,
        nullable=True
    )

    phone = db.Column(
        db.String(20),
        unique=True,
        nullable=True
    )

    password_hash = db.Column(
        db.String(255),
        nullable=False
    )

    last_login = db.Column(
        db.DateTime,
        nullable=True
    )

    storage_gb = db.Column(
        db.Integer,
        nullable=False,
        default=0
    )

    is_admin = db.Column(
        db.Boolean,
        nullable=False,
        default=False
    )

    status = db.Column(
        db.String(20),
        nullable=False,
        default="pending"
    )

    notes = db.Column(
        db.Text,
        nullable=True
    )

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )