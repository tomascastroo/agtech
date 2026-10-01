"""Descarga los pesos ONNX de YOLOX (Megvii, Apache-2.0) de la release oficial y verifica SHA-256.

Uso: python scripts/download_models.py [--dir models] [yolox_s ...]
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import urllib.request
from pathlib import Path

RELEASE = "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0"
MODELS = {
    "yolox_tiny": "427cc366d34e27ff7a03e2899b5e3671425c262ea2291f88bb942bc1cc70b0f7",
    "yolox_s": "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063",
    "yolox_m": "21ff6cfdeb53b013bac2249599e55f00bff3cfdfdab37ed7a4620818c1d15b3f",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="*", default=["yolox_s"])
    parser.add_argument("--dir", default="models")
    args = parser.parse_args()
    target_dir = Path(args.dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    for name in args.names:
        expected = MODELS[name]
        target = target_dir / f"{name}.onnx"
        if target.exists() and sha256(target) == expected:
            print(f"{name}: ya presente")
            continue
        tmp = target.with_suffix(".part")
        with (
            urllib.request.urlopen(f"{RELEASE}/{name}.onnx", timeout=300) as response,  # noqa: S310
            tmp.open("wb") as fh,
        ):
            while chunk := response.read(1 << 20):
                fh.write(chunk)
        actual = sha256(tmp)
        if actual != expected:
            tmp.unlink()
            sys.exit(f"{name}: SHA-256 inesperado ({actual})")
        tmp.rename(target)
        print(f"{name}: descargado y verificado")


if __name__ == "__main__":
    main()
