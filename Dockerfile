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

# -m para que funcione "from app.routes..." (el paquete app se resuelve desde /app)
CMD ["python", "-m", "app.main"]
