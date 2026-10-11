FROM python:3.9-slim

WORKDIR /app

# Instalar herramientas de compilación esenciales para arquitectura ARM / Raspberry Pi
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copiar e instalar requirements
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copiar el resto del código
COPY . .

EXPOSE 5000

CMD ["python", "app/main.py"]