"""Grupos: páginas, archivos, miembros, chats y el WebSocket del chat.

    /HomeCloud/grupos/                         mis grupos y crear uno
    /HomeCloud/grupos/<id>                     chats del grupo
    /HomeCloud/grupos/<id>/chat/<chat>         un chat
    /HomeCloud/grupos/<id>/archivos            archivos del grupo
    /HomeCloud/grupos/<id>/miembros            miembros y permisos
    /HomeCloud/grupos/<id>/ajustes             nombre, espacio y borrar (creador y admins)
    /HomeCloud/grupos/api/...                  JSON para el chat (si el WebSocket no funciona)
    /ws/chat                                   WebSocket del chat
"""
import json
from functools import wraps

from flask import (Blueprint, abort, flash, jsonify, redirect, render_template,
                   request, session, url_for)

from app.models.db.groups_db import PERMISSIONS
from app.repositories import groups_repo
from app.services import (chat_hub, chat_service, groups_service, notify_service,
                          websocket)
from app.services.groups_service import GroupError


groups_bp = Blueprint("groups_bp", __name__, url_prefix="/HomeCloud/grupos")
WS_PATH = "/ws/chat"         # Nginx necesita un bloque para esta ruta (ver deploy/)
ws_bp = Blueprint("ws_bp", __name__)


# ------------------------------------------------------------- utilidades
def _current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    user = groups_repo.get_user(user_id)
    if user is None or user.status != "active":
        return None
    return user


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = _current_user()
        if user is None:
            if request.path.startswith("/HomeCloud/grupos/api"):
                return jsonify(error="Tu sesión ha caducado. Vuelve a iniciar sesión."), 401
            return redirect(url_for("home_bp.login"))
        return view(user, *args, **kwargs)
    return wrapper


def _access_or_redirect(group_id, user):
    try:
        return groups_service.get_access(group_id, user)
    except GroupError as e:
        flash(str(e), "danger")
        return None


def _path():
    return request.values.get("path", "")


def _common(access, active):
    """Variables que usan todas las pestañas del grupo."""
    return {
        "user": access.user,
        "group": access.group,
        "access": access,
        "perms": access.permissions(),
        "active_tab": active,
        "used_gb": groups_service.group_used_gb(access.group),
        "member_count": groups_repo.count_members(access.group.id),
    }


@groups_bp.app_context_processor
def _pending_invites_count():
    """Número de invitaciones pendientes (para el aviso en pestañas y menú)."""
    def count():
        user_id = session.get("user_id")
        if not user_id:
            return 0
        try:
            return groups_repo.count_invites_for_user(user_id)
        except Exception:
            return 0
    return {"pending_invites_count": count}


# ------------------------------------------------------------- mis grupos
@groups_bp.route("/")
@login_required
def groups(user):
    return render_template(
        "grupos/grupos.html",
        user=user,
        invites=groups_service.invites_for(user),
        cards=groups_service.list_for_user(user),
        free_gb=groups_service.available_for_groups_gb(user),
        committed_gb=groups_service.committed_gb(user),
    )


@groups_bp.route("/crear", methods=["POST"])
@login_required
def create(user):
    try:
        group = groups_service.create_group(
            user, request.form.get("name"), request.form.get("description"), request.form.get("storage_gb"))
    except GroupError as e:
        flash(str(e), "danger")
        return redirect(url_for("groups_bp.groups"))
    flash(f"Grupo «{group.name}» creado. Añade a los miembros desde «Miembros».", "success")
    return redirect(url_for("groups_bp.group_home", group_id=group.id))


# ------------------------------------------------------------------ chats
@groups_bp.route("/<int:group_id>")
@login_required
def group_home(user, group_id):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    chats = groups_repo.chats_of(group_id)
    return redirect(url_for("groups_bp.chat_page", group_id=group_id, chat_id=chats[0].id)) if chats \
        else redirect(url_for("groups_bp.files", group_id=group_id))


@groups_bp.route("/<int:group_id>/chat/<int:chat_id>")
@login_required
def chat_page(user, group_id, chat_id):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    chat = groups_repo.get_chat(chat_id)
    if chat is None or chat.group_id != group_id:
        flash("El chat no existe.", "danger")
        return redirect(url_for("groups_bp.group_home", group_id=group_id))
    messages = chat_service.history(chat, access)
    if messages:
        chat_service.mark_read(chat, access, messages[-1]["id"])
    return render_template(
        "grupos/chat.html",
        chat=chat,
        chats=chat_service.chats_with_unread(access),
        messages=messages,
        chat_config={
            "chat": chat.id,
            "group": group_id,
            "me": user.id,
            "meName": user.username,
            "canWrite": access.can("can_chat"),
            "canModerate": access.manage,
            "historyUrl": url_for("groups_bp.api_messages", chat_id=chat.id),
            "sendUrl": url_for("groups_bp.api_send", chat_id=chat.id),
            "readUrl": url_for("groups_bp.api_read", chat_id=chat.id),
            "deleteUrl": url_for("groups_bp.api_delete_message", message_id=0),
            "wsPath": WS_PATH,
        },
        **_common(access, "chats"),
    )


@groups_bp.route("/<int:group_id>/chats/crear", methods=["POST"])
@login_required
def create_chat(user, group_id):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    try:
        chat = chat_service.create_chat(access, request.form.get("name"))
    except GroupError as e:
        flash(str(e), "danger")
        return redirect(url_for("groups_bp.group_home", group_id=group_id))
    return redirect(url_for("groups_bp.chat_page", group_id=group_id, chat_id=chat.id))


@groups_bp.route("/<int:group_id>/chat/<int:chat_id>/borrar", methods=["POST"])
@login_required
def delete_chat(user, group_id, chat_id):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    chat = groups_repo.get_chat(chat_id)
    if chat is None or chat.group_id != group_id:
        abort(404)
    try:
        chat_service.delete_chat(chat, access)
        chat_hub.kick_chat(chat_id)
        flash("Chat borrado.", "success")
    except GroupError as e:
        flash(str(e), "danger")
        return redirect(url_for("groups_bp.chat_page", group_id=group_id, chat_id=chat_id))
    return redirect(url_for("groups_bp.group_home", group_id=group_id))


# --------------------------------------------------------------- archivos
@groups_bp.route("/<int:group_id>/archivos")
@login_required
def files(user, group_id):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    data = groups_service.listing(access, request.args.get("path", ""))
    if data is None:
        flash("La carpeta no existe.", "danger")
        return redirect(url_for("groups_bp.files", group_id=group_id))
    return render_template("grupos/archivos.html", listing=data, **_common(access, "files"))


def _back_to_files(group_id):
    return redirect(url_for("groups_bp.files", group_id=group_id, path=_path() or None))


@groups_bp.route("/<int:group_id>/archivos/subir", methods=["POST"])
@login_required
def upload(user, group_id):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    file = request.files.get("file")
    if not file or not file.filename:
        flash("No se ha seleccionado ningún archivo.", "danger")
        return _back_to_files(group_id)
    try:
        groups_service.upload(access, file, _path())
        flash("Archivo subido correctamente.", "success")
        notify_service.safe(notify_service.file_uploaded, access.group, user, file.filename)
    except GroupError as e:
        flash(str(e), "danger")
    return _back_to_files(group_id)


@groups_bp.route("/<int:group_id>/archivos/carpeta", methods=["POST"])
@login_required
def create_folder(user, group_id):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    try:
        groups_service.create_folder(access, request.form.get("folder_name", ""), _path())
        flash("Carpeta creada correctamente.", "success")
    except GroupError as e:
        flash(str(e), "danger")
    return _back_to_files(group_id)


@groups_bp.route("/<int:group_id>/archivos/borrar/<path:name>", methods=["POST"])
@login_required
def delete_entry(user, group_id, name):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    try:
        groups_service.delete_entry(access, name, _path())
        flash("Elemento eliminado correctamente.", "success")
    except GroupError as e:
        flash(str(e), "danger")
    return _back_to_files(group_id)


@groups_bp.route("/<int:group_id>/archivos/descargar/<path:name>")
@login_required
def download(user, group_id, name):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    response = groups_service.download(access, name, _path())
    if response is None:
        flash("El archivo no existe.", "danger")
        return _back_to_files(group_id)
    return response


# --------------------------------------------------------------- miembros
@groups_bp.route("/<int:group_id>/miembros")
@login_required
def members(user, group_id):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    return render_template("grupos/miembros.html", members=groups_service.members(access),
                           invites=groups_service.pending_invites(access),
                           permissions=PERMISSIONS, **_common(access, "members"))


@groups_bp.route("/<int:group_id>/miembros/anadir", methods=["POST"])
@login_required
def add_member(user, group_id):
    """Invita a un usuario (entra cuando acepta)."""
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    try:
        invited = groups_service.invite_member(access, request.form.get("username"))
        flash(f"Invitación enviada a {invited.username}. Entrará en el grupo cuando la acepte.", "success")
        notify_service.safe(notify_service.group_invited, invited, access.group, user)
    except GroupError as e:
        flash(str(e), "danger")
    return redirect(url_for("groups_bp.members", group_id=group_id))


@groups_bp.route("/<int:group_id>/invitaciones/<int:invite_id>/retirar", methods=["POST"])
@login_required
def cancel_invite(user, group_id, invite_id):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    try:
        invited = groups_service.cancel_invite(access, invite_id)
        flash(f"Invitación a {invited.username} retirada.", "success")
    except GroupError as e:
        flash(str(e), "danger")
    return redirect(url_for("groups_bp.members", group_id=group_id))


def _after_invite():
    return redirect(url_for("profile_bp.profile") + "#invitaciones" if request.form.get("next") == "perfil"
                    else url_for("groups_bp.groups"))


@groups_bp.route("/invitaciones/<int:invite_id>/aceptar", methods=["POST"])
@login_required
def accept_invite(user, invite_id):
    try:
        invite = groups_repo.get_invite(invite_id)
        inviter = invite.inviter if invite else None
        group = groups_service.accept_invite(invite_id, user)
    except GroupError as e:
        flash(str(e), "danger")
        return _after_invite()
    flash(f"Ya estás en el grupo «{group.name}».", "success")
    if inviter is not None and inviter.id != user.id:
        notify_service.safe(notify_service.invite_accepted, inviter, user, group)
    return redirect(url_for("groups_bp.group_home", group_id=group.id))


@groups_bp.route("/invitaciones/<int:invite_id>/rechazar", methods=["POST"])
@login_required
def decline_invite(user, invite_id):
    try:
        group = groups_service.decline_invite(invite_id, user)
        flash(f"Has rechazado la invitación a «{group.name}».", "success")
    except GroupError as e:
        flash(str(e), "danger")
    return _after_invite()


@groups_bp.route("/<int:group_id>/miembros/<int:user_id>/permisos", methods=["POST"])
@login_required
def set_permissions(user, group_id, user_id):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    permissions = groups_service.parse_permissions(request.form)
    try:
        member = groups_service.set_permissions(access, user_id, permissions)
        flash(f"Permisos de {member.user.username} guardados.", "success")
        notify_service.safe(notify_service.permissions_changed, member.user, access.group, permissions)
    except GroupError as e:
        flash(str(e), "danger")
    return redirect(url_for("groups_bp.members", group_id=group_id))


@groups_bp.route("/<int:group_id>/miembros/<int:user_id>/quitar", methods=["POST"])
@login_required
def remove_member(user, group_id, user_id):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    try:
        removed = groups_service.remove_member(access, user_id)
        chat_hub.kick_user_from_group(user_id, [c.id for c in groups_repo.chats_of(group_id)])
        flash(f"{removed.username} ya no está en el grupo.", "success")
        notify_service.safe(notify_service.member_removed, removed, access.group)
    except GroupError as e:
        flash(str(e), "danger")
    return redirect(url_for("groups_bp.members", group_id=group_id))


@groups_bp.route("/<int:group_id>/salir", methods=["POST"])
@login_required
def leave(user, group_id):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    try:
        groups_service.leave(access)
        chat_hub.kick_user_from_group(user.id, [c.id for c in groups_repo.chats_of(group_id)])
        flash(f"Has salido del grupo «{access.group.name}».", "success")
    except GroupError as e:
        flash(str(e), "danger")
        return redirect(url_for("groups_bp.members", group_id=group_id))
    return redirect(url_for("groups_bp.groups"))


@groups_bp.route("/api/usuarios")
@login_required
def api_users(user):
    """Sugerencias para el campo «añadir miembro» / «compartir con» (desde 2 letras)."""
    prefix = (request.args.get("q") or "").strip()
    if len(prefix) < 2:
        return jsonify(users=[])
    exclude = {user.id}
    group_id = request.args.get("group", type=int)
    if group_id:
        exclude.update(groups_repo.member_ids(group_id))
        exclude.update(groups_repo.invited_ids(group_id))
    return jsonify(users=groups_repo.search_active_usernames(prefix, exclude))


# ---------------------------------------------------------------- ajustes
@groups_bp.route("/<int:group_id>/ajustes", methods=["GET", "POST"])
@login_required
def settings(user, group_id):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    if not access.manage:
        flash("Solo el creador del grupo puede cambiar sus ajustes.", "danger")
        return redirect(url_for("groups_bp.group_home", group_id=group_id))
    if request.method == "POST":
        try:
            groups_service.update_group(access, request.form.get("name"),
                                        request.form.get("description"), request.form.get("storage_gb"))
            flash("Ajustes guardados.", "success")
            return redirect(url_for("groups_bp.settings", group_id=group_id))
        except GroupError as e:
            flash(str(e), "danger")
    owner = groups_repo.get_user(access.group.owner_id)
    return render_template(
        "grupos/ajustes.html",
        owner_free_gb=groups_service.available_for_groups_gb(owner) if owner else 0,
        **_common(access, "settings"),
    )


@groups_bp.route("/<int:group_id>/borrar", methods=["POST"])
@login_required
def delete_group(user, group_id):
    access = _access_or_redirect(group_id, user)
    if access is None:
        return redirect(url_for("groups_bp.groups"))
    chat_ids = [c.id for c in groups_repo.chats_of(group_id)]
    name = access.group.name
    try:
        groups_service.delete_group(access)
    except GroupError as e:
        flash(str(e), "danger")
        return redirect(url_for("groups_bp.settings", group_id=group_id))
    for chat_id in chat_ids:
        chat_hub.kick_chat(chat_id)
    flash(f"Grupo «{name}» borrado con todos sus archivos y chats.", "success")
    if request.form.get("next") == "admin" and access.is_admin:
        return redirect(url_for("admin_bp.groups"))
    return redirect(url_for("groups_bp.groups"))


# ------------------------------------------------- API del chat (sin WebSocket)
@groups_bp.route("/api/chats/<int:chat_id>/mensajes")
@login_required
def api_messages(user, chat_id):
    try:
        chat, access = chat_service.chat_access(chat_id, user)
    except GroupError as e:
        return jsonify(error=str(e)), 403
    after = request.args.get("after", type=int)
    before = request.args.get("before", type=int)
    return jsonify(messages=chat_service.history(chat, access, after_id=after, before_id=before),
                   online=chat_hub.online_usernames(chat.id))


def _deliver(chat, access, message):
    """Mensaje guardado: a todos los que miran el chat y, por correo, a los demás."""
    payload = chat_service.message_dict(message)
    chat_hub.broadcast(chat.id, {"type": "message", "message": payload})
    notify_service.safe(notify_service.new_message, chat, access.group, message, access.user,
                        chat_hub.watching_user_ids(chat.id))
    return payload


@groups_bp.route("/api/chats/<int:chat_id>/mensajes", methods=["POST"])
@login_required
def api_send(user, chat_id):
    try:
        chat, access = chat_service.chat_access(chat_id, user)
        data = request.get_json(silent=True) or {}
        message = chat_service.post_message(chat, access, data.get("body"))
    except GroupError as e:
        return jsonify(error=str(e)), 400
    return jsonify(message=_deliver(chat, access, message))


@groups_bp.route("/api/chats/<int:chat_id>/leido", methods=["POST"])
@login_required
def api_read(user, chat_id):
    try:
        chat, access = chat_service.chat_access(chat_id, user)
    except GroupError as e:
        return jsonify(error=str(e)), 403
    chat_service.mark_read(chat, access, (request.get_json(silent=True) or {}).get("last"))
    return jsonify(ok=True)


@groups_bp.route("/api/mensajes/<int:message_id>/borrar", methods=["POST"])
@login_required
def api_delete_message(user, message_id):
    try:
        chat_id = chat_service.delete_message(message_id, user)
    except GroupError as e:
        return jsonify(error=str(e)), 403
    chat_hub.broadcast(chat_id, {"type": "deleted", "id": message_id, "chat": chat_id})
    return jsonify(ok=True)


# --------------------------------------------------------------- WebSocket
def _same_origin():
    origin = request.headers.get("Origin", "")
    if not origin:
        return False
    host = origin.split("://", 1)[-1].rstrip("/")
    return host.lower() == request.host.lower()


# websocket=True: Werkzeug solo deja llegar aquí peticiones de WebSocket
# (y ese mismo flag es el que usa la librería flask-sock).
@ws_bp.route(WS_PATH, websocket=True)
def chat_socket():
    """Una conexión por pestaña. El navegador manda JSON:
        {"type": "join", "chat": 12}             empezar a recibir un chat
        {"type": "send", "chat": 12, "body": ""} escribir
        {"type": "read", "chat": 12, "last": 99} marcar como leído
        {"type": "ping"}                         cada 25 s, para que no se corte
    y recibe {"type": "message" | "deleted" | "presence" | "error" | ...}."""
    user = _current_user()
    if user is None or not _same_origin():
        return "No autorizado", 403
    ws = websocket.accept(request.environ)
    if ws is None:
        return "Se esperaba un WebSocket", 400

    from app.models.db.db import db
    client = chat_hub.Client(ws, user.id, user.username)
    db.session.remove()                 # no dejar una transacción abierta mientras dure la conexión
    try:
        while True:
            text = ws.receive()
            if text is None:
                break
            try:
                data = json.loads(text)
            except ValueError:
                continue
            if not isinstance(data, dict):
                continue
            kind = data.get("type")
            if kind == "ping":
                ws.send('{"type":"pong"}')
                continue
            try:
                me = groups_repo.get_user(user.id)
                if me is None or me.status != "active":
                    break
                chat_id = int(data.get("chat") or 0)
                if kind == "join":
                    chat, access = chat_service.chat_access(chat_id, me)
                    chat_hub.join(client, chat.id)
                elif kind == "send":
                    chat, access = chat_service.chat_access(chat_id, me)
                    message = chat_service.post_message(chat, access, data.get("body"))
                    payload = _deliver(chat, access, message)
                    ws.send(json.dumps({"type": "sent", "nonce": data.get("nonce"), "message": payload},
                                       ensure_ascii=False))
                elif kind == "read":
                    chat, access = chat_service.chat_access(chat_id, me)
                    chat_service.mark_read(chat, access, data.get("last"))
            except GroupError as e:
                ws.send(json.dumps({"type": "error", "error": str(e), "nonce": data.get("nonce")},
                                   ensure_ascii=False))
            except (TypeError, ValueError):
                ws.send('{"type":"error","error":"Petición no válida."}')
            finally:
                db.session.remove()
    finally:
        chat_hub.leave(client)
        ws.close()
        db.session.remove()
    return websocket.finish_response(ws)
