FROM python:3.9-slim

WORKDIR /app

# Instalar dependencias del sistema para compilación
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

<<<<<<< HEAD:DockerFile
CMD ["python", "app/main.py"]
=======
# Comando para iniciar la aplicación (ejecutando main.py)
CMD ["python", "main.py"]
>>>>>>> aeaabfe4748ca497939372570aaa8d78875611ad:Dockerfile
