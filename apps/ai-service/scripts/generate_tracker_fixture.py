"""Fixture SINTÉTICO de secuencias de detecciones para probar el tracker del escáner.

Genera tests/fixtures/scanner-tracks.json: escenarios con verdad de campo conocida (cajas
simuladas con ruido, detecciones perdidas, confianza baja, falsos positivos y paneo de cámara).
Lo usan los tests del ai-service (Python) y de la web (TypeScript) para verificar que ambos
trackers implementan el mismo algoritmo y cuentan lo esperado en estos casos controlados.

Uso: uv run python scripts/generate_tracker_fixture.py
"""

from __future__ import annotations

import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "scanner-tracks.json"
W, H = 960, 540


def _score(rng: random.Random, low_rate: float) -> float:
    if rng.random() < low_rate:
        return round(rng.uniform(0.2, 0.38), 3)  # animal parcialmente visible
    return round(rng.uniform(0.5, 0.92), 3)


def passage(
    seed: int,
    animals: int,
    speed: float,
    spacing: int,
    drop_rate: float = 0.1,
    low_rate: float = 0.1,
    false_positives: int = 0,
    back_and_forth: int | None = None,
) -> dict:
    """Animales en fila cruzando de izquierda a derecha (manga / tranquera)."""
    rng = random.Random(seed)
    bw, bh = 130, 85
    lane_y = [rng.randint(180, 330) for _ in range(animals)]
    frames: list[list[list[float]]] = []
    total = int((animals * spacing + W + 2 * bw) / speed) + 4
    positive, negative = animals, 0
    for f in range(total):
        boxes: list[list[float]] = []
        for i in range(animals):
            x = -bw + (f - i * spacing / speed) * speed
            if back_and_forth is not None and i == back_and_forth:
                # Cruza, retrocede y vuelve a cruzar: +1, -1, +1 → neto +1.
                turn = W / 2 + 120
                period = 2 * 240
                travelled = x - (turn - bw / 2)
                if 0 < travelled < period:
                    x = (
                        turn
                        - bw / 2
                        - (travelled if travelled < period / 2 else period - travelled)
                    )
            if x + bw < 0 or x > W:
                continue
            if rng.random() < drop_rate:
                continue
            y = lane_y[i] + rng.uniform(-4, 4)
            jitter = rng.uniform(-3, 3)
            boxes.append(
                [round(x + jitter, 2), round(y, 2), round(x + bw + jitter, 2), round(y + bh, 2),
                 _score(rng, low_rate)]
            )  # fmt: skip
        for _ in range(false_positives if rng.random() < 0.15 else 0):
            fx = rng.uniform(W / 2 - 60, W / 2 + 20)
            boxes.append(
                [round(fx, 2), 420.0, round(fx + 50, 2), 470.0, round(rng.uniform(0.45, 0.6), 3)]
            )
        frames.append(boxes)
    if back_and_forth is not None:
        positive, negative = animals + 1, 1
    return {
        "frame_size": [W, H],
        "line": {"orientation": "vertical", "position": 0.5, "hysteresis": 0.02},
        "frames": frames,
        "shifts": None,
        "expected": {"net_count": animals, "positive": positive, "negative": negative},
    }


def sweep(seed: int, animals: int, pan_speed: float, with_shift: bool, revisit: bool) -> dict:
    """Barrido desde un punto: animales quietos en un panorama, la cámara gira a la derecha
    (el contenido se desplaza a la izquierda) y, opcionalmente, vuelve atrás y avanza otra vez."""
    rng = random.Random(seed)
    pano_w = 3200
    bw, bh = 110, 75
    xs = sorted(rng.sample(range(620, pano_w - 700, 40), animals))
    ys = [rng.randint(150, 360) for _ in range(animals)]
    # Trayectoria de la cámara (borde izquierdo del cuadro dentro del panorama).
    path: list[float] = []
    pos = 0.0
    end = pano_w - W
    if revisit:
        for target in (end * 0.55, end * 0.3, end):
            while abs(pos - target) > pan_speed / 2:
                pos += pan_speed if target > pos else -pan_speed
                path.append(pos)
    else:
        while pos < end:
            pos = min(end, pos + pan_speed)
            path.append(pos)
    frames: list[list[list[float]]] = []
    shifts: list[list[float]] = []
    prev = 0.0
    for cam in path:
        boxes = []
        for x, y in zip(xs, ys, strict=True):
            sx = x - cam
            if sx + bw < 0 or sx > W or rng.random() < 0.08:
                continue
            boxes.append(
                [round(sx + rng.uniform(-3, 3), 2), round(y + rng.uniform(-3, 3), 2),
                 round(sx + bw, 2), round(y + bh, 2), _score(rng, 0.08)]
            )  # fmt: skip
        frames.append(boxes)
        shifts.append([round(-(cam - prev), 2), 0.0])
        prev = cam
    return {
        "frame_size": [W, H],
        "line": {"orientation": "vertical", "position": 0.5, "hysteresis": 0.02},
        "frames": frames,
        "shifts": shifts if with_shift else None,
        "expected": {"net_count": animals},
    }


def main() -> None:
    scenarios = {
        "passage_single_file": passage(1, animals=10, speed=40, spacing=190),
        "passage_low_fps": passage(2, animals=8, speed=70, spacing=200),
        "passage_back_and_forth": passage(3, animals=4, speed=35, spacing=240, back_and_forth=1),
        "passage_false_positives": passage(4, animals=6, speed=40, spacing=200, false_positives=2),
        "sweep_with_camera_shift": sweep(5, 14, pan_speed=30, with_shift=True, revisit=False),
        "sweep_revisit_with_shift": sweep(6, 12, pan_speed=30, with_shift=True, revisit=True),
        "sweep_without_shift": sweep(7, animals=12, pan_speed=25, with_shift=False, revisit=False),
    }  # fmt: skip
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "description": (
                    "SINTÉTICO: secuencias de detecciones con verdad de campo para probar el "
                    "tracker del escáner (Python y TypeScript). No mide precisión en campo."
                ),
                "scenarios": scenarios,
            },
            separators=(",", ":"),
        )
    )
    print(f"{OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
