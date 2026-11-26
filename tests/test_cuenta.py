"""Correo (vincular, confirmar, desvincular) y eliminar la cuenta."""
from app.models.db.db import db
import io
import re

from app.models.db.groups_db import ChatMessage, Group, NotifySettings
from app.models.db.users_db import User
from app.services import groups_service
PASSWORD = "clave1234"   # la misma que usa conftest.make_user


def test_cambiar_y_confirmar_correo(make_user, client_for, anon, mails, query):
    uid = make_user("ana")
    ana = client_for(uid)
    ana.post("/perfil/correo", data={"email": "ana@example.com"})
    assert query(lambda: db.session.get(User, uid).email) == "ana@example.com"
    assert mails and mails[-1]["to"] == "ana@example.com"

    link = re.search(r"https?://\S+/perfil/verificar/\S+", mails[-1]["text"]).group(0)
    anon.get(link[link.index("/perfil/"):])           # vale sin sesión
    assert query(lambda: db.session.get(NotifySettings, uid).verified_email) == "ana@example.com"


def test_correo_de_otra_cuenta(make_user, client_for, query):
    make_user("luis", email="luis@example.com")
    uid = make_user("ana")
    client_for(uid).post("/perfil/correo", data={"email": "luis@example.com"})
    assert query(lambda: db.session.get(User, uid).email) is None


def test_desvincular_correo(make_user, client_for, query):
    uid = make_user("ana", email="ana@example.com")
    client_for(uid).post("/perfil/correo/desvincular")
    assert query(lambda: db.session.get(User, uid).email) is None


def test_eliminar_cuenta_pide_contrasena_y_confirmacion(make_user, client_for, query):
    uid = make_user("ana")
    ana = client_for(uid)
    ana.post("/perfil/eliminar", data={"password": "mala", "confirm": "ELIMINAR"})
    ana.post("/perfil/eliminar", data={"password": PASSWORD, "confirm": "borrar"})
    assert query(lambda: db.session.get(User, uid)) is not None


def test_eliminar_cuenta_borra_sus_datos(make_user, client_for, cloud_dir, query):
    ana_id = make_user("ana")
    luis_id = make_user("luis")
    ana, luis = client_for(ana_id), client_for(luis_id)

    # Luis tiene archivos y un grupo propio, y escribe en el grupo de Ana
    luis.post("/HomeCloud/upload", data={"path": "", "file": (io.BytesIO(b"x"), "privado.txt")},
              content_type="multipart/form-data")
    resp = luis.post("/HomeCloud/grupos/crear", data={"name": "De luis", "storage_gb": "1"})
    luis_group = int(re.search(r"/grupos/(\d+)", resp.headers["Location"]).group(1))
    resp = ana.post("/HomeCloud/grupos/crear", data={"name": "De ana", "storage_gb": "1"})
    ana_group = int(re.search(r"/grupos/(\d+)", resp.headers["Location"]).group(1))
    ana.post(f"/HomeCloud/grupos/{ana_group}/miembros/anadir", data={"username": "luis"})
    from app.models.db.groups_db import GroupInvite
    invite_id = query(lambda: GroupInvite.query.first().id)
    luis.post(f"/HomeCloud/grupos/invitaciones/{invite_id}/aceptar")
    chat_id = query(lambda: groups_service.groups_repo.chats_of(ana_group)[0].id)
    message_id = luis.post(f"/HomeCloud/grupos/api/chats/{chat_id}/mensajes",
                           json={"body": "Me voy"}).get_json()["message"]["id"]

    resp = luis.post("/perfil/eliminar", data={"password": PASSWORD, "confirm": "eliminar"})
    assert resp.status_code == 302

    assert query(lambda: db.session.get(User, luis_id)) is None
    assert not cloud_dir("luis").exists()
    assert query(lambda: db.session.get(Group, luis_group)) is None
    assert not groups_service.group_root(luis_group).exists()
    # Su mensaje en el grupo de Ana queda como «Usuario eliminado»
    assert query(lambda: db.session.get(ChatMessage, message_id).user_id) is None
    # Y su sesión ya no sirve
    assert luis.get("/HomeCloud/dashboard").status_code == 302


def test_el_ultimo_admin_no_puede_borrarse(make_user, client_for, query):
    uid = make_user("hugo", is_admin=True)
    client_for(uid).post("/perfil/eliminar", data={"password": PASSWORD, "confirm": "ELIMINAR"})
    assert query(lambda: db.session.get(User, uid)) is not None
