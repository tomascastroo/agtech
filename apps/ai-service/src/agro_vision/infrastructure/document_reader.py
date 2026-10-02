"""Lectura de texto de documentos: capa de texto del PDF y, si no hay, OCR (RapidOCR/ONNX)."""

from __future__ import annotations

import threading
from dataclasses import dataclass, field

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
    # Confianza de cada línea del texto (1.0 en la capa de texto del PDF): permite informar la
    # confianza de cada campo extraído según la línea donde se leyó.
    line_confidences: list[float] = field(default_factory=list)


def _engine():
    global _ocr
    with _ocr_lock:
        if _ocr is None:
            from rapidocr_onnxruntime import RapidOCR

            _ocr = RapidOCR()
        return _ocr


def ocr_lines(bgr: np.ndarray) -> list[tuple[str, float]]:
    """OCR de una imagen: líneas en orden de lectura con su confianza."""
    result, _ = _engine()(bgr)
    if not result:
        return []
    items = sorted(
        result, key=lambda r: (round(min(p[1] for p in r[0]) / 20), min(p[0] for p in r[0]))
    )
    return [(str(r[1]), float(r[2])) for r in items]


def read_document(data: bytes) -> DocumentText:
    if data[:4] == b"%PDF":
        return _read_pdf(data)
    array = np.frombuffer(data, dtype=np.uint8)
    bgr = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if bgr is None:
        raise UnreadableDocumentError("Formato no soportado: se acepta PDF, JPG o PNG")
    read = ocr_lines(bgr)
    return _from_ocr(read, pages=1)


def _from_ocr(read: list[tuple[str, float]], pages: int) -> DocumentText:
    lines = [t for t, _ in read]
    weights = [max(len(t), 1) for t in lines]
    conf = (
        sum(c * w for (_, c), w in zip(read, weights, strict=True)) / sum(weights) if read else 0.0
    )
    return DocumentText(
        "\n".join(lines), "OCR", round(conf, 3), pages, len(lines), [round(c, 3) for _, c in read]
    )


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
        count = native.count("\n") + 1
        return DocumentText(native, "PDF_TEXT", 1.0, pages, count, [1.0] * count)
    # PDF escaneado: rasteriza y aplica OCR.
    read: list[tuple[str, float]] = []
    for i in range(pages):
        bitmap = pdf[i].render(scale=2.0).to_numpy()
        bgr = cv2.cvtColor(
            bitmap, cv2.COLOR_RGBA2BGR if bitmap.shape[2] == 4 else cv2.COLOR_RGB2BGR
        )
        read.extend(ocr_lines(bgr))
    return _from_ocr(read, pages=pages)
