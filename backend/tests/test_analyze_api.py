"""Tests for /api/projects/{id}/analyze, /analyses, /annotations."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _profile(decanter_profile: dict) -> None:
    """Every upload here is a "Test decanter" run (recognised from its name)."""


def _upload(client: TestClient, odx_bytes: bytes, name: str = "Run 001") -> dict:
    resp = client.post(
        "/api/projects",
        data={"name": name, "unit": "mm/s"},
        files={"file": ("Test Decanter run.odx", odx_bytes, "application/octet-stream")},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _analyse(client: TestClient, project_id: int, **body: object) -> dict:
    """Run the analysis; the stored run it created."""
    resp = client.post(f"/api/projects/{project_id}/analyze", json=body or None)
    assert resp.status_code == 201, resp.text
    run = client.get(f"/api/projects/{project_id}/analyses/{resp.json()['run_id']}")
    assert run.status_code == 200, run.text
    return run.json()


def test_analyze_runs_full_pipeline_and_persists(
    client: TestClient, peaky_odx_bytes: bytes
) -> None:
    created = _upload(client, peaky_odx_bytes)
    resp = client.post(f"/api/projects/{created['id']}/analyze")
    assert resp.status_code == 201, resp.text
    body = resp.json()

    assert set(body) == {"project_id", "run_id", "version", "created_at", "annotations_created"}
    assert body["project_id"] == created["id"]
    run = client.get(f"/api/projects/{created['id']}/analyses/{body['run_id']}").json()
    assert (run["type"], run["version"], run["created_at"]) == (
        "physics",
        body["version"],
        body["created_at"],
    )
    physics = run["results"]
    assert physics["peaks"]
    sev = physics["severity"]
    assert sev["zone"] in {"good", "usable", "alarm", "shutdown"}
    assert sev["diameter_class"] == "lt350"  # the profile has no diameter
    assert len(sev["trend_rpm"]) == len(sev["trend_mm_s"]) > 0
    modes = physics["structural_modes"]
    assert modes and modes[0]["freq_hz"] == pytest.approx(9.2)
    assert modes[0]["crossing_component"] == "bowl"
    machine = physics["machine"]
    assert machine["name"] == "Test decanter"
    assert [c["key"] for c in machine["components"]][:2] == ["bowl", "scroll"]
    assert physics["order_lines"]
    # The amplitude tracks stay internal: a run keeps each line's peak.
    assert not {"track_rpm", "track_amp"} & set(physics["order_lines"][0])
    assert "peak_amp" in physics["order_lines"][0]
    comp = physics["component_lines"]
    assert set(comp["freq_hz"]) >= {"bowl", "scroll", "mains"}
    assert len(comp["freq_hz"]["scroll"]) == len(comp["rpm"])
    # The peaky fixture's 73.5 Hz peak is in every spectrum.
    [line] = physics["stationary_lines"]
    assert (line["freq_hz"], line["kind"]) == (73.5, "unexplained")
    assert body["annotations_created"] >= 1
    detail = client.get(f"/api/projects/{created['id']}").json()
    assert run["params"]["inputs_hash"] == detail["analysis_inputs_hash"]

    # Project status flips new → annotated.
    assert detail["status"] == "annotated"


def test_analyze_attributes_bowl_peak_at_3000_rpm(
    client: TestClient, peaky_odx_bytes: bytes
) -> None:
    created = _upload(client, peaky_odx_bytes)
    physics = _analyse(client, created["id"])["results"]
    bowl_peaks = [p for p in physics["peaks"] if p["source_id"] == "bowl"]
    assert bowl_peaks
    # The 3000 RPM block should hit bowl 1× exactly at 50.0 Hz.
    perfect = [p for p in bowl_peaks if p["rpm"] == 3000.0 and p["harmonic"] == 1]
    assert perfect
    assert perfect[0]["confidence"] >= 0.95


def test_analyze_404_for_missing_project(client: TestClient) -> None:
    resp = client.post("/api/projects/12345/analyze")
    assert resp.status_code == 404


def test_analyze_replaces_prior_auto_annotations(
    client: TestClient, peaky_odx_bytes: bytes
) -> None:
    created = _upload(client, peaky_odx_bytes)
    client.post(f"/api/projects/{created['id']}/analyze")
    first = client.get(
        f"/api/projects/{created['id']}/annotations",
        params={"author": "auto_physics"},
    ).json()
    assert first
    # Re-running should not duplicate them.
    client.post(f"/api/projects/{created['id']}/analyze")
    second = client.get(
        f"/api/projects/{created['id']}/annotations",
        params={"author": "auto_physics"},
    ).json()
    assert len(second) == len(first)


def test_list_analyses_returns_runs_latest_first(
    client: TestClient, peaky_odx_bytes: bytes
) -> None:
    created = _upload(client, peaky_odx_bytes)
    client.post(f"/api/projects/{created['id']}/analyze")
    client.post(f"/api/projects/{created['id']}/analyze")
    resp = client.get(f"/api/projects/{created['id']}/analyses")
    assert resp.status_code == 200
    runs = resp.json()
    # One run per invocation.
    assert len(runs) == 2
    timestamps = [r["created_at"] for r in runs]
    assert timestamps == sorted(timestamps, reverse=True)


def test_list_analyses_filter_by_type(client: TestClient, peaky_odx_bytes: bytes) -> None:
    created = _upload(client, peaky_odx_bytes)
    client.post(f"/api/projects/{created['id']}/analyze")
    resp = client.get(
        f"/api/projects/{created['id']}/analyses",
        params={"type": "physics"},
    )
    runs = resp.json()
    assert {r["type"] for r in runs} == {"physics"}


def test_list_analyses_rejects_bad_type(client: TestClient, peaky_odx_bytes: bytes) -> None:
    created = _upload(client, peaky_odx_bytes)
    resp = client.get(
        f"/api/projects/{created['id']}/analyses",
        params={"type": "banana"},
    )
    assert resp.status_code == 400


def test_get_analysis_by_id(client: TestClient, peaky_odx_bytes: bytes) -> None:
    created = _upload(client, peaky_odx_bytes)
    run_id = client.post(f"/api/projects/{created['id']}/analyze").json()["run_id"]
    resp = client.get(f"/api/projects/{created['id']}/analyses/{run_id}")
    assert resp.status_code == 200
    fetched = resp.json()
    assert fetched["id"] == run_id
    assert fetched["results"]["peaks"]


def test_get_analysis_404_for_wrong_project(client: TestClient, peaky_odx_bytes: bytes) -> None:
    a = _upload(client, peaky_odx_bytes, name="A")
    b = _upload(client, peaky_odx_bytes, name="B")
    run_id = client.post(f"/api/projects/{a['id']}/analyze").json()["run_id"]
    resp = client.get(f"/api/projects/{b['id']}/analyses/{run_id}")
    assert resp.status_code == 404


def test_list_annotations_filters_by_author(client: TestClient, peaky_odx_bytes: bytes) -> None:
    created = _upload(client, peaky_odx_bytes)
    client.post(f"/api/projects/{created['id']}/analyze")
    resp = client.get(
        f"/api/projects/{created['id']}/annotations",
        params={"author": "auto_physics"},
    )
    assert resp.status_code == 200
    anns = resp.json()
    assert anns
    assert all(a["author"] == "auto_physics" for a in anns)


def test_list_annotations_filters_by_type(client: TestClient, peaky_odx_bytes: bytes) -> None:
    created = _upload(client, peaky_odx_bytes)
    client.post(f"/api/projects/{created['id']}/analyze")
    resp = client.get(
        f"/api/projects/{created['id']}/annotations",
        params={"annotation_type": "stationary_line"},
    )
    assert resp.status_code == 200
    anns = resp.json()
    assert anns
    assert all(a["annotation_type"] == "stationary_line" for a in anns)


def test_list_annotations_rejects_bad_filter(client: TestClient, peaky_odx_bytes: bytes) -> None:
    created = _upload(client, peaky_odx_bytes)
    resp = client.get(
        f"/api/projects/{created['id']}/annotations",
        params={"author": "ghost"},
    )
    assert resp.status_code == 400


def test_analyze_uses_project_bowl_diameter(client: TestClient, peaky_odx_bytes: bytes) -> None:
    created = _upload(client, peaky_odx_bytes)
    resp = client.patch(f"/api/projects/{created['id']}", json={"bowl_diameter_mm": 1000})
    assert resp.json()["bowl_diameter_mm"] == 1000
    physics = _analyse(client, created["id"])["results"]
    assert physics["severity"]["diameter_class"] == "lt1200"

    # Explicit null clears it again.
    resp = client.patch(f"/api/projects/{created['id']}", json={"bowl_diameter_mm": None})
    assert resp.json()["bowl_diameter_mm"] is None


@pytest.mark.parametrize(
    "params",
    [
        {"spectrum_amplitude": "dB"},
        {"max_harmonic": 100_000_000},  # would allocate millions of harmonics
        {"prominence_ratio": 0},
        {"no_such_param": 1},
        {"severity_band_lo_hz": 400, "severity_band_hi_hz": 400},
    ],
)
def test_analyze_rejects_bad_params(
    client: TestClient, peaky_odx_bytes: bytes, params: dict
) -> None:
    created = _upload(client, peaky_odx_bytes)
    resp = client.post(f"/api/projects/{created['id']}/analyze", json={"params": params})
    assert resp.status_code == 422


def test_analyze_applies_param_overrides(client: TestClient, peaky_odx_bytes: bytes) -> None:
    created = _upload(client, peaky_odx_bytes)
    run = _analyse(client, created["id"], params={"max_harmonic": 3})
    assert run["params"]["max_harmonic"] == 3
    assert run["params"]["prominence_ratio"] == 0.05  # defaults kept


def test_analyze_refuses_spectra_without_rating_band(
    client: TestClient, synthetic_odx_bytes: bytes
) -> None:
    # The synthetic export spans 0-3.5 Hz: nothing in 10-1000 Hz to rate.
    created = _upload(client, synthetic_odx_bytes)
    resp = client.post(f"/api/projects/{created['id']}/analyze")
    assert resp.status_code == 422
    assert "between 10 and 1000 Hz" in resp.json()["detail"]
    assert "cannot be rated" in resp.json()["detail"]


def test_project_list_carries_latest_severity(client: TestClient, peaky_odx_bytes: bytes) -> None:
    created = _upload(client, peaky_odx_bytes)
    row = next(p for p in client.get("/api/projects").json() if p["id"] == created["id"])
    assert row["severity_zone"] is None

    severity = _analyse(client, created["id"])["results"]["severity"]
    row = next(p for p in client.get("/api/projects").json() if p["id"] == created["id"])
    assert row["severity_zone"] == severity["zone"]
    assert row["severity_mm_s"] == pytest.approx(severity["velocity_mm_s"])


def test_list_analyses_limit_returns_newest_only(
    client: TestClient, peaky_odx_bytes: bytes
) -> None:
    created = _upload(client, peaky_odx_bytes)
    client.post(f"/api/projects/{created['id']}/analyze")
    newest = client.post(f"/api/projects/{created['id']}/analyze").json()["run_id"]
    runs = client.get(
        f"/api/projects/{created['id']}/analyses", params={"type": "physics", "limit": 1}
    ).json()
    assert [r["id"] for r in runs] == [newest]


def test_analysis_uses_the_projects_parameters(client: TestClient, peaky_odx_bytes: bytes) -> None:
    created = _upload(client, peaky_odx_bytes)
    client.patch(f"/api/projects/{created['id']}", json={"machine_parameters": {"d": 300}})
    physics = _analyse(client, created["id"])["results"]
    assert physics["machine"]["parameters"]["d"] == 300
    # The scroll at n + 300 rpm (5 Hz above the bowl) is its own line now.
    leads = [ln["members"][0] for ln in physics["order_lines"]]
    assert {"component": "bowl", "order": 1} in leads
    assert {"component": "scroll", "order": 1} in leads


def test_analysis_reports_a_formula_that_fails(client: TestClient, peaky_odx_bytes: bytes) -> None:
    from tests.conftest import decanter_document

    doc = decanter_document(name="Broken", match_patterns=["broken"])
    doc["components"][1]["speed_rpm"] = "n / (n - 2000)"
    profile = client.post("/api/machines/profiles", json={"data": doc}).json()
    created = _upload(client, peaky_odx_bytes)
    client.patch(f"/api/projects/{created['id']}", json={"machine_profile_id": profile["id"]})
    resp = client.post(f"/api/projects/{created['id']}/analyze")
    assert resp.status_code == 422
    assert resp.json()["code"] == "profile_formula_error"
    assert "division by zero" in resp.json()["detail"]


def test_user_annotations_crud(client: TestClient, peaky_odx_bytes: bytes) -> None:
    created = _upload(client, peaky_odx_bytes)
    base = f"/api/projects/{created['id']}/annotations"
    zone = {
        "annotation_type": "band",
        "freq_hz": 62,
        "freq_hz_end": 78,
        "label": "Possible resonance",
        "color": "slot:2",
    }
    resp = client.post(base, json=zone)
    assert resp.status_code == 201, resp.text
    ann = resp.json()
    assert (ann["author"], ann["freq_hz"], ann["freq_hz_end"]) == ("user", 62, 78)

    note = {"annotation_type": "note", "freq_hz": 50, "rpm": 1500, "text": "Mains, not the bowl"}
    note_id = client.post(base, json=note).json()["id"]
    order = {"annotation_type": "order_line", "order": 0.5, "label": "Half-speed whirl"}
    assert client.post(base, json=order).json()["payload"] == {"order": 0.5}

    resp = client.put(f"{base}/{ann['id']}", json={**zone, "freq_hz": 60, "label": "Zone"})
    assert resp.status_code == 200
    assert (resp.json()["freq_hz"], resp.json()["label"]) == (60, "Zone")

    # Analyses keep them.
    client.post(f"/api/projects/{created['id']}/analyze")
    users = client.get(base, params={"author": "user"}).json()
    assert len(users) == 3
    assert next(a for a in users if a["id"] == note_id)["payload"]["text"] == "Mains, not the bowl"

    assert client.delete(f"{base}/{note_id}").json() == {"deleted": 1}
    assert client.delete(f"{base}/{note_id}").json() == {"deleted": 0}


@pytest.mark.parametrize(
    "body",
    [
        {"annotation_type": "band", "freq_hz": 70, "freq_hz_end": 60},
        {"annotation_type": "band", "freq_hz": 60},
        {"annotation_type": "note", "freq_hz": 60},
        {"annotation_type": "order_line"},
        {"annotation_type": "frequency_line", "freq_hz": 50, "color": "red"},
        {"annotation_type": "peak", "freq_hz": 50},
        {"annotation_type": "speed_line", "rpm": 1000, "rpm_end": 900},
    ],
)
def test_user_annotations_are_validated(
    client: TestClient, peaky_odx_bytes: bytes, body: dict
) -> None:
    created = _upload(client, peaky_odx_bytes)
    resp = client.post(f"/api/projects/{created['id']}/annotations", json=body)
    assert resp.status_code == 422, resp.text


def test_the_analysis_annotations_are_read_only(client: TestClient, peaky_odx_bytes: bytes) -> None:
    created = _upload(client, peaky_odx_bytes)
    client.post(f"/api/projects/{created['id']}/analyze")
    base = f"/api/projects/{created['id']}/annotations"
    auto = client.get(base, params={"author": "auto_physics"}).json()[0]
    resp = client.put(
        f"{base}/{auto['id']}", json={"annotation_type": "frequency_line", "freq_hz": 1}
    )
    assert (resp.status_code, resp.json()["code"]) == (403, "annotation_read_only")
    assert client.delete(f"{base}/{auto['id']}").status_code == 403
    assert (
        client.put(f"{base}/99999", json={"annotation_type": "speed_line", "rpm": 1}).status_code
        == 404
    )


def test_only_the_newest_runs_are_kept(client: TestClient, peaky_odx_bytes: bytes) -> None:
    from app.analysis.pipeline import KEPT_RUNS

    created = _upload(client, peaky_odx_bytes)
    ids = [
        client.post(f"/api/projects/{created['id']}/analyze").json()["run_id"]
        for _ in range(KEPT_RUNS + 2)
    ]
    runs = client.get(f"/api/projects/{created['id']}/analyses").json()
    assert [r["id"] for r in runs] == ids[::-1][:KEPT_RUNS]
