FROM python:3.9-slim

WORKDIR /app

# Instalar dependencias del sistema si fueran necesarias
RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

# Copiar e instalar requirements.txt
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el resto del código del proyecto
COPY . .

# Exponer el puerto por el que corre Flask
EXPOSE 5000

# Comando para iniciar la aplicación (ejecutando main.py)
CMD ["python", "main.py"]
