"""Backups: a created archive restores to the same data, verified by checksum."""

from __future__ import annotations

import io
import sqlite3
import tarfile
from pathlib import Path

import pytest

from app.backup import BackupError, create_backup, restore_backup, verify_archive
from app.config import Settings


def _settings(root: Path) -> Settings:
    return Settings(data_dir=root, jwt_secret="test")


def _seed(settings: Settings, rows: int) -> None:
    settings.ensure_dirs()
    con = sqlite3.connect(settings.db_path)
    con.execute("CREATE TABLE IF NOT EXISTS t (v INTEGER)")
    con.execute("DELETE FROM t")
    con.executemany("INSERT INTO t VALUES (?)", [(i,) for i in range(rows)])
    con.commit()
    con.close()
    (settings.odx_dir / "1.odx").write_bytes(b"spectrum-" + bytes([rows]))


def _rows(settings: Settings) -> int:
    con = sqlite3.connect(settings.db_path)
    try:
        return con.execute("SELECT COUNT(*) FROM t").fetchone()[0]
    finally:
        con.close()


def test_backup_round_trip(tmp_path: Path) -> None:
    s = _settings(tmp_path / "data")
    _seed(s, 3)
    name = create_backup(s, tmp_path / "backups")
    archive = tmp_path / "backups" / name
    assert archive.is_file()

    _seed(s, 7)  # data changes after the backup
    (s.data_dir / "app.db-wal").write_bytes(b"stale wal")  # must not survive
    manifest = restore_backup(s, archive)

    assert _rows(s) == 3
    assert (s.odx_dir / "1.odx").read_bytes() == b"spectrum-\x03"
    assert not (s.data_dir / "app.db-wal").exists()
    assert set(manifest["files"]) == {"app.db", "odx/1.odx"}
    previous = [p for p in s.data_dir.iterdir() if p.name.startswith(".pre-restore-")]
    assert len(previous) == 1 and (previous[0] / "app.db").exists()


def test_backup_streams_to_a_file_object(tmp_path: Path) -> None:
    s = _settings(tmp_path / "data")
    _seed(s, 2)
    buf = io.BytesIO()
    create_backup(s, buf)
    buf.seek(0)
    with tarfile.open(fileobj=buf, mode="r:gz") as tar:
        names = tar.getnames()
    assert {"manifest.json", "app.db", "odx", "odx/1.odx"} <= set(names)


def test_backup_leaves_no_scratch_files(tmp_path: Path) -> None:
    s = _settings(tmp_path / "data")
    _seed(s, 2)
    name = create_backup(s, tmp_path / "backups")
    assert [p.name for p in (tmp_path / "backups").iterdir()] == [name]
    assert not [p for p in s.data_dir.iterdir() if p.name.startswith(".backup-")]


def test_restore_accepts_archives_in_the_earlier_layout(tmp_path: Path) -> None:
    # Archives made before uploads were streamed hold "./"-prefixed members.
    s = _settings(tmp_path / "data")
    _seed(s, 5)
    archive = tmp_path / "b" / create_backup(s, tmp_path / "b")
    stage = tmp_path / "stage"
    with tarfile.open(archive, "r:gz") as tar:
        tar.extractall(stage, filter="data")
    legacy = tmp_path / "legacy.tar.gz"
    with tarfile.open(legacy, "w:gz") as tar:
        tar.add(stage, arcname=".")

    _seed(s, 9)
    restore_backup(s, legacy)
    assert _rows(s) == 5


def test_restore_rejects_a_tampered_archive(tmp_path: Path) -> None:
    s = _settings(tmp_path / "data")
    _seed(s, 4)
    archive = tmp_path / "b" / create_backup(s, tmp_path / "b")

    # Rebuild the archive with a modified upload but the original manifest.
    tampered = tmp_path / "tampered.tar.gz"
    stage = tmp_path / "stage"
    with tarfile.open(archive, "r:gz") as tar:
        tar.extractall(stage, filter="data")
    (stage / "odx" / "1.odx").write_bytes(b"evil")
    with tarfile.open(tampered, "w:gz") as tar:
        tar.add(stage, arcname=".")

    with pytest.raises(BackupError):
        restore_backup(s, tampered)
    assert _rows(s) == 4  # live data untouched


def test_verify_checks_every_file_without_unpacking(tmp_path: Path) -> None:
    s = _settings(tmp_path / "data")
    _seed(s, 3)
    archive = tmp_path / "b" / create_backup(s, tmp_path / "b")
    with archive.open("rb") as fh:
        manifest = verify_archive(fh)
    assert set(manifest["files"]) == {"app.db", "odx/1.odx"}

    # Same members, one upload altered: the manifest no longer matches.
    stage = tmp_path / "stage"
    with tarfile.open(archive, "r:gz") as tar:
        tar.extractall(stage, filter="data")
    (stage / "odx" / "1.odx").write_bytes(b"evil")
    tampered = tmp_path / "tampered.tar.gz"
    with tarfile.open(tampered, "w:gz") as tar:
        tar.add(stage, arcname=".")
    with tampered.open("rb") as fh, pytest.raises(BackupError, match="checksum"):
        verify_archive(fh)

    # Truncated download.
    cut = tmp_path / "cut.tar.gz"
    cut.write_bytes(archive.read_bytes()[: archive.stat().st_size // 2])
    with cut.open("rb") as fh, pytest.raises(BackupError, match="unreadable"):
        verify_archive(fh)


def test_verify_refuses_an_archive_without_a_database(tmp_path: Path) -> None:
    s = _settings(tmp_path / "empty")  # nothing on disk yet
    buf = io.BytesIO()
    create_backup(s, buf)
    buf.seek(0)
    with pytest.raises(BackupError, match="no database"):
        verify_archive(buf)


def test_restore_refuses_an_archive_without_a_database(tmp_path: Path) -> None:
    empty = tmp_path / "b" / create_backup(_settings(tmp_path / "nothing"), tmp_path / "b")
    s = _settings(tmp_path / "data")
    _seed(s, 6)
    with pytest.raises(BackupError, match="no database"):
        restore_backup(s, empty)
    assert _rows(s) == 6
    assert not list(s.data_dir.glob(".pre-restore-*"))


def test_cli_requires_force_for_restore(tmp_path: Path, monkeypatch) -> None:
    from app import backup

    monkeypatch.setattr(backup, "get_settings", lambda: _settings(tmp_path / "data"))
    with pytest.raises(SystemExit):
        backup.main(["restore", str(tmp_path / "x.tar.gz")])
