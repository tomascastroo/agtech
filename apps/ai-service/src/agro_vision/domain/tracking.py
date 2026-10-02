"""Seguimiento de animales entre cuadros de video y conteo sin duplicados.

Método (explicable, sin re-identificación por apariencia):
  1. Cada cuadro muestreado se procesa con el detector (YOLOX).
  2. Las detecciones se asocian a los tracks abiertos de forma greedy, por IoU o por distancia
     entre centros (relativa al tamaño del animal) contra la posición PREDICHA del track con
     velocidad constante (como SORT, sin filtro de Kalman).
  3. Un track se confirma si se observó en al menos `min_hits` cuadros (descarta falsos
     positivos de un solo cuadro) y se cierra tras `max_missed` cuadros sin observarse.

Conteos que se informan:
  - `line_crossings`: tracks confirmados cuyo centro cruzó la línea de conteo. Es el conteo de
    PASO CONTROLADO (manga, tranquera, puerta de corral): cada animal que pasa se cuenta una vez.
  - `max_simultaneous`: máximo de detecciones en un mismo cuadro. Es la cota inferior
    conservadora para una VISTA GENERAL (paneo de un rodeo): nunca cuenta dos veces al mismo
    animal, pero no ve a los que no entraron en un mismo cuadro.
  - `confirmed_tracks`: cantidad de tracks confirmados. Es una cota SUPERIOR: oclusiones y
    animales que salen y vuelven a entrar al cuadro generan identidades nuevas.

Limitaciones: sin re-identificación, un animal ocluido más de `max_missed` cuadros o que sale
y vuelve a entrar puede contarse dos veces; animales muy juntos pueden fusionarse en un track.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

TRACKER_VERSION = "iou-centroid-tracker/1.0.0"

Box = tuple[float, float, float, float, float]  # x1, y1, x2, y2, score
Axis = Literal["x", "y"]


@dataclass(frozen=True)
class TrackerParams:
    iou_threshold: float = 0.2
    # Distancia máxima entre centros, relativa al lado mayor del animal, para asociar sin IoU.
    max_center_distance: float = 0.6
    max_missed: int = 3
    min_hits: int = 2
    # Posición de la línea de conteo como fracción del ancho/alto del cuadro.
    line_position: float = 0.5


@dataclass
class Track:
    id: int
    boxes: list[tuple[int, Box]] = field(default_factory=list)  # (frame_index, box)
    missed: int = 0

    @property
    def last(self) -> Box:
        return self.boxes[-1][1]

    @property
    def hits(self) -> int:
        return len(self.boxes)

    def predicted(self, frame_index: int) -> Box:
        """Caja esperada en `frame_index` con velocidad constante (últimas dos observaciones)."""
        last_frame, last = self.boxes[-1]
        if len(self.boxes) < 2:
            return last
        prev_frame, prev = self.boxes[-2]
        gap = max(last_frame - prev_frame, 1)
        vx = ((last[0] + last[2]) - (prev[0] + prev[2])) / 2 / gap
        vy = ((last[1] + last[3]) - (prev[1] + prev[3])) / 2 / gap
        steps = frame_index - last_frame
        return (
            last[0] + vx * steps,
            last[1] + vy * steps,
            last[2] + vx * steps,
            last[3] + vy * steps,
            last[4],
        )

    def centers(self) -> list[tuple[float, float]]:
        return [((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) for _, b in self.boxes]

    def mean_score(self) -> float:
        return sum(b[4] for _, b in self.boxes) / len(self.boxes)


@dataclass(frozen=True)
class TrackSummary:
    id: int
    first_frame: int
    last_frame: int
    hits: int
    crossed: bool
    mean_score: float


@dataclass(frozen=True)
class VideoCount:
    line_crossings: int
    max_simultaneous: int
    confirmed_tracks: int
    axis: Axis
    line_position: float
    frames: int
    detections_per_frame: list[int]
    tracks: list[TrackSummary]
    crossing_confidence: float
    overview_confidence: float


def iou(a: Box, b: Box) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def _center_distance(a: Box, b: Box) -> float:
    """Distancia entre centros relativa al lado mayor de la caja anterior."""
    ca = ((a[0] + a[2]) / 2, (a[1] + a[3]) / 2)
    cb = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    size = max(a[2] - a[0], a[3] - a[1], 1.0)
    return (((ca[0] - cb[0]) ** 2 + (ca[1] - cb[1]) ** 2) ** 0.5) / size


class IouTracker:
    def __init__(self, params: TrackerParams | None = None) -> None:
        self.params = params or TrackerParams()
        self.active: list[Track] = []
        self.finished: list[Track] = []
        self._next_id = 1

    def update(self, frame_index: int, boxes: list[Box]) -> None:
        p = self.params
        candidates: list[tuple[float, int, int]] = []
        for ti, track in enumerate(self.active):
            expected = track.predicted(frame_index)
            for di, box in enumerate(boxes):
                overlap = iou(expected, box)
                if overlap >= p.iou_threshold:
                    candidates.append((1.0 + overlap, ti, di))
                else:
                    dist = _center_distance(expected, box)
                    if dist <= p.max_center_distance:
                        candidates.append((1.0 - dist / (p.max_center_distance + 1e-9), ti, di))
        candidates.sort(reverse=True)
        used_tracks: set[int] = set()
        used_boxes: set[int] = set()
        for _, ti, di in candidates:
            if ti in used_tracks or di in used_boxes:
                continue
            used_tracks.add(ti)
            used_boxes.add(di)
            self.active[ti].boxes.append((frame_index, boxes[di]))
            self.active[ti].missed = 0
        still_active: list[Track] = []
        for ti, track in enumerate(self.active):
            if ti not in used_tracks:
                track.missed += 1
            (self.finished if track.missed > p.max_missed else still_active).append(track)
        self.active = still_active
        for di, box in enumerate(boxes):
            if di not in used_boxes:
                self.active.append(Track(id=self._next_id, boxes=[(frame_index, box)]))
                self._next_id += 1

    def all_tracks(self) -> list[Track]:
        return sorted(self.finished + self.active, key=lambda t: t.id)


def dominant_axis(tracks: list[Track]) -> Axis:
    """Eje del movimiento predominante (los animales cruzan la línea perpendicular a él)."""
    dx = dy = 0.0
    for track in tracks:
        centers = track.centers()
        dx += abs(centers[-1][0] - centers[0][0])
        dy += abs(centers[-1][1] - centers[0][1])
    return "x" if dx >= dy else "y"


def crossed_line(track: Track, axis: Axis, line: float) -> bool:
    coord = [c[0] if axis == "x" else c[1] for c in track.centers()]
    return any(
        a != b and (a - line) * (b - line) <= 0 for a, b in zip(coord, coord[1:], strict=False)
    )


def count_video(
    frames: list[list[Box]],
    frame_size: tuple[int, int],
    params: TrackerParams | None = None,
    axis: Axis | None = None,
) -> VideoCount:
    """`frames`: detecciones por cuadro muestreado; `frame_size`: (ancho, alto)."""
    params = params or TrackerParams()
    tracker = IouTracker(params)
    for index, boxes in enumerate(frames):
        tracker.update(index, boxes)
    confirmed = [t for t in tracker.all_tracks() if t.hits >= params.min_hits]
    axis = axis or dominant_axis(confirmed)
    width, height = frame_size
    line = params.line_position * (width if axis == "x" else height)
    crossing = [t for t in confirmed if crossed_line(t, axis, line)]
    per_frame = [len(b) for b in frames]
    peak = max(per_frame, default=0)
    peak_frame = per_frame.index(peak) if frames else 0

    def mean(values: list[float]) -> float:
        return round(sum(values) / len(values), 4) if values else 0.0

    return VideoCount(
        line_crossings=len(crossing),
        max_simultaneous=peak,
        confirmed_tracks=len(confirmed),
        axis=axis,
        line_position=params.line_position,
        frames=len(frames),
        detections_per_frame=per_frame,
        tracks=[
            TrackSummary(
                id=t.id,
                first_frame=t.boxes[0][0],
                last_frame=t.boxes[-1][0],
                hits=t.hits,
                crossed=t in crossing,
                mean_score=round(t.mean_score(), 4),
            )
            for t in confirmed
        ],
        crossing_confidence=mean([t.mean_score() for t in crossing]),
        overview_confidence=mean([b[4] for b in frames[peak_frame]]) if frames else 0.0,
    )
