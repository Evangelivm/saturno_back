from __future__ import annotations

import io

import fitz  # PyMuPDF
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from markitdown import MarkItDown, StreamInfo
from PIL import Image
from rapidocr import RapidOCR

app = FastAPI(title="Saturno OCR")

# Umbral para decidir si un PDF ya trae texto embebido (generado digitalmente,
# ej. facturas electrónicas de SUNAT) o si es una imagen escaneada sin capa de
# texto. markitdown/pdfminer devuelven string vacío (no una excepción) cuando
# no hay texto que extraer, así que un umbral bajo alcanza para distinguir.
MIN_EMBEDDED_TEXT_CHARS = 40

_markitdown = MarkItDown(enable_plugins=False)


def extract_embedded_pdf_text(data: bytes) -> str | None:
    """Intenta leer el texto ya embebido en el PDF (sin OCR). Devuelve None si
    el PDF no tiene texto aprovechable (ej. escaneado) para que el caller
    caiga al flujo de OCR."""
    try:
        result = _markitdown.convert_stream(
            io.BytesIO(data), stream_info=StreamInfo(extension=".pdf")
        )
    except Exception:
        return None

    text = (getattr(result, "markdown", None) or getattr(result, "text_content", "") or "").strip()
    if len(text) < MIN_EMBEDDED_TEXT_CHARS:
        return None
    return text

# Se carga una sola vez al iniciar el contenedor — cargarlo por request sería
# lentísimo (implica leer los pesos del modelo cada vez).
#
# Se usa rapidocr (ONNXRuntime) en vez del motor nativo de PaddlePaddle: la
# CPU de este VPS ("QEMU Virtual CPU 2.5+") solo soporta hasta SSE3, y el
# kernel de convolución depthwise de PaddlePaddle 2.4.2 crashea con "Illegal
# instruction" (SIGILL) en cualquier CPU sin SSE4/AVX, incluso con el wheel
# "noavx". ONNXRuntime hace detección de CPU correcta y no tiene ese problema.
#
# "es" está soportado directamente por el modelo multilenguaje PP-OCRv6 de
# esta librería (a diferencia de PaddleOCR viejo, no hace falta pedir un
# bucket compartido tipo "latin").
ocr = RapidOCR(params={"Rec.lang_type": "es"})


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

    if is_pdf:
        embedded_text = extract_embedded_pdf_text(data)
        if embedded_text is not None:
            return {"pages": [{"page": 1, "lines": [], "text": embedded_text}], "text": embedded_text}

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
        result = ocr(np.array(image))
        lines = []
        page_text_parts = []

        boxes = result.boxes if result.boxes is not None else []
        txts = result.txts if result.txts is not None else []
        scores = result.scores if result.scores is not None else []

        for box, text, confidence in zip(boxes, txts, scores):
            box_list = box.tolist() if hasattr(box, "tolist") else box
            lines.append({"text": text, "confidence": round(float(confidence), 4), "box": box_list})
            page_text_parts.append(text)

        page_text = "\n".join(page_text_parts)
        pages.append({"page": i, "lines": lines, "text": page_text})
        full_text_parts.append(page_text)

    return {"pages": pages, "text": "\n\n".join(full_text_parts)}
