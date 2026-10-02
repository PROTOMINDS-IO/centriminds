"""The /api/machines endpoints: profiles, imports, templates, checks."""

from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import decanter_document
from tests.test_machine_speeds_xlsx import _cyclo_rows, _workbook


def _upload(client: TestClient, odx: bytes, filename: str, **form: Any) -> dict:
    resp = client.post(
        "/api/projects",
        data={"name": filename, **form},
        files={"file": (filename, odx, "application/octet-stream")},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _other_user(client: TestClient) -> dict[str, str]:
    """A second account's bearer header (the request carries no other)."""
    token = client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "other-password-1"},
        headers={"Authorization": ""},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_lists_the_generic_built_in_first(client: TestClient) -> None:
    rows = client.get("/api/machines/profiles").json()
    assert len(rows) == 1
    generic = rows[0]
    assert generic["builtin"] is True
    assert generic["name"] == "Generic (rotor speed only)"
    assert [c["key"] for c in generic["data"]["components"]] == ["rotor", "mains"]


def test_create_read_replace_delete(client: TestClient) -> None:
    created = client.post("/api/machines/profiles", json={"data": decanter_document()})
    assert created.status_code == 201, created.text
    profile = created.json()
    assert profile["builtin"] is False
    assert profile["data"]["format"] == "centriminds.machine-profile"
    assert profile["assigned_projects"] == 0
    pid = profile["id"]

    assert client.get(f"/api/machines/profiles/{pid}").json()["name"] == "Test decanter"
    resp = client.put(
        f"/api/machines/profiles/{pid}", json={"data": decanter_document(name="Renamed")}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Renamed"
    names = [p["name"] for p in client.get("/api/machines/profiles").json()]
    assert names == ["Generic (rotor speed only)", "Renamed"]

    assert client.delete(f"/api/machines/profiles/{pid}").json() == {"deleted": 1}
    assert client.delete(f"/api/machines/profiles/{pid}").json() == {"deleted": 0}
    assert client.get(f"/api/machines/profiles/{pid}").status_code == 404


def test_invalid_documents_list_every_problem(client: TestClient) -> None:
    doc = decanter_document()
    doc["components"][1]["speed_rpm"] = "n - nope"
    doc["parameters"][0]["value"] = "fast"
    resp = client.post("/api/machines/profiles", json={"data": doc})
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "invalid_profile"
    locs = [e["loc"] for e in body["params"]["errors"]]
    assert "data.parameters.0.value" in locs
    assert body["detail"].startswith("The machine profile is not valid: ")


def test_built_ins_are_read_only(client: TestClient) -> None:
    generic = client.get("/api/machines/profiles").json()[0]
    resp = client.put(f"/api/machines/profiles/{generic['id']}", json={"data": decanter_document()})
    assert resp.status_code == 403
    assert resp.json()["code"] == "profile_builtin"
    assert client.delete(f"/api/machines/profiles/{generic['id']}").status_code == 403


def test_profiles_are_private_to_their_account(client: TestClient, decanter_profile: dict) -> None:
    headers = _other_user(client)
    pid = decanter_profile["id"]
    assert client.get(f"/api/machines/profiles/{pid}", headers=headers).status_code == 404
    assert (
        client.put(
            f"/api/machines/profiles/{pid}",
            json={"data": decanter_document()},
            headers=headers,
        ).status_code
        == 404
    )
    assert client.delete(f"/api/machines/profiles/{pid}", headers=headers).json() == {"deleted": 0}
    names = [p["name"] for p in client.get("/api/machines/profiles", headers=headers).json()]
    assert names == ["Generic (rotor speed only)"]


def test_upload_recognises_the_profile_from_the_file(
    client: TestClient, peaky_odx_bytes: bytes, decanter_profile: dict
) -> None:
    project = _upload(client, peaky_odx_bytes, "Test Decanter run 4.odx")
    assert project["machine_profile_id"] == decanter_profile["id"]
    assert project["detected_profile_id"] == decanter_profile["id"]
    assert project["machine_name"] == "Test decanter"

    other = _upload(client, peaky_odx_bytes, "something else.odx")
    assert other["machine_profile_id"] is None
    assert other["machine_name"] == "Generic (rotor speed only)"

    chosen = _upload(
        client,
        peaky_odx_bytes,
        "Test Decanter run 5.odx",
        machine_profile_id=str(client.get("/api/machines/profiles").json()[0]["id"]),
    )
    # The generic built-in, chosen explicitly, is stored as "no profile".
    assert chosen["machine_profile_id"] is None
    assert chosen["detected_profile_id"] == decanter_profile["id"]


def test_a_new_profile_takes_over_the_projects_it_recognises(
    client: TestClient, peaky_odx_bytes: bytes
) -> None:
    first = _upload(client, peaky_odx_bytes, "Test Decanter A.odx")
    _upload(client, peaky_odx_bytes, "unrelated.odx")
    assert first["machine_profile_id"] is None
    created = client.post("/api/machines/profiles", json={"data": decanter_document()}).json()
    assert created["assigned_projects"] == 1
    assert created["project_count"] == 1
    detail = client.get(f"/api/projects/{first['id']}").json()
    assert detail["machine_profile_id"] == created["id"]

    # Deleting it hands the project back to the generic profile.
    client.delete(f"/api/machines/profiles/{created['id']}")
    detail = client.get(f"/api/projects/{first['id']}").json()
    assert detail["machine_profile_id"] is None
    generic = client.get("/api/machines/profiles").json()[0]
    assert generic["project_count"] == 2


def test_import_workbook(client: TestClient) -> None:
    xlsx = _workbook({"Sludge": _cyclo_rows()})
    resp = client.post(
        "/api/machines/profiles/import",
        files={"file": ("speeds.xlsx", xlsx, "application/octet-stream")},
    )
    assert resp.status_code == 201, resp.text
    [item] = resp.json()["imported"]
    assert item["source"] == "Sludge"
    assert item["profile"]["name"] == "Test Sludge"
    assert item["warnings"] == ["'Remarks': no value, ignored"]
    assert len(item["profile"]["data"]["operating_points"]) == 2


def test_import_json_in_every_shape(client: TestClient, decanter_profile: dict) -> None:
    exported = client.get(f"/api/machines/profiles/{decanter_profile['id']}").json()
    for body in (
        exported,  # as the API returns it
        exported["data"],  # the bare document
        {"profiles": [exported["data"], decanter_document(name="Second")]},
        [decanter_document(name="Third")],
    ):
        resp = client.post(
            "/api/machines/profiles/import",
            files={"file": ("p.json", json.dumps(body).encode(), "application/json")},
        )
        assert resp.status_code == 201, resp.text
    names = sorted(p["name"] for p in client.get("/api/machines/profiles").json())
    assert names.count("Test decanter") == 4
    assert {"Second", "Third"} <= set(names)


def test_import_rejects_unreadable_files(client: TestClient) -> None:
    resp = client.post(
        "/api/machines/profiles/import",
        files={"file": ("p.json", b"{nope", "application/json")},
    )
    assert (resp.status_code, resp.json()["code"]) == (400, "import_unreadable")
    resp = client.post(
        "/api/machines/profiles/import",
        files={"file": ("p.xlsx", b"PK not really", "application/octet-stream")},
    )
    assert (resp.status_code, resp.json()["code"]) == (400, "import_unreadable")
    bad = decanter_document(components=[])
    resp = client.post(
        "/api/machines/profiles/import",
        files={"file": ("p.json", json.dumps(bad).encode(), "application/json")},
    )
    assert (resp.status_code, resp.json()["code"]) == (422, "invalid_profile")
    resp = client.post(
        "/api/machines/profiles/import",
        files={"file": ("big.json", b" " * (2 * 1024 * 1024 + 1), "application/json")},
    )
    assert (resp.status_code, resp.json()["code"]) == (413, "file_too_large")


def test_templates_and_check(client: TestClient) -> None:
    templates = client.get("/api/machines/templates").json()
    assert [t["id"] for t in templates] == ["decanter-cyclo", "decanter-planetary"]
    doc = decanter_document(
        operating_points=[
            {"label": "N", "bowl_rpm": 3000, "reference_rpm": {"scroll": 3010, "bowl": 2990}}
        ]
    )
    resp = client.post("/api/machines/check", json={"data": doc})
    assert resp.status_code == 200, resp.text
    assert resp.json()["problems"] == []
    [point] = resp.json()["points"]
    rows = {c["key"]: c for c in point["components"]}
    assert rows["scroll"]["delta_rpm"] == 0
    assert rows["bowl"]["delta_rpm"] == 10
    assert rows["mains"]["freq_hz"] == 50


def test_check_returns_a_drafts_problems(client: TestClient) -> None:
    doc = decanter_document()
    doc["components"][1]["speed_rpm"] = "n - dd"
    doc["parameters"][0]["key"] = "2d"
    resp = client.post("/api/machines/check", json={"data": doc})
    assert resp.status_code == 200
    body = resp.json()
    assert body["points"] == []
    locs = {p["loc"] for p in body["problems"]}
    assert "parameters.0.key" in locs

    # A formula's problem is reported at the formula.
    doc = decanter_document()
    doc["components"][1]["speed_rpm"] = "n - dd"
    [problem] = client.post("/api/machines/check", json={"data": doc}).json()["problems"]
    assert problem == {
        "loc": "components.1.speed_rpm",
        "msg": "component 'scroll': unknown name dd",
    }


def test_a_longer_pattern_takes_over_from_a_recognised_profile(
    client: TestClient, peaky_odx_bytes: bytes
) -> None:
    broad = client.post(
        "/api/machines/profiles",
        json={"data": decanter_document(name="Broad", match_patterns=["decanter"])},
    ).json()
    recognised = _upload(client, peaky_odx_bytes, "Test Decanter A.odx")
    chosen = _upload(
        client, peaky_odx_bytes, "Test Decanter B.odx", machine_profile_id=str(broad["id"])
    )
    assert recognised["machine_profile_id"] == broad["id"]
    # Imported later, a more specific profile takes over what was only
    # recognised, but not what the user chose.
    narrow = client.post("/api/machines/profiles", json={"data": decanter_document()}).json()
    assert narrow["assigned_projects"] == 1
    assert client.get(f"/api/projects/{recognised['id']}").json()["machine_name"] == "Test decanter"
    assert client.get(f"/api/projects/{chosen['id']}").json()["machine_name"] == "Broad"
