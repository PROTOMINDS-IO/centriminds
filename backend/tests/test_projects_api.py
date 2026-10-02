"""Tests for the /api/projects CRUD endpoints."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


def _upload(
    client: TestClient,
    odx_bytes: bytes,
    name: str = "Run 001",
    **extra_form: str,
) -> dict:
    form = {
        "name": name,
        "notes_markdown": "",
        "unit": "mm/s",
        **extra_form,
    }
    resp = client.post(
        "/api/projects",
        data=form,
        files={"file": ("run001.odx", odx_bytes, "application/octet-stream")},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_create_project_parses_and_persists(client: TestClient, synthetic_odx_bytes: bytes) -> None:
    created = _upload(client, synthetic_odx_bytes)
    assert created["id"] >= 1
    assert created["name"] == "Run 001"
    assert created["machine_profile_id"] is None
    assert created["machine_parameters"] == {}
    assert created["status"] == "new"
    assert created["n_blocks"] == 3
    assert created["bin_count"] == 8
    assert created["freq_min_hz"] == 0.0
    assert created["freq_max_hz"] == 3.5
    assert created["freq_step_hz"] == 0.5
    assert created["rpm_min"] == 1000.0
    assert created["rpm_max"] == 1200.0
    assert len(created["odx_hash"]) == 64


def test_create_project_rejects_unknown_profile(
    client: TestClient, synthetic_odx_bytes: bytes
) -> None:
    resp = client.post(
        "/api/projects",
        data={"name": "bad", "machine_profile_id": "4242", "unit": "mm/s"},
        files={"file": ("x.odx", synthetic_odx_bytes, "application/octet-stream")},
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "profile_not_found"


def test_create_project_rejects_bad_direction(
    client: TestClient, synthetic_odx_bytes: bytes
) -> None:
    resp = client.post(
        "/api/projects",
        data={
            "name": "bad-dir",
            "unit": "mm/s",
            "sensor_direction": "sideways",
        },
        files={"file": ("x.odx", synthetic_odx_bytes, "application/octet-stream")},
    )
    assert resp.status_code == 400
    assert "sensor_direction" in resp.json()["detail"]


def test_create_project_rejects_malformed_odx(client: TestClient) -> None:
    resp = client.post(
        "/api/projects",
        data={"name": "bad", "unit": "mm/s"},
        files={"file": ("x.odx", b"not an odx file", "application/octet-stream")},
    )
    assert resp.status_code == 400
    assert ".odx parse failed" in resp.json()["detail"]


def test_create_project_writes_odx_to_data_dir(
    client: TestClient, synthetic_odx_bytes: bytes, tmp_path: Path
) -> None:
    created = _upload(client, synthetic_odx_bytes)
    odx_path = tmp_path / "data" / "odx" / f"{created['id']}.odx"
    assert odx_path.is_file()
    assert odx_path.read_bytes() == synthetic_odx_bytes


def test_list_projects_returns_created_rows(client: TestClient, synthetic_odx_bytes: bytes) -> None:
    _upload(client, synthetic_odx_bytes, name="Run A")
    _upload(client, synthetic_odx_bytes, name="Run B")
    resp = client.get("/api/projects")
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()]
    assert set(names) == {"Run A", "Run B"}


def test_get_project_detail_includes_metadata(
    client: TestClient, synthetic_odx_bytes: bytes
) -> None:
    created = _upload(
        client,
        synthetic_odx_bytes,
        sensor_location="Bowl bearing",
        sensor_direction="radial",
        operator="Alice",
        site="Plant 3",
    )
    resp = client.get(f"/api/projects/{created['id']}")
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["measurement_metadata"]["sensor_location"] == "Bowl bearing"
    assert detail["measurement_metadata"]["sensor_direction"] == "radial"
    assert detail["measurement_metadata"]["operator"] == "Alice"
    assert len(detail["analysis_inputs_hash"]) == 16


def test_get_project_404(client: TestClient) -> None:
    resp = client.get("/api/projects/99999")
    assert resp.status_code == 404


def test_patch_project_updates_notes_and_status(
    client: TestClient, synthetic_odx_bytes: bytes
) -> None:
    created = _upload(client, synthetic_odx_bytes)
    resp = client.patch(
        f"/api/projects/{created['id']}",
        json={"notes_markdown": "# Findings\nAll good", "status": "reviewed"},
    )
    assert resp.status_code == 200, resp.text
    detail = resp.json()
    assert detail["notes_markdown"].startswith("# Findings")
    assert detail["status"] == "reviewed"


def test_patch_project_rejects_bad_status(client: TestClient, synthetic_odx_bytes: bytes) -> None:
    created = _upload(client, synthetic_odx_bytes)
    resp = client.patch(
        f"/api/projects/{created['id']}",
        json={"status": "pending_review"},
    )
    assert resp.status_code == 400


def test_patch_project_sets_profile_and_parameters(
    client: TestClient, synthetic_odx_bytes: bytes, decanter_profile: dict
) -> None:
    created = _upload(client, synthetic_odx_bytes)
    url = f"/api/projects/{created['id']}"
    before = client.get(url).json()["analysis_inputs_hash"]

    resp = client.patch(url, json={"machine_profile_id": decanter_profile["id"]})
    assert resp.status_code == 200, resp.text
    assert resp.json()["machine_name"] == "Test decanter"
    after_profile = resp.json()["analysis_inputs_hash"]
    assert after_profile != before

    resp = client.patch(url, json={"machine_parameters": {"d": 9.3}})
    assert resp.json()["machine_parameters"] == {"d": 9.3}
    assert resp.json()["analysis_inputs_hash"] != after_profile
    # Replaced as a whole: {} goes back to the profile's values.
    assert client.patch(url, json={"machine_parameters": {}}).json()["machine_parameters"] == {}

    resp = client.patch(url, json={"machine_profile_id": None})
    assert resp.json()["machine_profile_id"] is None
    assert resp.json()["machine_name"] == "Generic (rotor speed only)"

    assert client.patch(url, json={"machine_profile_id": 99999}).status_code == 404
    assert client.patch(url, json={"machine_parameters": {"d": "fast"}}).status_code == 422


def test_patch_project_updates_metadata(client: TestClient, synthetic_odx_bytes: bytes) -> None:
    created = _upload(client, synthetic_odx_bytes)
    resp = client.patch(
        f"/api/projects/{created['id']}",
        json={"measurement_metadata": {"sensor_location": "Scroll end"}},
    )
    assert resp.status_code == 200
    assert resp.json()["measurement_metadata"]["sensor_location"] == "Scroll end"


def test_patch_project_keeps_a_unit(client: TestClient, synthetic_odx_bytes: bytes) -> None:
    created = _upload(client, synthetic_odx_bytes)
    url = f"/api/projects/{created['id']}"
    for cleared in (None, "  "):
        resp = client.patch(url, json={"measurement_metadata": {"unit": cleared}})
        assert resp.status_code == 422, resp.text
    resp = client.patch(url, json={"measurement_metadata": {"unit": " in/s "}})
    assert resp.status_code == 200, resp.text
    assert resp.json()["measurement_metadata"]["unit"] == "in/s"


def test_patch_project_404(client: TestClient) -> None:
    resp = client.patch("/api/projects/42", json={"name": "x"})
    assert resp.status_code == 404


def test_delete_project_removes_row_and_file(
    client: TestClient, synthetic_odx_bytes: bytes, tmp_path: Path
) -> None:
    created = _upload(client, synthetic_odx_bytes)
    odx_path = tmp_path / "data" / "odx" / f"{created['id']}.odx"
    assert odx_path.is_file()
    assert [p.name for p in odx_path.parent.iterdir()] == [odx_path.name]  # no temp files

    resp = client.delete(f"/api/projects/{created['id']}")
    assert resp.status_code == 200
    assert resp.json() == {"deleted": 1}

    assert not odx_path.is_file()
    follow = client.get(f"/api/projects/{created['id']}")
    assert follow.status_code == 404


def test_failed_file_write_leaves_no_project(
    client: TestClient, synthetic_odx_bytes: bytes, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import projects

    def disk_full(path: Path, content: bytes) -> None:
        raise OSError("No space left on device")

    monkeypatch.setattr(projects, "_write_atomic", disk_full)
    with pytest.raises(OSError):
        client.post(
            "/api/projects",
            data={"name": "x"},
            files={"file": ("run.odx", synthetic_odx_bytes, "application/octet-stream")},
        )
    monkeypatch.undo()
    assert client.get("/api/projects").json() == []


def test_delete_missing_project_returns_zero(client: TestClient) -> None:
    resp = client.delete("/api/projects/9001")
    assert resp.status_code == 200
    assert resp.json() == {"deleted": 0}


def test_health_endpoint(client: TestClient) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_same_file_can_be_uploaded_twice(client, synthetic_odx_bytes):
    for name in ("First", "Second"):
        resp = client.post(
            "/api/projects",
            data={"name": name},
            files={"file": ("same.odx", synthetic_odx_bytes, "application/octet-stream")},
        )
        assert resp.status_code == 201, resp.text
    assert len(client.get("/api/projects").json()) == 2
