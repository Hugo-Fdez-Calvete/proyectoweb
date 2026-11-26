"""Reparto de mensajes en directo: qué conexiones están mirando cada chat.

Vive en memoria del proceso de gunicorn (por eso se arranca con 1 proceso).
Si en el futuro se usan varios procesos, habría que cambiar esto por algo
compartido (Redis, por ejemplo).
"""
import json
import threading

_lock = threading.Lock()
_watchers = {}          # chat_id -> set(Client)


class Client:
    """Una pestaña del navegador conectada por WebSocket."""

    def __init__(self, ws, user_id, username):
        self.ws = ws
        self.user_id = user_id
        self.username = username
        self.chat_id = None


def join(client, chat_id):
    with _lock:
        if client.chat_id is not None:
            _watchers.get(client.chat_id, set()).discard(client)
        client.chat_id = chat_id
        _watchers.setdefault(chat_id, set()).add(client)
    broadcast_presence(chat_id)


def leave(client):
    with _lock:
        chat_id = client.chat_id
        if chat_id is not None:
            group = _watchers.get(chat_id, set())
            group.discard(client)
            if not group:
                _watchers.pop(chat_id, None)
        client.chat_id = None
    if chat_id is not None:
        broadcast_presence(chat_id)


def watching_user_ids(chat_id):
    """Usuarios que tienen ese chat abierto ahora mismo (no hace falta avisarles por correo)."""
    with _lock:
        return {c.user_id for c in _watchers.get(chat_id, ())}


def online_usernames(chat_id):
    with _lock:
        return sorted({c.username for c in _watchers.get(chat_id, ())}, key=str.lower)


def broadcast(chat_id, payload):
    text = json.dumps(payload, ensure_ascii=False)
    with _lock:
        clients = list(_watchers.get(chat_id, ()))
    for client in clients:
        if not client.ws.send(text):
            leave(client)


def broadcast_presence(chat_id):
    broadcast(chat_id, {"type": "presence", "chat": chat_id, "users": online_usernames(chat_id)})


def kick_chat(chat_id):
    """El chat se ha borrado: se avisa a quien lo tenga abierto."""
    broadcast(chat_id, {"type": "chat_deleted", "chat": chat_id})
    with _lock:
        clients = list(_watchers.pop(chat_id, ()))
    for client in clients:
        client.chat_id = None


def kick_user_from_group(user_id, chat_ids):
    """Un miembro sale (o le sacan) del grupo: se le cierran esos chats."""
    with _lock:
        targets = [c for cid in chat_ids for c in _watchers.get(cid, ()) if c.user_id == user_id]
    for client in targets:
        client.ws.send(json.dumps({"type": "removed", "chat": client.chat_id}))
        leave(client)


def connection_count():
    """Pestañas con un chat abierto ahora mismo (para /salud)."""
    with _lock:
        return sum(len(clients) for clients in _watchers.values())
