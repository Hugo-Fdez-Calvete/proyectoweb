"""Vínculo Google ↔ visitante y acceso a su YouTube / YouTube Music.

Flujo:
  1. /pulso/google/login  -> Google pide permiso (solo lectura de YouTube).
  2. /pulso/google/callback -> se cambia el código por tokens; el refresh_token se
     guarda en la base de datos y el navegador recibe una cookie aleatoria.
  3. En cada visita la cookie (o el usuario con sesión iniciada en la web) encuentra
     el vínculo y el servidor renueva el token solo: el YouTube queda enlazado
     automáticamente, sin volver a iniciar sesión.
"""
import hashlib
import re
import secrets
import time
from datetime import datetime, timedelta, timezone

from flask import current_app, request, session

from app.clients import google_api
from app.clients.google_api import GoogleApiError
from app.repositories import google_repo

COOKIE = "pulso_google"
COOKIE_DAYS = 180
MUSIC_CATEGORY = "10"

_cache = {}           # (link_id, clave) -> (caduca, datos)
CACHE_SECONDS = {"playlists": 300, "me": 3600}


class NotLinked(Exception):
    pass


# ------------------------------------------------------------------ utilidades
def _now():
    # naive UTC: SQLite no guarda zona horaria
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


def is_configured():
    cfg = current_app.config
    return bool(cfg.get("GOOGLE_CLIENT_ID") and cfg.get("GOOGLE_CLIENT_SECRET"))


def redirect_uri():
    """URL de vuelta de Google. Tiene que ser https (salvo en localhost).

    Detrás de Nginx Flask puede creer que la petición era http, así que fuera de
    localhost se fuerza https. Lo más seguro es fijarla con GOOGLE_REDIRECT_URI.
    """
    from flask import url_for
    fixed = current_app.config.get("GOOGLE_REDIRECT_URI")
    if fixed:
        return fixed
    host = request.host.split(":")[0]
    scheme = "http" if host in ("localhost", "127.0.0.1") else "https"
    return url_for("pulso_bp.google_callback", _external=True, _scheme=scheme)


def _cached(link, key, builder):
    k = (link.id, key)
    hit = _cache.get(k)
    if hit and hit[0] > time.time():
        return hit[1]
    data = builder()
    _cache[k] = (time.time() + CACHE_SECONDS.get(key.split(":")[0], 300), data)
    return data


def _forget_cache(link_id):
    for k in [k for k in _cache if k[0] == link_id]:
        _cache.pop(k, None)


# ------------------------------------------------------------------ OAuth
def start_login(force_consent=False, popup=False):
    state = secrets.token_urlsafe(24)
    session["pulso_oauth_state"] = state
    session["pulso_oauth_popup"] = bool(popup)
    return google_api.auth_url(
        current_app.config["GOOGLE_CLIENT_ID"], redirect_uri(), state, force_consent
    )


def finish_login(args):
    """Devuelve (cookie_value | None, necesita_consentimiento, error)."""
    expected = session.pop("pulso_oauth_state", None)
    if args.get("error"):
        return None, False, args.get("error")
    if not expected or args.get("state") != expected:
        return None, False, "state"

    cfg = current_app.config
    tokens = google_api.exchange_code(
        cfg["GOOGLE_CLIENT_ID"], cfg["GOOGLE_CLIENT_SECRET"], redirect_uri(), args.get("code", "")
    )
    granted = tokens.get("scope", "")
    if "youtube.readonly" not in granted:
        return None, False, "scope"

    info = google_api.userinfo(tokens["access_token"])
    sub = info.get("sub")
    refresh = tokens.get("refresh_token") or google_repo.get_refresh_token_for_sub(sub)
    if not refresh:
        # Google no ha mandado refresh_token (ya dio permiso antes): hay que pedirlo otra vez
        return None, True, None

    cookie_value = secrets.token_urlsafe(32)
    link = google_repo.save_link(
        _hash(cookie_value),
        user_id=session.get("user_id"),
        google_sub=sub,
        email=info.get("email"),
        name=info.get("name") or info.get("email"),
        picture=info.get("picture"),
        refresh_token=refresh,
        access_token=tokens["access_token"],
        expires_at=_now() + timedelta(seconds=int(tokens.get("expires_in", 3600)) - 60),
    )
    _forget_cache(link.id)
    return cookie_value, False, None


def set_cookie(response, value):
    response.set_cookie(
        COOKIE, value, max_age=COOKIE_DAYS * 86400, httponly=True,
        secure=request.is_secure, samesite="Lax", path="/",
    )


def current_link():
    """Cuenta de Google del usuario con sesión iniciada en la web.

    Pulso exige iniciar sesión, así que el vínculo pertenece siempre a un usuario:
    la cookie solo sirve si es de ese mismo usuario (o de antes de tener dueño).
    """
    user_id = session.get("user_id")
    if not user_id:
        return None
    cookie = request.cookies.get(COOKIE)
    link = google_repo.get_link(_hash(cookie)) if cookie else None
    if link and link.user_id not in (None, user_id):
        link = None                       # cookie de otro usuario en este navegador
    if link:
        google_repo.attach_user(link, user_id)
    else:
        link = google_repo.get_latest_for_user(user_id)
    return link


def require_link():
    if not is_configured():
        raise NotLinked("noconfig")
    link = current_link()
    if not link or not link.refresh_token:
        raise NotLinked("nolink")
    return link


def logout(response):
    link = current_link()
    if link:
        google_api.revoke(link.refresh_token or link.access_token or "")
        _forget_cache(link.id)
        google_repo.delete_link(link)
    response.delete_cookie(COOKIE, path="/")


def _token(link, force=False):
    if not force and link.access_token and link.expires_at and link.expires_at > _now():
        return link.access_token
    cfg = current_app.config
    try:
        t = google_api.refresh_access_token(cfg["GOOGLE_CLIENT_ID"], cfg["GOOGLE_CLIENT_SECRET"], link.refresh_token)
    except GoogleApiError as e:
        if e.reason in ("invalid_grant", "unauthorized_client") or e.status in (400, 401):
            # el usuario quitó el permiso desde su cuenta de Google
            google_repo.delete_link(link)
            raise NotLinked("revoked")
        raise
    google_repo.update_tokens(link, t["access_token"], _now() + timedelta(seconds=int(t.get("expires_in", 3600)) - 60))
    return link.access_token


def _yt(link, path, **params):
    try:
        return google_api.yt_get(path, _token(link), **params)
    except GoogleApiError as e:
        if e.status == 401:
            return google_api.yt_get(path, _token(link, force=True), **params)
        raise


def _pages(link, path, max_pages=2, **params):
    items, token = [], None
    for _ in range(max_pages):
        if token:
            params["pageToken"] = token
        data = _yt(link, path, **params)
        items.extend(data.get("items", []))
        token = data.get("nextPageToken")
        if not token:
            break
    return items


# ------------------------------------------------------------------ formato
def _thumb(th):
    th = th or {}
    for k in ("medium", "high", "default"):
        if th.get(k, {}).get("url"):
            return th[k]["url"]
    return ""


def _artist(name):
    name = name or ""
    return name[:-8] if name.endswith(" - Topic") else name


def _video(item, video_id):
    sn = item.get("snippet", {})
    owner = sn.get("videoOwnerChannelTitle") or sn.get("channelTitle") or ""
    return {
        "topic": owner.endswith(" - Topic"),   # versión «canción» de YouTube Music (portada fija)
        "type": "yt",
        "id": video_id,
        "title": sn.get("title", "Vídeo"),
        "sub": _artist(sn.get("videoOwnerChannelTitle") or sn.get("channelTitle") or "YouTube"),
        "channelId": sn.get("videoOwnerChannelId") or sn.get("channelId"),
        "thumb": _thumb(sn.get("thumbnails")),
        "music": sn.get("categoryId") == MUSIC_CATEGORY,
        "published": sn.get("publishedAt", ""),
    }


def _playable(v):
    return bool(v["id"]) and v["title"] not in ("Deleted video", "Private video")


# ------------------------------------------------------------------ datos
def me(link):
    def build():
        channel = None
        try:
            items = _yt(link, "channels", part="snippet", mine="true").get("items", [])
            if items:
                channel = items[0]["snippet"]["title"]
        except GoogleApiError:
            pass
        return {"name": link.name or link.email, "email": link.email, "picture": link.picture, "channel": channel}
    return _cached(link, "me", build)


def playlists(link):
    def build():
        items = _pages(link, "playlists", part="snippet,contentDetails", mine="true", maxResults=50)
        return [{
            "type": "pl",
            "id": i["id"],
            "title": i["snippet"].get("title", "Lista"),
            "sub": f'{i.get("contentDetails", {}).get("itemCount", "?")} canciones',
            "thumb": _thumb(i["snippet"].get("thumbnails")),
        } for i in items]
    return _cached(link, "playlists", build)


def playlist_items(link, playlist_id):
    def build():
        items = _pages(link, "playlistItems", part="snippet", playlistId=playlist_id, maxResults=50)
        out = []
        for i in items:
            vid = i.get("snippet", {}).get("resourceId", {}).get("videoId")
            v = _video(i, vid)
            if _playable(v):
                out.append(v)
        return out
    return _cached(link, f"pl:{playlist_id}", build)


def search(link, q):
    data = _yt(link, "search", part="snippet", type="video", videoEmbeddable="true",
               videoCategoryId=MUSIC_CATEGORY, maxResults=20, q=q[:120])
    return [v for v in (_video(i, i.get("id", {}).get("videoId")) for i in data.get("items", [])) if _playable(v)]


# ------------------------------------------------------------------ canción ↔ vídeo
# Igual que el interruptor «Canción / Vídeo» de YouTube Music: la misma canción existe
# como pista oficial de audio (canal «Artista - Topic», portada fija) y como videoclip.
_versions = {}
_NOISE = re.compile(
    r"[\(\[][^\)\]]*(official|oficial|video|vídeo|videoclip|clip|lyric|letra|audio|visuali[sz]er|mv|hd|4k)[^\)\]]*[\)\]]",
    re.I,
)


def _clean_title(title):
    title = _NOISE.sub("", title or "")
    return re.sub(r"\s+", " ", title).strip(" -|·")


def _norm(text):
    return re.sub(r"[^a-z0-9áéíóúüñ]", "", (text or "").lower())


def alt_version(link, video_id, want, title, artist):
    """Busca la otra versión de una canción. want = 'song' (audio oficial) o 'video' (videoclip).

    Cuesta 100 unidades de cuota por canción nueva; el resultado se guarda en memoria
    para todos los usuarios.
    """
    key = (video_id, want)
    if key in _versions:
        return _versions[key]

    clean = _clean_title(title)
    q = clean if _norm(artist) and _norm(artist) in _norm(clean) else f"{artist} {clean}".strip()
    data = _yt(link, "search", part="snippet", type="video", videoEmbeddable="true",
               videoCategoryId=MUSIC_CATEGORY, maxResults=8, q=q[:120])

    found = None
    art = _norm(artist)
    for it in data.get("items", []):
        vid = it.get("id", {}).get("videoId")
        if not vid or vid == video_id:
            continue
        v = _video(it, vid)
        ch = (it.get("snippet", {}).get("channelTitle") or "")
        if want == "song" and v["topic"]:
            found = v
            break
        if want == "video" and not v["topic"]:
            # videoclip del propio artista (o de su canal VEVO)
            if art and (art in _norm(ch) or "vevo" in ch.lower()):
                found = v
                break
    if len(_versions) > 5000:
        _versions.clear()
    _versions[key] = found
    return found
