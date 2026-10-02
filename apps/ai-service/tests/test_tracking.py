"""Tracker del escáner: escenarios sintéticos compartidos con la web (misma verdad esperada)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from agro_vision.domain.tracking import ByteTracker, LineSpec, count_scan

FIXTURE = Path(__file__).parent / "fixtures" / "scanner-tracks.json"
SCENARIOS = json.loads(FIXTURE.read_text())["scenarios"]


def run(scenario: dict):
    return count_scan(
        [[tuple(b) for b in frame] for frame in scenario["frames"]],
        tuple(scenario["frame_size"]),
        line=LineSpec(**scenario["line"]),
        shifts=[tuple(s) for s in scenario["shifts"]] if scenario["shifts"] else None,
    )


@pytest.mark.parametrize("name", sorted(SCENARIOS))
def test_scenario_matches_ground_truth(name: str):
    scenario = SCENARIOS[name]
    result = run(scenario)
    expected = scenario["expected"]
    assert result.net_count == expected["net_count"]
    if "positive" in expected:
        assert result.positive_crossings == expected["positive"]
        assert result.negative_crossings == expected["negative"]


def test_unconfirmed_track_crossing_is_not_counted():
    tracker = ByteTracker((100, 100), line=LineSpec(position=0.5, hysteresis=0.0))
    tracker.update(0, [(40, 40, 48, 48, 0.9)])  # un solo cuadro: nunca se confirma
    for frame in range(1, 15):
        tracker.update(frame, [])
    assert tracker.events == []


def test_hysteresis_ignores_jitter_on_the_line():
    frames = [
        [(46 + (2 if i % 2 else -2), 40, 56 + (2 if i % 2 else -2), 50, 0.9)] for i in range(20)
    ]
    result = count_scan(frames, (100, 100), line=LineSpec(position=0.5, hysteresis=0.05))
    assert result.net_count == 0
    assert result.confirmed_tracks == 1


def test_low_confidence_detections_extend_but_never_open_tracks():
    frames = [[(10 + 8 * i, 40, 30 + 8 * i, 60, 0.25)] for i in range(12)]
    result = count_scan(frames, (100, 100))
    assert result.confirmed_tracks == 0
    assert result.net_count == 0
