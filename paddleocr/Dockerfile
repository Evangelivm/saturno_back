FROM python:3.10-slim

WORKDIR /app

# libgl1/libglib2.0-0: dependencias de OpenCV (usado internamente por paddleocr)
# libgomp1: OpenMP runtime que necesita paddlepaddle
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# El wheel estándar de paddlepaddle está compilado para CPUs con AVX; en un
# host sin AVX el proceso muere con SIGILL (exit code 132) al arrancar.
# Se instala la variante "noavx" + openblas (en vez de mkl, que en CPUs no
# Intel puede elegir una ruta de código inválida igual con AVX deshabilitado).
RUN pip install --no-cache-dir --force-reinstall paddlepaddle==2.6.2 \
    -f https://www.paddlepaddle.org.cn/whl/linux/openblas/noavx/stable.html

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8866

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8866"]
