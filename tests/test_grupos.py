"""Grupos: espacio reservado, invitaciones, permisos, archivos y chat."""
from app.models.db.db import db
import io
import re

from app.models.db.groups_db import ChatMessage, Group, GroupInvite, GroupMember
from app.models.db.users_db import User
from app.services import groups_service


def create_group(client, name="Proyecto", gb="2"):
    resp = client.post("/HomeCloud/grupos/crear", data={"name": name, "storage_gb": gb})
    match = re.search(r"/HomeCloud/grupos/(\d+)", resp.headers.get("Location", ""))
    return int(match.group(1)) if match else None


def invite_and_accept(owner, member, query, group_id, username):
    owner.post(f"/HomeCloud/grupos/{group_id}/miembros/anadir", data={"username": username})
    invite_id = query(lambda: GroupInvite.query.filter_by(group_id=group_id).join(
        User, User.id == GroupInvite.user_id).filter(User.username == username).first().id)
    member.post(f"/HomeCloud/grupos/invitaciones/{invite_id}/aceptar")


def test_el_espacio_del_grupo_sale_del_creador(make_user, client_for, query):
    uid = make_user("ana", storage_gb=10)
    ana = client_for(uid)
    gid = create_group(ana, gb="2,5")
    assert gid is not None
    assert query(lambda: groups_service.personal_quota_gb(db.session.get(User, uid))) == 7.5


def test_no_reserva_mas_de_lo_libre(make_user, client_for, query):
    ana = client_for(make_user("ana", storage_gb=1))
    assert create_group(ana, gb="5") is None
    assert query(lambda: Group.query.count()) == 0


def test_invitacion_hay_que_aceptarla(make_user, client_for, query):
    ana = client_for(make_user("ana"))
    luis_id = make_user("luis")
    luis = client_for(luis_id)
    gid = create_group(ana)

    ana.post(f"/HomeCloud/grupos/{gid}/miembros/anadir", data={"username": "luis"})
    assert query(lambda: GroupMember.query.filter_by(group_id=gid, user_id=luis_id).first()) is None
    # Con la invitación pendiente aún no puede entrar
    resp = luis.get(f"/HomeCloud/grupos/{gid}/archivos")
    assert resp.status_code == 302

    invite_id = query(lambda: GroupInvite.query.filter_by(group_id=gid, user_id=luis_id).first().id)
    luis.post(f"/HomeCloud/grupos/invitaciones/{invite_id}/aceptar")
    assert query(lambda: GroupMember.query.filter_by(group_id=gid, user_id=luis_id).first()) is not None
    assert luis.get(f"/HomeCloud/grupos/{gid}/archivos").status_code == 200


def test_rechazar_invitacion(make_user, client_for, query):
    ana = client_for(make_user("ana"))
    luis_id = make_user("luis")
    gid = create_group(ana)
    ana.post(f"/HomeCloud/grupos/{gid}/miembros/anadir", data={"username": "luis"})
    invite_id = query(lambda: GroupInvite.query.first().id)
    client_for(luis_id).post(f"/HomeCloud/grupos/invitaciones/{invite_id}/rechazar")
    assert query(lambda: GroupInvite.query.count()) == 0
    assert query(lambda: GroupMember.query.filter_by(user_id=luis_id).count()) == 0


def test_permisos_de_los_miembros(make_user, client_for, query):
    ana = client_for(make_user("ana"))
    luis_id = make_user("luis")
    luis = client_for(luis_id)
    gid = create_group(ana)
    invite_and_accept(ana, luis, query, gid, "luis")
    root = groups_service.group_root(gid)

    # Por defecto puede subir pero no borrar
    luis.post(f"/HomeCloud/grupos/{gid}/archivos/subir",
              data={"path": "", "file": (io.BytesIO(b"hola"), "notas.txt")}, content_type="multipart/form-data")
    assert (root / "notas.txt").exists()
    luis.post(f"/HomeCloud/grupos/{gid}/archivos/borrar/notas.txt", data={"path": ""})
    assert (root / "notas.txt").exists()

    # La creadora le quita «subir» y le da «borrar»
    ana.post(f"/HomeCloud/grupos/{gid}/miembros/{luis_id}/permisos", data={"can_delete": "1", "can_chat": "1"})
    luis.post(f"/HomeCloud/grupos/{gid}/archivos/subir",
              data={"path": "", "file": (io.BytesIO(b"x"), "otro.txt")}, content_type="multipart/form-data")
    assert not (root / "otro.txt").exists()
    luis.post(f"/HomeCloud/grupos/{gid}/archivos/borrar/notas.txt", data={"path": ""})
    assert not (root / "notas.txt").exists()


def test_quien_no_es_miembro_no_entra(make_user, client_for):
    ana = client_for(make_user("ana"))
    elena = client_for(make_user("elena"))
    gid = create_group(ana)
    assert elena.get(f"/HomeCloud/grupos/{gid}/archivos").status_code == 302


def test_el_admin_entra_en_cualquier_grupo(make_user, client_for):
    ana = client_for(make_user("ana"))
    admin = client_for(make_user("admin", is_admin=True))
    gid = create_group(ana)
    assert admin.get(f"/HomeCloud/grupos/{gid}/archivos").status_code == 200


def test_chat_por_la_api(make_user, client_for, query):
    ana = client_for(make_user("ana"))
    luis = client_for(make_user("luis"))
    elena = client_for(make_user("elena"))
    gid = create_group(ana)
    invite_and_accept(ana, luis, query, gid, "luis")
    chat_id = query(lambda: groups_service.groups_repo.chats_of(gid)[0].id)

    resp = luis.post(f"/HomeCloud/grupos/api/chats/{chat_id}/mensajes", json={"body": "Hola <b>ana</b>"})
    assert resp.status_code == 200
    assert resp.get_json()["message"]["body"] == "Hola <b>ana</b>"

    assert elena.post(f"/HomeCloud/grupos/api/chats/{chat_id}/mensajes", json={"body": "intruso"}).status_code == 400
    assert luis.post(f"/HomeCloud/grupos/api/chats/{chat_id}/mensajes", json={"body": "x" * 2001}).status_code == 400

    history = ana.get(f"/HomeCloud/grupos/api/chats/{chat_id}/mensajes?after=0").get_json()["messages"]
    assert [m["body"] for m in history] == ["Hola <b>ana</b>"]


def test_borrar_grupo_devuelve_el_espacio(make_user, client_for, query):
    uid = make_user("ana", storage_gb=10)
    ana = client_for(uid)
    gid = create_group(ana, gb="4")
    root = groups_service.group_root(gid)
    assert root.exists()
    ana.post(f"/HomeCloud/grupos/{gid}/borrar")
    assert query(lambda: Group.query.count()) == 0
    assert query(lambda: ChatMessage.query.count()) == 0
    assert not root.exists()
    assert query(lambda: groups_service.personal_quota_gb(db.session.get(User, uid))) == 10
