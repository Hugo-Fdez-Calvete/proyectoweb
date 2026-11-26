"""Carpetas compartidas con usuarios y carpetas públicas."""
from app.models.db.db import db
import io
import re

from app.models.db.groups_db import FolderShare, PublicFolder


def setup_folder(client, name="Fotos"):
    client.post("/HomeCloud/folder/create", data={"path": "", "folder_name": name})
    client.post("/HomeCloud/upload", data={"path": name, "file": (io.BytesIO(b"contenido"), "lista.log")},
                content_type="multipart/form-data")


def test_compartir_solo_ver_y_editar(make_user, client_for, cloud_dir, query):
    ana = client_for(make_user("ana"))
    elena = client_for(make_user("elena"))
    setup_folder(ana)
    ana.post("/HomeCloud/compartir", data={"path": "Fotos", "username": "elena", "can_edit": "0"})
    share_id = query(lambda: FolderShare.query.first().id)

    assert elena.get(f"/HomeCloud/compartido/{share_id}").status_code == 200
    resp = elena.get(f"/HomeCloud/compartido/{share_id}/descargar/lista.log")
    assert resp.data == b"contenido"

    elena.post(f"/HomeCloud/compartido/{share_id}/subir",
               data={"path": "", "file": (io.BytesIO(b"a"), "nuevo.txt")}, content_type="multipart/form-data")
    assert not (cloud_dir("ana") / "Fotos" / "nuevo.txt").exists()

    ana.post(f"/HomeCloud/compartir/{share_id}/permiso", data={"can_edit": "1"})
    elena.post(f"/HomeCloud/compartido/{share_id}/subir",
               data={"path": "", "file": (io.BytesIO(b"a"), "nuevo.txt")}, content_type="multipart/form-data")
    assert (cloud_dir("ana") / "Fotos" / "nuevo.txt").exists()


def test_otro_usuario_no_abre_la_carpeta(make_user, client_for, query):
    ana = client_for(make_user("ana"))
    make_user("elena")
    luis = client_for(make_user("luis"))
    setup_folder(ana)
    ana.post("/HomeCloud/compartir", data={"path": "Fotos", "username": "elena"})
    share_id = query(lambda: FolderShare.query.first().id)
    assert luis.get(f"/HomeCloud/compartido/{share_id}").status_code == 302


def test_borrar_la_carpeta_quita_la_comparticion(make_user, client_for, query):
    ana = client_for(make_user("ana"))
    make_user("elena")
    setup_folder(ana)
    ana.post("/HomeCloud/compartir", data={"path": "Fotos", "username": "elena"})
    ana.post("/HomeCloud/delete/Fotos", data={"path": ""})
    assert query(lambda: FolderShare.query.count()) == 0


def test_carpeta_publica(make_user, client_for, anon, query):
    ana = client_for(make_user("ana"))
    setup_folder(ana, "Musica")
    ana.post("/HomeCloud/publicar", data={"path": "Musica", "listed": "1", "description": "Canciones libres"})
    public = query(lambda: PublicFolder.query.first())
    token, public_id = public.token, public.id

    assert "Musica" in anon.get("/publico").get_data(as_text=True)
    page = anon.get(f"/publico/{token}").get_data(as_text=True)
    assert "lista.log" in page
    assert "Subir archivo" not in page

    link = re.search(r'href="(/publico/[^"]+/descargar\?[^"]+)"', page).group(1).replace("&amp;", "&")
    assert anon.get(link).data == b"contenido"

    # No se sale de la carpeta pública
    assert anon.get(f"/publico/{token}?path=../../ana").status_code == 404

    # Al cambiar el enlace, el anterior deja de funcionar
    ana.post(f"/HomeCloud/publica/{public_id}/enlace")
    new_token = query(lambda: db.session.get(PublicFolder, public_id).token)
    assert new_token != token
    assert anon.get(f"/publico/{token}").status_code == 404
    assert anon.get(f"/publico/{new_token}").status_code == 200

    # Fuera del listado, pero el enlace sigue funcionando
    ana.post(f"/HomeCloud/publica/{public_id}/ajustes", data={"description": ""})
    assert "Musica" not in anon.get("/publico").get_data(as_text=True)
    assert anon.get(f"/publico/{new_token}").status_code == 200

    # Al dejar de publicarla: 404
    ana.post(f"/HomeCloud/publica/{public_id}/quitar")
    assert anon.get(f"/publico/{new_token}").status_code == 404


def test_solo_el_propietario_cambia_la_publica(make_user, client_for, query):
    ana = client_for(make_user("ana"))
    luis = client_for(make_user("luis"))
    setup_folder(ana)
    ana.post("/HomeCloud/publicar", data={"path": "Fotos", "listed": "1"})
    public_id = query(lambda: PublicFolder.query.first().id)
    luis.post(f"/HomeCloud/publica/{public_id}/quitar")
    assert query(lambda: PublicFolder.query.count()) == 1
