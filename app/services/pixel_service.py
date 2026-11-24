import base64
import struct
import threading
import time
import zlib

from app.repositories import pixel_repo

WIDTH = 512
HEIGHT = 512
WHITE = 0xFFFFFF
MAX_BATCH = 256           # píxeles por petición (un trazo se envía en trozos)
MAX_CHANGES = 5000        # cambios por respuesta de sincronización


# Límite por persona («tinta»): (píxeles de depósito, píxeles que se recargan por segundo)
LIMITS = {
    "anon": (120, 2.0),       # visitantes sin sesión (por IP)
    "user": (240, 4.0),       # usuarios con sesión
}


class PixelError(ValueError):
    pass


class NoInk(PixelError):
    """No queda tinta suficiente: hay que esperar a que se recargue."""
    def __init__(self, ink):
        super().__init__("Te has quedado sin tinta. Se recarga sola en unos segundos.")
        self.ink = ink


def ink(who):
    """Tinta disponible ahora. who = (clave, depósito, recarga) o None (sin límite)."""
    if who is None:
        return None
    key, cap, rate = who
    now = time.time()
    saved = pixel_repo.get_quota(key)
    tokens = cap if saved is None else min(cap, saved[0] + (now - saved[1]) * rate)
    return {"tokens": tokens, "cap": cap, "rate": rate, "now": now}


def _public(i):
    return None if i is None else {"tokens": round(i["tokens"], 2), "cap": i["cap"], "rate": i["rate"]}


def _png(w, h, rgb):
    """PNG RGB mínimo (solo con la biblioteca estándar). El lienzo casi en blanco
    se comprime muchísimo: 512×512 ocupa unos pocos KB en vez de 768 KB."""
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    row = w * 3
    raw = b"".join(b"\x00" + bytes(rgb[y * row:(y + 1) * row]) for y in range(h))
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 6))
            + chunk(b"IEND", b""))


# El PNG del lienzo se guarda en memoria y solo se vuelve a generar cuando hay
# cambios nuevos (cada proceso de gunicorn tiene su propia copia).
_cache = {"last": None, "data": None}
_cache_lock = threading.Lock()


def board():
    """Lienzo completo como PNG (en base64) y el último cambio conocido."""
    last = pixel_repo.last_change_id()
    with _cache_lock:
        if _cache["last"] == last and _cache["data"] is not None:
            return _cache["data"]
    data = _build_board(last)
    with _cache_lock:
        _cache["last"] = last
        _cache["data"] = data
    return data


def _build_board(last):
    buf = bytearray(b"\xff" * (WIDTH * HEIGHT * 3))
    painted = 0
    for x, y, c in pixel_repo.all_pixels():
        if 0 <= x < WIDTH and 0 <= y < HEIGHT:
            i = (y * WIDTH + x) * 3
            buf[i] = (c >> 16) & 255
            buf[i + 1] = (c >> 8) & 255
            buf[i + 2] = c & 255
            if c != WHITE:
                painted += 1
    return {
        "w": WIDTH,
        "h": HEIGHT,
        "last": last,
        "painted": painted,
        "png": base64.b64encode(_png(WIDTH, HEIGHT, buf)).decode("ascii"),
    }


def changes(since):
    """Cambios posteriores a `since`. Si el historial ya no llega tan atrás,
    se pide al navegador que recargue el lienzo entero."""
    last = pixel_repo.last_change_id()
    if since > last:
        return {"reset": True, "last": last}
    first = pixel_repo.first_change_id()
    if since < first - 1 and last:
        return {"reset": True, "last": last}
    rows = pixel_repo.changes_since(since, MAX_CHANGES)
    if len(rows) == MAX_CHANGES:
        return {"reset": True, "last": last}
    return {"last": rows[-1][0] if rows else since, "changes": [[x, y, c] for _, x, y, c in rows]}


def paint(raw, who=None):
    """raw: lista de [x, y, color]. Valida, quita repetidos (gana el último), gasta
    tinta (si hay límite) y guarda."""
    if not isinstance(raw, list) or not raw:
        raise PixelError("No hay píxeles que pintar.")
    if len(raw) > MAX_BATCH:
        raise PixelError("Demasiados píxeles de una vez.")
    clean = {}
    for item in raw:
        if not isinstance(item, (list, tuple)) or len(item) != 3:
            raise PixelError("Formato de píxel no válido.")
        x, y, c = item
        if not all(isinstance(v, int) and not isinstance(v, bool) for v in (x, y, c)):
            raise PixelError("Formato de píxel no válido.")
        if not (0 <= x < WIDTH and 0 <= y < HEIGHT and 0 <= c <= WHITE):
            raise PixelError("Píxel fuera del lienzo.")
        clean[(x, y)] = c
    i = ink(who)
    quota = None
    if i is not None:
        if i["tokens"] < len(clean):
            raise NoInk(_public(i))
        i["tokens"] -= len(clean)
        quota = (who[0], i["tokens"], i["now"])
    last = pixel_repo.paint([(x, y, c) for (x, y), c in clean.items()], quota)
    return {"last": last, "ink": _public(i)}


def ink_info(who):
    return _public(ink(who))
