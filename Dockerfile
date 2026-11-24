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

# Servidor de producción (Gunicorn) en lugar del servidor de desarrollo de Flask.
# - app.main:app  -> el objeto «app» de app/main.py (el paquete app se resuelve desde /app)
# - 2 procesos x 4 hilos: suficiente para una Raspberry Pi
# - --preload: la app se carga una sola vez antes de crear los procesos
# - --timeout 120: margen para subidas grandes a la nube
# - logs de acceso y errores a la salida estándar (se ven en Portainer)
# Para depurar en local sigue valiendo: python -m app.main
CMD ["gunicorn", "--config", "gunicorn.conf.py", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "--preload", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", "app.main:app"]
