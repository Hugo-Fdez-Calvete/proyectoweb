"""Mis archivos: subir, descargar, borrar, espacio y rutas no permitidas."""
import io


def upload(client, name, data, path=""):
    return client.post("/HomeCloud/upload", data={"path": path, "file": (io.BytesIO(data), name)},
                       content_type="multipart/form-data")


def test_subir_descargar_y_borrar(make_user, client_for, cloud_dir):
    uid = make_user("ana")
    ana = client_for(uid)
    upload(ana, "notas.txt", b"hola")
    assert (cloud_dir("ana") / "notas.txt").read_bytes() == b"hola"

    resp = ana.get("/HomeCloud/download/notas.txt")
    assert resp.status_code == 200 and resp.data == b"hola"

    ana.post("/HomeCloud/delete/notas.txt", data={"path": ""})
    assert not (cloud_dir("ana") / "notas.txt").exists()


def test_carpetas(make_user, client_for, cloud_dir):
    ana = client_for(make_user("ana"))
    ana.post("/HomeCloud/folder/create", data={"path": "", "folder_name": "Fotos"})
    upload(ana, "playa.jpg", b"x", path="Fotos")
    assert (cloud_dir("ana") / "Fotos" / "playa.jpg").exists()


def test_sin_espacio_no_sube(make_user, client_for, cloud_dir):
    ana = client_for(make_user("ana", storage_gb=0))
    resp = upload(ana, "notas.txt", b"hola")
    assert resp.status_code == 302
    assert not (cloud_dir("ana") / "notas.txt").exists()


def test_no_se_sale_de_su_carpeta(make_user, client_for, cloud_dir):
    make_user("luis")
    ana = client_for(make_user("ana"))
    luis_dir = cloud_dir("luis")
    luis_dir.mkdir(parents=True, exist_ok=True)
    (luis_dir / "secreto.txt").write_bytes(b"de luis")
    resp = ana.get("/HomeCloud/download/secreto.txt?path=../luis")
    assert resp.status_code == 302           # vuelve a Mis archivos, sin el archivo
    assert resp.data != b"de luis"


def test_renombrar_usuario_mueve_su_nube(make_user, client_for, cloud_dir):
    uid = make_user("ana")
    ana = client_for(uid)
    upload(ana, "notas.txt", b"hola")
    ana.post("/perfil/datos", data={"username": "ana_nueva", "phone": ""})
    assert (cloud_dir("ana_nueva") / "notas.txt").exists()
    assert not cloud_dir("ana").exists()
