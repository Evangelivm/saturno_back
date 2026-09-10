FROM python:3.11-slim

WORKDIR /app

# libgl1/libglib2.0-0: dependencias de OpenCV (usado internamente por rapidocr)
# libgomp1: runtime OpenMP que usa onnxruntime para paralelizar
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8866

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8866"]
