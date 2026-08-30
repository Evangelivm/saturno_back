import io

import fitz  # PyMuPDF
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from paddleocr import PaddleOCR
from PIL import Image

app = FastAPI(title="Saturno OCR")

# Se carga una sola vez al iniciar el contenedor — cargarlo por request sería
# lentísimo (implica leer los pesos del modelo cada vez).
ocr = PaddleOCR(use_angle_cls=True, lang="es")


def pdf_to_images(data: bytes) -> list[Image.Image]:
    doc = fitz.open(stream=data, filetype="pdf")
    images = []
    for page in doc:
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)  # ~144 DPI, mejor precisión de OCR
        images.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
    return images


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr")
async def extract_text(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "Archivo vacío")

    is_pdf = (file.content_type == "application/pdf") or file.filename.lower().endswith(".pdf")

    try:
        if is_pdf:
            page_images = pdf_to_images(data)
        else:
            page_images = [Image.open(io.BytesIO(data)).convert("RGB")]
    except Exception as e:
        raise HTTPException(400, f"No se pudo leer el archivo: {e}")

    pages = []
    full_text_parts = []

    for i, image in enumerate(page_images, start=1):
        result = ocr.ocr(np.array(image), cls=True)
        lines = []
        page_text_parts = []

        # result[0] puede ser None si la página no tiene texto detectable
        for line in (result[0] or []):
            box, (text, confidence) = line
            lines.append({"text": text, "confidence": round(float(confidence), 4), "box": box})
            page_text_parts.append(text)

        page_text = "\n".join(page_text_parts)
        pages.append({"page": i, "lines": lines, "text": page_text})
        full_text_parts.append(page_text)

    return {"pages": pages, "text": "\n\n".join(full_text_parts)}
