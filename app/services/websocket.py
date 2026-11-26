"""WebSocket mínimo (RFC 6455) sin dependencias externas.

Sirve para el chat de los grupos. Funciona con:
    - gunicorn con hilos (--threads): usa environ["gunicorn.socket"]
    - el servidor de desarrollo de Flask (python -m app.main): environ["werkzeug.socket"]

Cada conexión abierta ocupa un hilo de gunicorn mientras dura. Por eso el
Dockerfile arranca 1 proceso con bastantes hilos: así, además, todas las
conexiones están en el mismo proceso y los mensajes llegan a todos.

Uso desde una vista de Flask:

    ws = websocket.accept(request.environ)     # None si no es un WebSocket
    while True:
        text = ws.receive()                    # None cuando se cierra
        ...
        ws.send("hola")
    return websocket.finish_response(ws)
"""
import base64
import hashlib
import socket
import struct
import threading

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

MAX_MESSAGE = 64 * 1024          # bytes por mensaje del navegador
RECEIVE_TIMEOUT = 75             # s sin recibir nada -> conexión muerta (el navegador manda «ping» cada 25 s)

OP_CONT, OP_TEXT, OP_BINARY, OP_CLOSE, OP_PING, OP_PONG = 0x0, 0x1, 0x2, 0x8, 0x9, 0xA


class ConnectionClosed(Exception):
    pass


def _raw_socket(environ):
    return environ.get("gunicorn.socket") or environ.get("werkzeug.socket")


def is_websocket_request(environ):
    return (
        environ.get("REQUEST_METHOD") == "GET"
        and environ.get("HTTP_UPGRADE", "").lower() == "websocket"
        and "upgrade" in environ.get("HTTP_CONNECTION", "").lower()
    )


def accept_key(key):
    digest = hashlib.sha1((key + GUID).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")


def accept(environ):
    """Hace el «apretón de manos» y devuelve un WebSocket, o None si la
    petición no es un WebSocket válido o el servidor no deja usar el socket."""
    if not is_websocket_request(environ):
        return None
    key = environ.get("HTTP_SEC_WEBSOCKET_KEY", "")
    if environ.get("HTTP_SEC_WEBSOCKET_VERSION") != "13" or len(key) < 16:
        return None
    sock = _raw_socket(environ)
    if sock is None:
        return None

    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept_key(key)}\r\n"
        "\r\n"
    )
    sock.sendall(response.encode("ascii"))
    sock.settimeout(RECEIVE_TIMEOUT)
    return WebSocket(sock, environ)


class WebSocket:
    def __init__(self, sock, environ):
        self.sock = sock
        self.mode = "gunicorn" if "gunicorn.socket" in environ else "werkzeug"
        self.closed = False
        self._send_lock = threading.Lock()

    # ------------------------------------------------------------ lectura
    def _read_exact(self, size):
        data = bytearray()
        while len(data) < size:
            try:
                chunk = self.sock.recv(size - len(data))
            except (socket.timeout, OSError):
                raise ConnectionClosed()
            if not chunk:
                raise ConnectionClosed()
            data.extend(chunk)
        return bytes(data)

    def _read_frame(self):
        first, second = self._read_exact(2)
        fin = bool(first & 0x80)
        opcode = first & 0x0F
        masked = bool(second & 0x80)
        length = second & 0x7F
        if length == 126:
            length = struct.unpack("!H", self._read_exact(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", self._read_exact(8))[0]
        if not masked:                          # el navegador siempre enmascara
            self.close(1002)
            raise ConnectionClosed()
        if length > MAX_MESSAGE:
            self.close(1009)
            raise ConnectionClosed()
        mask = self._read_exact(4)
        payload = bytearray(self._read_exact(length))
        for i in range(length):
            payload[i] ^= mask[i % 4]
        return fin, opcode, bytes(payload)

    def receive(self):
        """Siguiente mensaje de texto, o None si la conexión se ha cerrado."""
        if self.closed:
            return None
        buffer = bytearray()
        message_opcode = None
        try:
            while True:
                fin, opcode, payload = self._read_frame()
                if opcode == OP_PING:
                    self._send_frame(OP_PONG, payload[:125])
                    continue
                if opcode == OP_PONG:
                    continue
                if opcode == OP_CLOSE:
                    self.close(1000)
                    return None
                if opcode in (OP_TEXT, OP_BINARY):
                    message_opcode = opcode
                    buffer = bytearray(payload)
                elif opcode == OP_CONT and message_opcode is not None:
                    buffer.extend(payload)
                else:
                    self.close(1002)
                    return None
                if len(buffer) > MAX_MESSAGE:
                    self.close(1009)
                    return None
                if fin:
                    if message_opcode != OP_TEXT:
                        continue                # binarios: no se usan, se ignoran
                    try:
                        return buffer.decode("utf-8")
                    except UnicodeDecodeError:
                        self.close(1007)
                        return None
        except ConnectionClosed:
            self.closed = True
            return None

    # ----------------------------------------------------------- escritura
    def _send_frame(self, opcode, payload):
        header = bytearray([0x80 | opcode])          # FIN + tipo; el servidor no enmascara
        length = len(payload)
        if length < 126:
            header.append(length)
        elif length < 65536:
            header.append(126)
            header += struct.pack("!H", length)
        else:
            header.append(127)
            header += struct.pack("!Q", length)
        with self._send_lock:
            self.sock.sendall(bytes(header) + payload)

    def send(self, text):
        """Envía un texto. Devuelve False si la conexión ya no sirve."""
        if self.closed:
            return False
        try:
            self._send_frame(OP_TEXT, text.encode("utf-8"))
            return True
        except OSError:
            self.closed = True
            return False

    def close(self, code=1000):
        if self.closed:
            return
        self.closed = True
        try:
            self._send_frame(OP_CLOSE, struct.pack("!H", code))
        except OSError:
            pass


def finish_response(ws):
    """Respuesta que hay que devolver desde la vista cuando el WebSocket
    termina: le dice al servidor que no escriba nada más en el socket
    (mismo truco que usa la librería flask-sock)."""
    from flask import Response

    class _WebSocketDone(Response):
        def __call__(self, *args, **kwargs):
            if ws.mode == "gunicorn":
                raise StopIteration()       # gunicorn cierra la conexión sin registrar error
            raise ConnectionError()         # el servidor de desarrollo lo toma como «cliente desconectado»

    return _WebSocketDone()
