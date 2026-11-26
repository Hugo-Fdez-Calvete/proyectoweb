FROM python:3.12-slim

WORKDIR /app

# Herramientas de compilación esenciales para arquitectura ARM / Raspberry Pi
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copiar e instalar requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el resto del código
COPY . .

EXPOSE 5000

# Versión que enseña /salud (opcional: docker build --build-arg APP_VERSION=1.4.0 .)
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

# Docker comprueba cada 30 s que la app responde en /salud; Portainer muestra
# el contenedor como «healthy» o «unhealthy». Python ya está en la imagen,
# así que no hace falta instalar curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5000/salud', timeout=4).status == 200 else 1)"

# Servidor de producción (Gunicorn) en lugar del servidor de desarrollo de Flask.
# - app.main:app  -> el objeto «app» de app/main.py (el paquete app se resuelve desde /app)
# - 1 proceso x 48 hilos: el chat usa WebSocket y cada pestaña con un chat
#   abierto ocupa un hilo; con un solo proceso todas las conexiones se ven
#   entre sí y los mensajes llegan a todos (ver app/services/chat_hub.py)
# - --preload: la app se carga una sola vez antes de crear los procesos
# - --timeout 120: margen para subidas grandes a la nube
# - logs de acceso y errores a la salida estándar (se ven en Portainer)
# Para depurar en local sigue valiendo: python -m app.main
CMD ["gunicorn", "--config", "gunicorn.conf.py", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "48", "--preload", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", "app.main:app"]
