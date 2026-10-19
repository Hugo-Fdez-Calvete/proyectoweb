from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SelectField, SubmitField
from wtforms.validators import DataRequired, Length, EqualTo, Optional, Regexp

USERNAME_RE = r"^[A-Za-z0-9_.-]+$"
PHONE_RE = r"^\+?[0-9]{9,15}$"
EMAIL_RE = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
MIN_PASSWORD = 8

REQUIRED = "El campo no puede estar vacío."


class LoginForm(FlaskForm):
    login_method = SelectField(
        "Acceder con",
        choices=[("username", "Usuario"), ("email", "Correo"), ("phone", "Teléfono")],
        default="username"
    )
    identifier = StringField(
        "Identificador",
        validators=[DataRequired(message=REQUIRED), Length(max=120)]
    )
    password = PasswordField(
        "Contraseña",
        validators=[DataRequired(message=REQUIRED)]
    )
    enviar = SubmitField("Login")


class RegisterForm(FlaskForm):
    username = StringField(
        "Nuevo usuario",
        validators=[
            DataRequired(message=REQUIRED),
            Length(min=3, max=30, message="El usuario debe tener entre 3 y 30 caracteres."),
            Regexp(USERNAME_RE, message="Solo letras, números, punto, guion y guion bajo.")
        ]
    )
    email = StringField(
        "Correo (opcional)",
        validators=[Optional(), Regexp(EMAIL_RE, message="El correo electrónico no es válido.")]
    )
    phone = StringField(
        "Teléfono (opcional)",
        validators=[Optional(), Regexp(PHONE_RE, message="Entre 9 y 15 dígitos (puede empezar por +).")]
    )
    password = PasswordField(
        "Contraseña",
        validators=[
            DataRequired(message=REQUIRED),
            Length(min=MIN_PASSWORD, max=128,
                   message=f"La contraseña debe tener al menos {MIN_PASSWORD} caracteres.")
        ]
    )
    password_confirm = PasswordField(
        "Repite la contraseña",
        validators=[
            DataRequired(message=REQUIRED),
            EqualTo("password", message="Las contraseñas no coinciden.")
        ]
    )
    enviar = SubmitField("Crear usuario")


class ProfileForm(FlaskForm):
    username = StringField(
        "Nombre de usuario",
        validators=[
            DataRequired(message=REQUIRED),
            Length(min=3, max=30, message="El usuario debe tener entre 3 y 30 caracteres."),
            Regexp(USERNAME_RE, message="Solo letras, números, punto, guion y guion bajo.")
        ]
    )
    email = StringField(
        "Correo electrónico",
        validators=[Optional(), Regexp(EMAIL_RE, message="El correo electrónico no es válido.")]
    )
    phone = StringField(
        "Teléfono",
        validators=[Optional(), Regexp(PHONE_RE, message="Entre 9 y 15 dígitos (puede empezar por +).")]
    )
    guardar = SubmitField("Guardar datos")


class PasswordForm(FlaskForm):
    current_password = PasswordField("Contraseña actual", validators=[DataRequired(message=REQUIRED)])
    new_password = PasswordField(
        "Nueva contraseña",
        validators=[
            DataRequired(message=REQUIRED),
            Length(min=MIN_PASSWORD, max=128,
                   message=f"La nueva contraseña debe tener al menos {MIN_PASSWORD} caracteres.")
        ]
    )
    confirm_password = PasswordField(
        "Repite la nueva contraseña",
        validators=[
            DataRequired(message=REQUIRED),
            EqualTo("new_password", message="Las contraseñas nuevas no coinciden.")
        ]
    )
    cambiar = SubmitField("Cambiar contraseña")