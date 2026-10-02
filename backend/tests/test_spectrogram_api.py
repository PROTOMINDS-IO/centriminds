"""Tests for /api/projects/{id}/spectrogram and /spectrogram/preview."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


def _upload(client: TestClient, odx_bytes: bytes, name: str = "Run 001") -> dict:
    resp = client.post(
        "/api/projects",
        data={"name": name, "unit": "mm/s"},
        files={"file": ("run.odx", odx_bytes, "application/octet-stream")},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_full_spectrogram_returns_parsed_matrix(
    client: TestClient, synthetic_odx_bytes: bytes
) -> None:
    created = _upload(client, synthetic_odx_bytes)
    resp = client.get(f"/api/projects/{created['id']}/spectrogram")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["project_id"] == created["id"]
    assert data["n_blocks"] == 3
    assert data["bin_count"] == 8
    assert data["source_n_blocks"] == 3
    assert data["source_bin_count"] == 8
    assert data["freq_axis"] == [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]
    assert data["ref_speeds"] == [1000.0, 1100.0, 1200.0]
    assert data["ref_loads"] == [40.0, 41.0, 42.0]
    assert data["dates_unix"] == [1700000000, 1700000001, 1700000002]
    assert data["dates_human"] == ["Block 0", "Block 1", "Block 2"]

    z = data["z_matrix"]
    assert len(z) == 3 and all(len(row) == 8 for row in z)
    assert z[0][0] == 0.01
    assert z[0][7] == 0.08
    assert z[2][7] == 0.24


def test_spectrogram_404_for_missing_project(client: TestClient) -> None:
    resp = client.get("/api/projects/99999/spectrogram")
    assert resp.status_code == 404


def test_spectrogram_404_when_odx_file_missing(
    client: TestClient, synthetic_odx_bytes: bytes, tmp_path: Path
) -> None:
    created = _upload(client, synthetic_odx_bytes)
    odx_path = tmp_path / "data" / "odx" / f"{created['id']}.odx"
    odx_path.unlink()
    resp = client.get(f"/api/projects/{created['id']}/spectrogram")
    assert resp.status_code == 404
    assert "missing" in resp.json()["detail"].lower()


def test_preview_returns_full_when_caps_exceed_actual(
    client: TestClient, synthetic_odx_bytes: bytes
) -> None:
    created = _upload(client, synthetic_odx_bytes)
    resp = client.get(
        f"/api/projects/{created['id']}/spectrogram/preview",
        params={"max_blocks": 100, "max_bins": 100},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["n_blocks"] == 3
    assert data["bin_count"] == 8
    assert data["source_n_blocks"] == 3
    assert data["source_bin_count"] == 8
    assert data["freq_axis"] == [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]
    assert data["z_matrix"][0][0] == 0.01


def test_preview_strides_block_axis(client: TestClient, synthetic_odx_bytes: bytes) -> None:
    created = _upload(client, synthetic_odx_bytes)
    resp = client.get(
        f"/api/projects/{created['id']}/spectrogram/preview",
        params={"max_blocks": 2, "max_bins": 100},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["n_blocks"] == 2
    assert data["bin_count"] == 8
    assert data["source_n_blocks"] == 3
    # 2 evenly-spaced indices over [0, 2] → [0, 2], so blocks 0 and 2 survive.
    assert data["ref_speeds"] == [1000.0, 1200.0]
    assert data["ref_loads"] == [40.0, 42.0]
    assert data["dates_human"] == ["Block 0", "Block 2"]


def test_preview_maxpool_frequency_axis(client: TestClient, synthetic_odx_bytes: bytes) -> None:
    created = _upload(client, synthetic_odx_bytes)
    resp = client.get(
        f"/api/projects/{created['id']}/spectrogram/preview",
        params={"max_blocks": 100, "max_bins": 4},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["n_blocks"] == 3
    assert data["bin_count"] == 4
    assert data["source_bin_count"] == 8
    # 8 → 4 buckets, each pair of bins max-pooled.
    # block 0 source: 0.01 0.02 | 0.03 0.04 | 0.05 0.06 | 0.07 0.08
    assert data["z_matrix"][0] == [0.02, 0.04, 0.06, 0.08]
    # block 2 source: 0.03 0.06 | 0.09 0.12 | 0.15 0.18 | 0.21 0.24
    assert data["z_matrix"][2] == [0.06, 0.12, 0.18, 0.24]
    # axis values are bucket means: mean(0.0,0.5)=0.25, mean(1.0,1.5)=1.25, ...
    assert data["freq_axis"] == [0.25, 1.25, 2.25, 3.25]


def test_preview_rejects_zero_caps(client: TestClient, synthetic_odx_bytes: bytes) -> None:
    created = _upload(client, synthetic_odx_bytes)
    resp = client.get(
        f"/api/projects/{created['id']}/spectrogram/preview",
        params={"max_blocks": 0, "max_bins": 4},
    )
    assert resp.status_code == 422


def test_preview_404_for_missing_project(client: TestClient) -> None:
    resp = client.get("/api/projects/77777/spectrogram/preview")
    assert resp.status_code == 404


def test_preview_default_caps_are_applied(client: TestClient, synthetic_odx_bytes: bytes) -> None:
    """Without query parameters, a small input still comes back in full."""
    created = _upload(client, synthetic_odx_bytes)
    resp = client.get(f"/api/projects/{created['id']}/spectrogram/preview")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["n_blocks"] == 3
    assert data["bin_count"] == 8


def test_parsed_file_is_cached_between_requests(
    client: TestClient, synthetic_odx_bytes: bytes, monkeypatch
) -> None:
    from app.analysis import spectrogram as spec_mod

    calls = []
    real_parse = spec_mod.parse_odx
    monkeypatch.setattr(spec_mod, "parse_odx", lambda p: calls.append(p) or real_parse(p))

    pid = _upload(client, synthetic_odx_bytes)["id"]
    spec_mod._cache.clear()  # the upload primed it; start cold
    for url in (
        f"/api/projects/{pid}/spectrogram",
        f"/api/projects/{pid}/spectrogram/preview",
        f"/api/projects/{pid}/thumbnail",
    ):
        assert client.get(url).status_code == 200
    assert len(calls) == 1


def test_upload_primes_the_cache(
    client: TestClient, synthetic_odx_bytes: bytes, monkeypatch
) -> None:
    from app.analysis import spectrogram as spec_mod

    calls = []
    monkeypatch.setattr(spec_mod, "parse_odx", lambda p: calls.append(p))
    pid = _upload(client, synthetic_odx_bytes)["id"]
    assert client.get(f"/api/projects/{pid}/spectrogram/preview").status_code == 200
    assert calls == []


def test_thumbnail_rows_are_ordered_by_speed(client: TestClient) -> None:
    from tests.conftest import _synthetic_odx

    # A coast-down: file order 1200 → 1100 → 1000 rpm, amplitude rising with
    # file order, so the slowest block is the loudest.
    raw = _synthetic_odx(n_blocks=3).decode()
    raw = raw.replace("1000.0", "@").replace("1200.0", "1000.0").replace("@", "1200.0")
    pid = _upload(client, raw.encode())["id"]
    body = client.get(f"/api/projects/{pid}/thumbnail?n_blocks=4&n_bins=8").json()
    first, last = max(body["z_matrix"][0]), max(body["z_matrix"][-1])
    assert first == 1.0  # lowest speed first
    assert last < first
