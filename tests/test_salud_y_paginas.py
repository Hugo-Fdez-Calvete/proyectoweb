"""Ruta /salud, páginas públicas, páginas protegidas y cabeceras de seguridad."""
import pytest

from app.routes import health_routes


def test_salud_ok(anon):
    resp = anon.get("/salud")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] in ("ok", "degraded")
    assert data["checks"]["database"] == "ok"
    assert data["checks"]["cloud"] == "ok"
    assert data["checks"]["groups"] == "ok"
    assert resp.headers["Cache-Control"] == "no-store"


def test_salud_falla_si_no_hay_base_de_datos(anon, monkeypatch):
    monkeypatch.setattr(health_routes, "check_database", lambda: False)
    resp = anon.get("/salud")
    assert resp.status_code == 503
    assert resp.get_json()["status"] == "error"


def test_identificador_de_peticion(anon):
    resp = anon.get("/salud")
    assert len(resp.headers["X-Request-ID"]) >= 8
    # Si llega uno válido (p. ej. desde Nginx), se respeta
    resp = anon.get("/salud", headers={"X-Request-ID": "prueba-1234abcd"})
    assert resp.headers["X-Request-ID"] == "prueba-1234abcd"
    # Si no es válido, se genera otro
    resp = anon.get("/salud", headers={"X-Request-ID": "<script>"})
    assert resp.headers["X-Request-ID"] != "<script>"


@pytest.mark.parametrize("url", [
    "/", "/info", "/proyectos", "/publico", "/pixel-art/",
    "/cookies", "/aviso-legal", "/privacidad", "/login", "/register",
])
def test_paginas_publicas(anon, url):
    assert anon.get(url).status_code == 200


@pytest.mark.parametrize("url", [
    "/HomeCloud/dashboard", "/HomeCloud/grupos/", "/HomeCloud/compartido", "/perfil",
])
def test_paginas_privadas_piden_sesion(anon, url):
    resp = anon.get(url)
    assert resp.status_code == 302


def test_cabeceras_de_seguridad(anon):
    resp = anon.get("/")
    assert resp.headers["X-Frame-Options"] == "SAMEORIGIN"
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert "Referrer-Policy" in resp.headers


def test_lienzo_pixel_art(anon):
    resp = anon.get("/pixel-art/api/board")
    assert resp.status_code == 200
    assert resp.is_json
