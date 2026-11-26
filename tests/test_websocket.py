"""Servidor WebSocket propio (app/services/websocket.py), sin red: con un par de sockets."""
import os
import socket
import struct

from app.services import websocket


def frame(opcode, data, fin=True, mask=True):
    head = bytes([(0x80 if fin else 0) | opcode])
    n = len(data)
    mask_bit = 0x80 if mask else 0
    if n < 126:
        head += bytes([mask_bit | n])
    elif n < 65536:
        head += bytes([mask_bit | 126]) + struct.pack("!H", n)
    else:
        head += bytes([mask_bit | 127]) + struct.pack("!Q", n)
    if not mask:
        return head + data
    key = os.urandom(4)
    return head + key + bytes(b ^ key[i % 4] for i, b in enumerate(data))


def read_frame(sock):
    first, second = sock.recv(2)
    length = second & 0x7F
    if length == 126:
        length = struct.unpack("!H", sock.recv(2))[0]
    data = b""
    while len(data) < length:
        data += sock.recv(length - len(data))
    return first & 0x0F, data


def pair():
    server, client = socket.socketpair()
    server.settimeout(5)
    client.settimeout(5)
    return websocket.WebSocket(server, {"werkzeug.socket": server}), client


def test_clave_de_aceptacion_rfc6455():
    # Ejemplo oficial del RFC 6455
    assert websocket.accept_key("dGhlIHNhbXBsZSBub25jZQ==") == "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="


def test_reconoce_peticiones_websocket():
    env = {"REQUEST_METHOD": "GET", "HTTP_UPGRADE": "websocket", "HTTP_CONNECTION": "keep-alive, Upgrade"}
    assert websocket.is_websocket_request(env)
    assert not websocket.is_websocket_request({"REQUEST_METHOD": "GET"})


def test_texto_y_fragmentos():
    ws, client = pair()
    client.sendall(frame(0x1, "hola ✓".encode()))
    assert ws.receive() == "hola ✓"
    msg = b'{"type":"ping"}'
    client.sendall(frame(0x1, msg[:5], fin=False) + frame(0x0, msg[5:]))
    assert ws.receive() == '{"type":"ping"}'


def test_ping_responde_pong():
    ws, client = pair()
    client.sendall(frame(0x9, b"abc") + frame(0x1, b"x"))
    assert ws.receive() == "x"
    assert read_frame(client) == (0xA, b"abc")


def test_envio_del_servidor():
    ws, client = pair()
    assert ws.send("¡hola!")
    assert read_frame(client) == (0x1, "¡hola!".encode())


def test_mensaje_demasiado_grande():
    ws, client = pair()
    client.sendall(frame(0x1, b"x" * (websocket.MAX_MESSAGE + 1)))
    assert ws.receive() is None
    opcode, data = read_frame(client)
    assert opcode == 0x8 and struct.unpack("!H", data[:2])[0] == 1009


def test_trama_sin_mascara_se_rechaza():
    ws, client = pair()
    client.sendall(frame(0x1, b"x", mask=False))
    assert ws.receive() is None
    opcode, data = read_frame(client)
    assert opcode == 0x8 and struct.unpack("!H", data[:2])[0] == 1002


def test_cierre():
    ws, client = pair()
    client.sendall(frame(0x8, struct.pack("!H", 1000)))
    assert ws.receive() is None
    assert ws.closed
