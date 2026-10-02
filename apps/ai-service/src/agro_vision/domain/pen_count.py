"""Conteo de animales QUIETOS (escáner de corral y análisis de fotos).

En un corral, una aguada o un agrupamiento los animales casi no se desplazan: no hay una línea
que crucen. El operador apunta la cámara al grupo y, si no entra en un cuadro, la mueve despacio
para cubrir otras zonas. Algoritmo (conservador):

  1. Detecciones por cuadro (YOLOX) y desplazamiento global de la cámara entre cuadros (flujo
     óptico + RANSAC, ver scan_processing.estimate_camera_shift).
  2. Tracker estilo ByteTrack con compensación de cámara (domain/tracking.py): un mismo animal
     visto en cuadros seguidos es un solo track.
  3. Cada track confirmado (min_hits) se ubica en coordenadas del "mundo" (cuadro inicial):
     posición en el cuadro menos el desplazamiento acumulado de la cámara. Se toma la mediana.
  4. Unión conservadora de vistas: dos tracks que NUNCA estuvieron a la vez en cuadro y ocupan
     el mismo lugar del mundo (solapamiento o centros cercanos) son probablemente el mismo animal
     visto de nuevo (al volver con la cámara o tras una oclusión) y se cuentan una vez. Dos
     tracks vistos a la vez en el mismo cuadro son siempre animales distintos.
  5. Observados = grupos tras la unión (nunca menos que el máximo de animales contados que se
     vieron a la vez, porque esos nunca se unen). Es una COTA INFERIOR: los animales tapados
     por otros no se ven.

Además mide, sin inventar precisión: cobertura (ancho del mundo recorrido en "vistas"),
revisita, oclusión (cajas que se solapan), tamaño de los animales y animales cortados en el
borde del área recorrida (indicio de que el grupo sigue fuera de lo cubierto).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from statistics import median

from .tracking import Box, ByteTracker, TrackerParams, iou

PEN_METHOD = "agro-pen-unique/1.0.0"

# Tracks con menos apariciones que esto no se cuentan (detecciones espurias de un cuadro).
PEN_MIN_HITS = 3
# Unión de vistas: IoU mínimo en coordenadas del mundo, o distancia entre centros relativa al
# tamaño del animal.
MERGE_MIN_IOU = 0.3
MERGE_MAX_CENTER_DISTANCE = 0.5
# Una caja "ocluida" se solapa con otra con IoU >= esto.
OCCLUSION_IOU = 0.2
# Un animal "chico" ocupa menos de esta fracción del alto del cuadro.
SMALL_HEIGHT_FRACTION = 0.08
# Una caja "en el borde" está a menos de esta fracción del ancho del borde del cuadro.
EDGE_FRACTION = 0.02


@dataclass(frozen=True)
class PenTrack:
    id: int
    hits: int
    first_frame: int
    last_frame: int
    world_box: tuple[float, float, float, float]
    mean_score: float
    group: int


@dataclass(frozen=True)
class PenCount:
    observed: int
    unique_groups: int
    tracks_counted: int
    merged_tracks: int
    max_simultaneous: int
    coverage_views: float
    revisit_ratio: float
    occlusion_ratio: float
    small_animal_ratio: float
    edge_animals: int
    tracks: list[PenTrack]
    confidence: float
    method: str = PEN_METHOD


def _shift_box(box: Box, dx: float, dy: float) -> tuple[float, float, float, float]:
    return (box[0] - dx, box[1] - dy, box[2] - dx, box[3] - dy)


def _center_distance(a: tuple[float, ...], b: tuple[float, ...]) -> float:
    ca = ((a[0] + a[2]) / 2, (a[1] + a[3]) / 2)
    cb = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    size = max(a[2] - a[0], a[3] - a[1], b[2] - b[0], b[3] - b[1], 1.0)
    return (((ca[0] - cb[0]) ** 2 + (ca[1] - cb[1]) ** 2) ** 0.5) / size


def frame_occlusion(boxes: Sequence[Box], min_score: float) -> tuple[int, int]:
    """(cajas que se solapan con otra, cajas consideradas) en un cuadro."""
    strong = [b for b in boxes if b[4] >= min_score]
    overlapped = sum(
        1
        for i, a in enumerate(strong)
        if any(iou(a, b) >= OCCLUSION_IOU for j, b in enumerate(strong) if j != i)
    )
    return overlapped, len(strong)


def count_pen(
    frames: Sequence[Sequence[Box]],
    frame_size: tuple[int, int],
    shifts: Sequence[tuple[float, float]] | None = None,
    params: TrackerParams | None = None,
) -> PenCount:
    """`frames`: detecciones por cuadro; `shifts`: desplazamiento del contenido por cuadro."""
    width, height = frame_size
    p = params or TrackerParams()
    tracker = ByteTracker(frame_size, p)
    offset = [0.0, 0.0]  # desplazamiento acumulado del contenido desde el primer cuadro
    world: dict[int, list[tuple[float, float, float, float]]] = {}
    frames_of: dict[int, set[int]] = {}
    scores: dict[int, list[float]] = {}
    camera_x: list[float] = []
    occluded = considered = small = boxes_total = 0
    for index, boxes in enumerate(frames):
        shift = shifts[index] if shifts else (0.0, 0.0)
        offset[0] += shift[0]
        offset[1] += shift[1]
        camera_x.append(-offset[0])
        tracker.update(index, list(boxes), shift)
        for track in tracker.tracks:
            if track.last_frame != index:
                continue
            world.setdefault(track.id, []).append(_shift_box(track.box, offset[0], offset[1]))
            frames_of.setdefault(track.id, set()).add(index)
            scores.setdefault(track.id, []).append(track.box[4])
        strong = [b for b in boxes if b[4] >= p.high_threshold]
        o, c = frame_occlusion(boxes, p.high_threshold)
        occluded += o
        considered += c
        boxes_total += len(strong)
        small += sum(1 for b in strong if (b[3] - b[1]) < SMALL_HEIGHT_FRACTION * height)

    candidates = [t for t in tracker.confirmed_tracks() if t.hits >= PEN_MIN_HITS]
    medians = {t.id: tuple(median(b[k] for b in world[t.id]) for k in range(4)) for t in candidates}

    # Unión conservadora (union-find) de tracks que nunca coexistieron y ocupan el mismo lugar.
    parent = {t.id: t.id for t in candidates}

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    members: dict[int, set[int]] = {t.id: {t.id} for t in candidates}
    ordered = sorted(candidates, key=lambda t: t.id)
    for i, a in enumerate(ordered):
        for b in ordered[i + 1 :]:
            ra, rb = find(a.id), find(b.id)
            if ra == rb:
                continue
            frames_a = set().union(*(frames_of[m] for m in members[ra]))
            frames_b = set().union(*(frames_of[m] for m in members[rb]))
            if frames_a & frames_b:
                continue  # vistos a la vez: animales distintos
            wa, wb = medians[a.id], medians[b.id]
            box_a = (*wa, 1.0)
            box_b = (*wb, 1.0)
            if (
                iou(box_a, box_b) >= MERGE_MIN_IOU
                or _center_distance(wa, wb) <= MERGE_MAX_CENTER_DISTANCE
            ):
                parent[rb] = ra
                members[ra] |= members.pop(rb)

    roots = sorted({find(t.id) for t in candidates})
    group_of = {root: n for n, root in enumerate(roots)}
    unique_groups = len(roots)
    # Máximo de animales CONTADOS a la vez en un cuadro (las detecciones espurias no cuentan).
    presence: dict[int, int] = {}
    for t in candidates:
        for f in frames_of[t.id]:
            presence[f] = presence.get(f, 0) + 1
    max_simultaneous = max(presence.values(), default=0)
    observed = unique_groups

    span_x = (max(camera_x) - min(camera_x)) if camera_x else 0.0
    travel_x = sum(abs(s[0]) for s in shifts) if shifts else 0.0
    coverage_views = round((span_x + width) / width, 2) if width else 1.0
    revisit_ratio = round(max(0.0, travel_x - span_x) / span_x, 2) if span_x > width * 0.1 else 0.0

    # Animales cortados en los extremos del área recorrida: el grupo probablemente sigue afuera.
    if candidates and camera_x:
        left_edge = min(camera_x) + EDGE_FRACTION * width
        right_edge = max(camera_x) + width - EDGE_FRACTION * width
        edge_animals = sum(
            1 for t in candidates if medians[t.id][0] <= left_edge or medians[t.id][2] >= right_edge
        )
    else:
        edge_animals = 0

    tracks = [
        PenTrack(
            id=t.id,
            hits=t.hits,
            first_frame=t.first_frame,
            last_frame=t.last_frame,
            world_box=tuple(round(v, 1) for v in medians[t.id]),  # type: ignore[arg-type]
            mean_score=round(sum(scores[t.id]) / len(scores[t.id]), 3),
            group=group_of[find(t.id)],
        )
        for t in ordered
    ]
    confidence = round(sum(t.mean_score for t in tracks) / len(tracks), 3) if tracks else 0.0
    return PenCount(
        observed=observed,
        unique_groups=unique_groups,
        tracks_counted=len(candidates),
        merged_tracks=len(candidates) - unique_groups,
        max_simultaneous=max_simultaneous,
        coverage_views=coverage_views,
        revisit_ratio=revisit_ratio,
        occlusion_ratio=round(occluded / considered, 3) if considered else 0.0,
        small_animal_ratio=round(small / boxes_total, 3) if boxes_total else 0.0,
        edge_animals=edge_animals,
        tracks=tracks,
        confidence=confidence,
    )
