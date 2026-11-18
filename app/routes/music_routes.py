from functools import wraps

from flask import (Blueprint, render_template, url_for, redirect, request,
                   jsonify, make_response, session, flash)

from app.clients.google_api import GoogleApiError
from app.repositories import primary_repo
from app.services import music_service, youtube_service
from app.services.youtube_service import NotLinked


pulso_bp = Blueprint("pulso_bp", __name__)


def _current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    user = primary_repo.get_user_by_id(user_id)
    if not user:
        session.clear()
    return user


def login_required(api=False):
    """Pulso solo está disponible con sesión iniciada en la web."""
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = _current_user()
            if not user:
                if api:
                    return jsonify(error="login", message="Inicia sesión en la web"), 401
                flash("Inicia sesión para entrar en Pulso.", "info")
                return redirect(url_for("home_bp.login"))
            return fn(user, *args, **kwargs)
        return wrapper
    return deco


@pulso_bp.route("/pulso")
@login_required()
def pulso(user):
    return render_template(
        "pulso.html",
        user=user,
        google_ready=youtube_service.is_configured(),
    )


# ------------------------------------------------------------------ Mi música (nube)
@pulso_bp.route("/pulso/api/music")
@login_required(api=True)
def api_music(user):
    return jsonify(tracks=music_service.list_tracks(user), usage=music_service.usage(user))


@pulso_bp.route("/pulso/api/music/file")
@login_required(api=True)
def api_music_file(user):
    resp = music_service.stream(user, request.args.get("path", ""))
    if resp is None:
        return jsonify(error="notfound"), 404
    return resp


@pulso_bp.route("/pulso/api/music", methods=["POST"])
@login_required(api=True)
def api_music_upload(user):
    files = request.files.getlist("files")
    if not files:
        return jsonify(error="nofiles", message="No se ha seleccionado ningún archivo."), 400
    saved, errors = music_service.upload(user, files)
    status = 200 if saved else 400
    return jsonify(saved=saved, errors=errors, usage=music_service.usage(user)), status


@pulso_bp.route("/pulso/api/music", methods=["DELETE"])
@login_required(api=True)
def api_music_delete(user):
    if not music_service.delete(user, request.args.get("path", "")):
        return jsonify(error="notfound"), 404
    return jsonify(ok=True, usage=music_service.usage(user))


# ------------------------------------------------------------------ Google OAuth
@pulso_bp.route("/pulso/google/login")
@login_required()
def google_login(user):
    if not youtube_service.is_configured():
        return redirect(url_for("pulso_bp.pulso", google="noconfig"))
    url = youtube_service.start_login(
        force_consent=request.args.get("consent") == "1",
        popup=request.args.get("popup") == "1",
    )
    return redirect(url)


@pulso_bp.route("/pulso/google/callback")
@login_required()
def google_callback(user):
    popup = session.get("pulso_oauth_popup", False)
    try:
        cookie, need_consent, error = youtube_service.finish_login(request.args)
    except GoogleApiError as e:
        cookie, need_consent, error = None, False, e.reason or "google"

    if need_consent:
        return redirect(url_for("pulso_bp.google_login", consent=1, popup=int(popup)))

    result = "ok" if cookie else (error or "error")
    if popup:
        # la ventana emergente avisa a la página (la música sigue sonando) y se cierra
        resp = make_response(render_template("pulso_callback.html", result=result))
    else:
        resp = redirect(url_for("pulso_bp.pulso", google=result) + "#youtube")
    if cookie:
        youtube_service.set_cookie(resp, cookie)
    return resp


@pulso_bp.route("/pulso/google/logout", methods=["POST"])
@login_required(api=True)
def google_logout(user):
    resp = make_response(jsonify(ok=True))
    youtube_service.logout(resp)
    return resp


# ------------------------------------------------------------------ YouTube (API JSON)
def _api(fn):
    try:
        link = youtube_service.require_link()
        return jsonify(fn(link))
    except NotLinked as e:
        return jsonify(error=str(e)), 401
    except GoogleApiError as e:
        status = 429 if e.reason in ("quotaExceeded", "rateLimitExceeded") else 502
        return jsonify(error=e.reason or "google", message=e.message), status


@pulso_bp.route("/pulso/api/me")
@login_required(api=True)
def api_me(user):
    if not youtube_service.is_configured():
        return jsonify(linked=False, configured=False)
    link = youtube_service.current_link()
    if not link:
        return jsonify(linked=False, configured=True)
    return _api(lambda l: dict(youtube_service.me(l), linked=True, configured=True))


@pulso_bp.route("/pulso/api/playlists")
@login_required(api=True)
def api_playlists(user):
    return _api(youtube_service.playlists)


@pulso_bp.route("/pulso/api/playlists/<playlist_id>")
@login_required(api=True)
def api_playlist_items(user, playlist_id):
    return _api(lambda l: youtube_service.playlist_items(l, playlist_id))


@pulso_bp.route("/pulso/api/search")
@login_required(api=True)
def api_search(user):
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify([])
    return _api(lambda l: youtube_service.search(l, q))


@pulso_bp.route("/pulso/api/version/<video_id>")
@login_required(api=True)
def api_version(user, video_id):
    want = "video" if request.args.get("want") == "video" else "song"
    title = (request.args.get("title") or "")[:200]
    artist = (request.args.get("artist") or "")[:120]
    return _api(lambda l: {"version": youtube_service.alt_version(l, video_id, want, title, artist)})

