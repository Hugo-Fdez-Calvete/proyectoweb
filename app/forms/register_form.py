from flask_wtf import FlaskForm
from wtforms import StringField, SubmitField 
from wtforms.validators import DataRequired, Length

class RegisterForm(FlaskForm):
    nombre = StringField(
        "Nuevo Usuario ",
        validators=[
            DataRequired(message="El campo no puede estar vacio."),
            Length(min=3, max=30, message="El nombre del usuario debe de ser mayor a 3 ")
        ]
    )
    password = StringField(
        "Contraseña ",
        validators=[
            DataRequired(message="El campo no puede estar vacio."),
            Length(min=3, max=30, message="La contraseña debe ser entre 3 y 30 caracteres ")
        ]
    )

    enviar = SubmitField("Crear Usuario")