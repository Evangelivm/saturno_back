FROM python:3.8-slim

WORKDIR /app

# libgl1/libglib2.0-0: dependencias de OpenCV (usado internamente por paddleocr)
# libgomp1: OpenMP runtime que necesita paddlepaddle
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    patch \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# El wheel estándar de paddlepaddle requiere AVX; en un host sin AVX (ej. VPS
# con CPU "QEMU Virtual CPU" genérica) el proceso muere con SIGILL (exit code
# 132) al arrancar. PaddlePaddle dejó de publicar wheels "noavx" después de la
# 2.4.2, y esa última versión solo existe para Python 3.8 — de ahí la imagen
# base. Se instala el .whl exacto (no un rango de versiones vía índice) para
# que pip no pueda caer de nuevo al wheel normal con AVX de PyPI.
RUN pip install --no-cache-dir \
    https://paddle-wheel.bj.bcebos.com/2.4.2/linux/linux-cpu-openblas-noavx/paddlepaddle-2.4.2-cp38-cp38-linux_x86_64.whl

# paddleocr 2.6.1.3 es la versión contemporánea a paddle 2.4.2 (modelos
# PP-OCRv3); versiones 2.7+ de paddleocr apuntan a PP-OCRv4 y no están
# garantizadas con paddle tan viejo.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8866

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8866"]
