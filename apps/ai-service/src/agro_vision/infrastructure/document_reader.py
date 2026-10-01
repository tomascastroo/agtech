"""Lectura de texto de documentos: capa de texto del PDF y, si no hay, OCR (RapidOCR/ONNX)."""

from __future__ import annotations

import threading
from dataclasses import dataclass

import cv2
import numpy as np

MAX_PDF_PAGES = 5
MIN_TEXT_CHARS = 40
_ocr_lock = threading.Lock()
_ocr = None


class UnreadableDocumentError(ValueError):
    pass


@dataclass
class DocumentText:
    text: str
    method: str  # PDF_TEXT | OCR
    confidence: float  # 1.0 para texto nativo del PDF; media ponderada del OCR
    pages: int
    lines: int


def _engine():
    global _ocr
    with _ocr_lock:
        if _ocr is None:
            from rapidocr_onnxruntime import RapidOCR

            _ocr = RapidOCR()
        return _ocr


def ocr_image(bgr: np.ndarray) -> tuple[list[str], float]:
    """OCR de una imagen: líneas (orden de lectura) y confianza media ponderada por longitud."""
    result, _ = _engine()(bgr)
    if not result:
        return [], 0.0
    # Orden de lectura aproximado: por fila (y) y luego por x.
    items = sorted(
        result, key=lambda r: (round(min(p[1] for p in r[0]) / 20), min(p[0] for p in r[0]))
    )
    lines = [str(r[1]) for r in items]
    weights = [max(len(t), 1) for t in lines]
    conf = sum(float(r[2]) * w for r, w in zip(items, weights, strict=True)) / sum(weights)
    return lines, conf


def read_document(data: bytes) -> DocumentText:
    if data[:4] == b"%PDF":
        return _read_pdf(data)
    array = np.frombuffer(data, dtype=np.uint8)
    bgr = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if bgr is None:
        raise UnreadableDocumentError("Formato no soportado: se acepta PDF, JPG o PNG")
    lines, conf = ocr_image(bgr)
    return DocumentText("\n".join(lines), "OCR", round(conf, 3), 1, len(lines))


def _read_pdf(data: bytes) -> DocumentText:
    import pypdfium2 as pdfium

    try:
        pdf = pdfium.PdfDocument(data)
    except pdfium.PdfiumError as exc:
        raise UnreadableDocumentError("PDF ilegible o protegido") from exc
    pages = min(len(pdf), MAX_PDF_PAGES)
    texts = [pdf[i].get_textpage().get_text_range() for i in range(pages)]
    native = "\n".join(t for t in texts if t)
    if len(native.strip()) >= MIN_TEXT_CHARS:
        return DocumentText(native, "PDF_TEXT", 1.0, pages, native.count("\n") + 1)
    # PDF escaneado: rasteriza y aplica OCR.
    all_lines: list[str] = []
    confs: list[tuple[float, int]] = []
    for i in range(pages):
        bitmap = pdf[i].render(scale=2.0).to_numpy()
        bgr = cv2.cvtColor(
            bitmap, cv2.COLOR_RGBA2BGR if bitmap.shape[2] == 4 else cv2.COLOR_RGB2BGR
        )
        lines, conf = ocr_image(bgr)
        all_lines.extend(lines)
        confs.append((conf, sum(len(t) for t in lines)))
    total = sum(n for _, n in confs) or 1
    conf = sum(c * n for c, n in confs) / total
    return DocumentText("\n".join(all_lines), "OCR", round(conf, 3), pages, len(all_lines))
