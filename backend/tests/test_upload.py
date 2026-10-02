"""Upload defaults (machine profile recognition, project name), the thumbnail
endpoint, renaming and the header fields the parser reads."""

from __future__ import annotations

from tests.conftest import _synthetic_odx, decanter_document


def test_upload_falls_back_to_the_generic_profile(client):
    odx = _synthetic_odx(header_path="random\\machine")
    resp = client.post(
        "/api/projects",
        files={"file": ("random.odx", odx, "application/octet-stream")},
        data={"name": "Unknown"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["machine_profile_id"] is None
    assert body["detected_profile_id"] is None
    assert body["machine_name"] == "Generic (rotor speed only)"


def test_upload_explicit_profile_overrides_detection(client, peaky_odx_bytes, decanter_profile):
    other = client.post(
        "/api/machines/profiles",
        json={"data": decanter_document(name="Other", match_patterns=[])},
    ).json()
    resp = client.post(
        "/api/projects",
        files={"file": ("Test Decanter weekly.odx", peaky_odx_bytes, "application/octet-stream")},
        data={"name": "Override", "machine_profile_id": str(other["id"])},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["machine_profile_id"] == other["id"]
    assert body["detected_profile_id"] == decanter_profile["id"]  # still recorded


def test_detection_prefers_the_most_specific_pattern(client, peaky_odx_bytes):
    for name, pattern in (("Broad", "decanter"), ("Narrow", "example decanter")):
        client.post(
            "/api/machines/profiles",
            json={"data": decanter_document(name=name, match_patterns=[pattern])},
        )
    resp = client.post(
        "/api/projects",
        files={"file": ("Example decanter - 1A.odx", peaky_odx_bytes, "application/octet-stream")},
    )
    assert resp.json()["machine_name"] == "Narrow"


def test_upload_default_name_from_header_path(client, peaky_odx_bytes):
    # peaky fixture has #Path "test\\peaky"
    resp = client.post(
        "/api/projects",
        files={"file": ("peaky.odx", peaky_odx_bytes, "application/octet-stream")},
        data={},  # no name provided
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "test / peaky"
    assert body["odx_header_path"] == "test\\peaky"


def test_upload_default_name_from_filename(client):
    odx = _synthetic_odx(header_path="")  # no header path
    resp = client.post(
        "/api/projects",
        files={"file": ("My run-up.odx", odx, "application/octet-stream")},
        data={},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "My run-up"


def test_thumbnail_endpoint_returns_normalised_matrix(client, peaky_odx_bytes):
    create = client.post(
        "/api/projects",
        files={"file": ("p.odx", peaky_odx_bytes, "application/octet-stream")},
        data={"name": "Thumb"},
    )
    pid = create.json()["id"]
    resp = client.get(f"/api/projects/{pid}/thumbnail?n_blocks=12&n_bins=32")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["project_id"] == pid
    assert body["n_blocks"] <= 12
    assert body["bin_count"] <= 32
    assert len(body["z_matrix"]) == body["n_blocks"]
    assert len(body["z_matrix"][0]) == body["bin_count"]
    flat = [v for row in body["z_matrix"] for v in row]
    assert min(flat) >= 0.0
    assert max(flat) <= 1.0 + 1e-9
    assert max(flat) > 0.5  # peaky file should have a peak near 1.0


def test_thumbnail_404_for_other_user_project(unauthed_client, peaky_odx_bytes):
    a = unauthed_client.post(
        "/api/auth/register",
        json={"email": "a@x.com", "name": "A", "password": "alpha-pwd-123"},
    ).json()
    b = unauthed_client.post(
        "/api/auth/register",
        json={"email": "b@x.com", "name": "B", "password": "bravo-pwd-123"},
    ).json()
    create = unauthed_client.post(
        "/api/projects",
        files={"file": ("p.odx", peaky_odx_bytes, "application/octet-stream")},
        data={"name": "A's"},
        headers={"Authorization": f"Bearer {a['access_token']}"},
    )
    pid = create.json()["id"]
    resp = unauthed_client.get(
        f"/api/projects/{pid}/thumbnail",
        headers={"Authorization": f"Bearer {b['access_token']}"},
    )
    assert resp.status_code == 404


def test_patch_project_renames(client, peaky_odx_bytes):
    create = client.post(
        "/api/projects",
        files={"file": ("p.odx", peaky_odx_bytes, "application/octet-stream")},
        data={"name": "Old name"},
    )
    pid = create.json()["id"]
    resp = client.patch(f"/api/projects/{pid}", json={"name": "Brand new name"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Brand new name"


def test_odx_parser_extracts_header_fields(peaky_odx_bytes):
    from app.io.odx_parser import parse_odx

    parsed = parse_odx(peaky_odx_bytes)
    assert parsed.header_path == "test\\peaky"
    assert parsed.header_format_version == "250"
    assert parsed.header_export_human and "2026" in parsed.header_export_human
