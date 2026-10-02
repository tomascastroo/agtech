"""Seguimiento de bovinos entre cuadros y conteo neto por línea (Escáner de Bovinos).

Algoritmo (idéntico a apps/web/src/lib/scanner/tracker.ts; ambos se prueban con el mismo
fixture tests/fixtures/scanner-tracks.json):

  Asociación estilo ByteTrack (Zhang et al., ECCV 2022):
    1. Las detecciones se dividen por confianza: altas (>= high_threshold) y bajas
       (>= low_threshold). Las bajas suelen ser animales parcialmente ocultos.
    2. Etapa 1: tracks ↔ detecciones altas. Etapa 2: tracks que quedaron sin asociar ↔
       detecciones bajas (recupera oclusiones sin abrir tracks con detecciones dudosas).
    3. Solo las detecciones altas sin asociar abren tracks nuevos (>= new_track_threshold).
    La asociación es greedy por afinidad contra la posición PREDICHA de cada track: velocidad
    constante con un filtro alfa-beta (simplificación del filtro de Kalman de ByteTrack) más,
    si se informa, el desplazamiento global de la cámara entre cuadros (compensación de
    movimiento, como BoT-SORT). Afinidad = IoU; sin solapamiento (baja tasa de cuadros) se
    admite por distancia entre centros relativa al tamaño del animal.

  Conteo por línea (paso controlado o barrido desde un punto):
    - Una línea fija en el cuadro (vertical u horizontal). Cada track recuerda de qué lado
      está, con una banda de histéresis para que el ruido de la caja no genere cruces falsos.
    - Cada cambio de lado es un cruce +1 o -1. El conteo es NETO: |cruces(+) - cruces(-)|.
      Un animal que va y vuelve, o una zona re-escaneada al volver con la cámara, se descuenta.
    - Los cruces de un track sin confirmar quedan pendientes y se aplican recién cuando el
      track se confirma (min_hits); si el track se pierde sin confirmarse, se descartan.

Limitaciones: sin re-identificación por apariencia; un animal oculto más de `max_lost` cuadros
que reaparece es un track nuevo (afecta al conteo solo si vuelve a cruzar la línea en el mismo
sentido); animales pegados que el detector fusiona en una caja cuentan como uno.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

TRACKER_VERSION = "agro-bytetrack/1.0.0"

Box = tuple[float, float, float, float, float]  # x1, y1, x2, y2, score
Orientation = Literal["vertical", "horizontal"]


@dataclass(frozen=True)
class TrackerParams:
    high_threshold: float = 0.4
    low_threshold: float = 0.15
    new_track_threshold: float = 0.45
    # Afinidad mínima por etapa (IoU, o afinidad por distancia si no hay solapamiento).
    min_affinity_high: float = 0.1
    min_affinity_low: float = 0.3
    # Distancia máxima entre centros (relativa al lado mayor del animal) para asociar sin IoU.
    max_center_distance: float = 0.75
    max_lost: int = 8
    min_hits: int = 2
    # Filtro alfa-beta: peso de la velocidad medida frente a la anterior.
    velocity_smoothing: float = 0.5


@dataclass(frozen=True)
class LineSpec:
    orientation: Orientation = "vertical"
    position: float = 0.5  # fracción del ancho (vertical) o del alto (horizontal)
    hysteresis: float = 0.02  # fracción de esa dimensión


@dataclass
class _Track:
    id: int
    box: Box
    first_frame: int
    last_frame: int
    side: int
    score_sum: float
    confirmed: bool
    vx: float = 0.0
    vy: float = 0.0
    hits: int = 1
    lost: int = 0
    pending: list[tuple[int, int]] = field(default_factory=list)  # (cuadro, dirección)


@dataclass(frozen=True)
class CrossingEvent:
    track_id: int
    frame: int
    direction: int  # +1 / -1


@dataclass(frozen=True)
class TrackSummary:
    id: int
    first_frame: int
    last_frame: int
    hits: int
    net_crossings: int
    mean_score: float


@dataclass(frozen=True)
class ScanCount:
    net_count: int
    positive_crossings: int
    negative_crossings: int
    max_simultaneous: int
    confirmed_tracks: int
    frames: int
    events: list[CrossingEvent]
    tracks: list[TrackSummary]
    detections_per_frame: list[int]
    confidence: float


def iou(a: Box, b: Box) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def affinity(predicted: Box, box: Box, max_center_distance: float) -> float:
    overlap = iou(predicted, box)
    if overlap > 0:
        return overlap
    cx1, cy1 = (predicted[0] + predicted[2]) / 2, (predicted[1] + predicted[3]) / 2
    cx2, cy2 = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    size = max(predicted[2] - predicted[0], predicted[3] - predicted[1], 1.0)
    distance = (((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2) ** 0.5) / size
    if distance >= max_center_distance:
        return 0.0
    # Siempre <= 0.5: queda por debajo de solapamientos reales altos.
    return 0.5 * (1 - distance / max_center_distance)


class ByteTracker:
    def __init__(
        self,
        frame_size: tuple[int, int],
        params: TrackerParams | None = None,
        line: LineSpec | None = None,
    ) -> None:
        self.params = params or TrackerParams()
        self.line = line or LineSpec()
        width, height = frame_size
        span = width if self.line.orientation == "vertical" else height
        self._line_px = self.line.position * span
        self._margin = self.line.hysteresis * span
        self.tracks: list[_Track] = []
        self.removed: list[_Track] = []
        self.events: list[CrossingEvent] = []
        self._next_id = 1

    def _side(self, box: Box) -> int:
        if self.line.orientation == "vertical":
            center = (box[0] + box[2]) / 2
        else:
            center = (box[1] + box[3]) / 2
        offset = center - self._line_px
        if offset > self._margin:
            return 1
        if offset < -self._margin:
            return -1
        return 0

    def _predict(self, track: _Track, frame: int, shift: tuple[float, float]) -> Box:
        steps = frame - track.last_frame
        dx = track.vx * steps + shift[0]
        dy = track.vy * steps + shift[1]
        b = track.box
        return (b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy, b[4])

    def _associate(
        self,
        tracks: list[_Track],
        boxes: list[Box],
        predicted: dict[int, Box],
        min_affinity: float,
    ) -> tuple[list[tuple[_Track, Box]], list[_Track], list[Box]]:
        candidates: list[tuple[float, int, int]] = []
        for ti, track in enumerate(tracks):
            for di, box in enumerate(boxes):
                a = affinity(predicted[track.id], box, self.params.max_center_distance)
                if a >= min_affinity:
                    candidates.append((a, ti, di))
        # Orden determinista: afinidad descendente, luego índices ascendentes.
        candidates.sort(key=lambda c: (-c[0], c[1], c[2]))
        used_t: set[int] = set()
        used_d: set[int] = set()
        matches: list[tuple[_Track, Box]] = []
        for _, ti, di in candidates:
            if ti in used_t or di in used_d:
                continue
            used_t.add(ti)
            used_d.add(di)
            matches.append((tracks[ti], boxes[di]))
        rest_t = [t for i, t in enumerate(tracks) if i not in used_t]
        rest_d = [b for i, b in enumerate(boxes) if i not in used_d]
        return matches, rest_t, rest_d

    def _apply(self, track: _Track, box: Box, frame: int, shift: tuple[float, float]) -> None:
        steps = max(frame - track.last_frame, 1)
        old = track.box
        # Velocidad propia del animal: desplazamiento observado menos el de la cámara.
        mvx = (((box[0] + box[2]) - (old[0] + old[2])) / 2 - shift[0]) / steps
        mvy = (((box[1] + box[3]) - (old[1] + old[3])) / 2 - shift[1]) / steps
        s = self.params.velocity_smoothing
        if track.hits == 1:
            track.vx, track.vy = mvx, mvy
        else:
            track.vx = s * mvx + (1 - s) * track.vx
            track.vy = s * mvy + (1 - s) * track.vy
        track.box = box
        track.hits += 1
        track.lost = 0
        track.last_frame = frame
        track.score_sum += box[4]
        side = self._side(box)
        if side != 0 and track.side != 0 and side != track.side:
            track.pending.append((frame, side))
        if side != 0:
            track.side = side
        if not track.confirmed and track.hits >= self.params.min_hits:
            track.confirmed = True
        if track.confirmed and track.pending:
            for event_frame, direction in track.pending:
                self.events.append(CrossingEvent(track.id, event_frame, direction))
            track.pending = []

    def update(self, frame: int, boxes: list[Box], shift: tuple[float, float] = (0.0, 0.0)) -> None:
        p = self.params
        high = [b for b in boxes if b[4] >= p.high_threshold]
        low = [b for b in boxes if p.low_threshold <= b[4] < p.high_threshold]
        predicted = {t.id: self._predict(t, frame, shift) for t in self.tracks}

        matches, unmatched, rest_high = self._associate(
            self.tracks, high, predicted, p.min_affinity_high
        )
        matches_low, unmatched, _ = self._associate(unmatched, low, predicted, p.min_affinity_low)
        for track, box in matches + matches_low:
            self._apply(track, box, frame, shift)

        survivors: list[_Track] = [t for t, _ in matches + matches_low]
        for track in unmatched:
            track.lost += 1
            # Mientras está perdido, su caja acompaña el movimiento de la cámara.
            b = track.box
            track.box = (b[0] + shift[0], b[1] + shift[1], b[2] + shift[0], b[3] + shift[1], b[4])
            (self.removed if track.lost > p.max_lost else survivors).append(track)
        for box in rest_high:
            if box[4] >= p.new_track_threshold:
                survivors.append(
                    _Track(
                        id=self._next_id,
                        box=box,
                        first_frame=frame,
                        last_frame=frame,
                        side=self._side(box),
                        score_sum=box[4],
                        confirmed=p.min_hits <= 1,
                    )
                )
                self._next_id += 1
        self.tracks = sorted(survivors, key=lambda t: t.id)

    def confirmed_tracks(self) -> list[_Track]:
        return sorted([t for t in self.tracks + self.removed if t.confirmed], key=lambda t: t.id)


def count_scan(
    frames: list[list[Box]],
    frame_size: tuple[int, int],
    params: TrackerParams | None = None,
    line: LineSpec | None = None,
    shifts: list[tuple[float, float]] | None = None,
) -> ScanCount:
    """`frames`: detecciones por cuadro; `shifts`: desplazamiento de la cámara por cuadro."""
    tracker = ByteTracker(frame_size, params, line)
    for index, boxes in enumerate(frames):
        tracker.update(index, boxes, shifts[index] if shifts else (0.0, 0.0))
    positive = sum(1 for e in tracker.events if e.direction > 0)
    negative = sum(1 for e in tracker.events if e.direction < 0)
    confirmed = tracker.confirmed_tracks()
    net_by_track: dict[int, int] = {}
    for e in tracker.events:
        net_by_track[e.track_id] = net_by_track.get(e.track_id, 0) + e.direction
    crossing_scores = [t.score_sum / t.hits for t in confirmed if net_by_track.get(t.id, 0)]
    per_frame = [len(b) for b in frames]
    return ScanCount(
        net_count=abs(positive - negative),
        positive_crossings=positive,
        negative_crossings=negative,
        max_simultaneous=max(per_frame, default=0),
        confirmed_tracks=len(confirmed),
        frames=len(frames),
        events=list(tracker.events),
        tracks=[
            TrackSummary(
                id=t.id,
                first_frame=t.first_frame,
                last_frame=t.last_frame,
                hits=t.hits,
                net_crossings=net_by_track.get(t.id, 0),
                mean_score=round(t.score_sum / t.hits, 4),
            )
            for t in confirmed
        ],
        detections_per_frame=per_frame,
        confidence=round(sum(crossing_scores) / len(crossing_scores), 4)
        if crossing_scores
        else 0.0,
    )
