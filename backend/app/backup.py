"""Data backups: the database and the uploaded .odx files, nothing else.

The application itself is rebuilt from Git; only customer data needs keeping.

    python -m app.backup create --out /backups     # writes centriminds-<utc>.tar.gz
    python -m app.backup create --stdout > x.tar.gz
    python -m app.backup verify x.tar.gz            # checksums, without unpacking
    python -m app.backup restore x.tar.gz --force  # replaces the data directory

The database is copied with SQLite's online backup API, so a backup is
consistent even while the app is serving requests. Each archive carries a
manifest with SHA-256 checksums; `restore` verifies them before touching the
live data, and moves the data it replaces aside (`.pre-restore-<utc>/` in the
data directory) instead of deleting it.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import shutil
import sqlite3
import sys
import tarfile
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

from .config import Settings, get_settings

MANIFEST = "manifest.json"
FORMAT_VERSION = 1


class BackupError(RuntimeError):
    pass


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


class _HashingReader:
    """File wrapper that hashes exactly the bytes tarfile reads from it."""

    def __init__(self, fh: io.BufferedReader) -> None:
        self._fh = fh
        self.digest = hashlib.sha256()

    def read(self, size: int = -1) -> bytes:
        chunk = self._fh.read(size)
        self.digest.update(chunk)
        return chunk


def _add_file(tar: tarfile.TarFile, path: Path, arcname: str) -> str | None:
    """Stream one file into the archive; return its SHA-256, or None if it
    was deleted since it was listed (a project removed meanwhile)."""
    try:
        fh = path.open("rb")
    except FileNotFoundError:
        return None
    with fh:
        info = tar.gettarinfo(arcname=arcname, fileobj=fh)
        reader = _HashingReader(fh)
        tar.addfile(info, reader)
    return reader.digest.hexdigest()


def _add_bytes(tar: tarfile.TarFile, arcname: str, data: bytes | None = None) -> None:
    """Add a small in-memory file, or a directory entry when `data` is None."""
    info = tarfile.TarInfo(arcname)
    info.mtime = int(time.time())
    if data is None:
        info.type, info.mode = tarfile.DIRTYPE, 0o755
        tar.addfile(info)
    else:
        info.size, info.mode = len(data), 0o644
        tar.addfile(info, io.BytesIO(data))


def _write_archive(settings: Settings, tar: tarfile.TarFile) -> None:
    """Database snapshot + uploads + manifest. The uploads are written once
    and never modified, so they are streamed from where they live; only the
    database is copied first (SQLite online backup, consistent under load)."""
    files: dict[str, str] = {}
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    # The snapshot stays on the data volume: /tmp may be RAM-backed.
    with tempfile.TemporaryDirectory(dir=settings.data_dir, prefix=".backup-") as tmp:
        if settings.db_path.exists():
            db_copy = Path(tmp) / "app.db"
            src = sqlite3.connect(settings.db_path)
            dst = sqlite3.connect(db_copy)
            try:
                src.backup(dst)
            finally:
                dst.close()
                src.close()
            digest = _add_file(tar, db_copy, "app.db")
            if digest is not None:
                files["app.db"] = digest
    _add_bytes(tar, "odx")
    if settings.odx_dir.is_dir():
        for f in sorted(settings.odx_dir.glob("*.odx")):
            digest = _add_file(tar, f, f"odx/{f.name}")
            if digest is not None:
                files[f"odx/{f.name}"] = digest
    manifest = {
        "format": FORMAT_VERSION,
        "created_at": datetime.now(UTC).isoformat(),
        "files": files,
    }
    _add_bytes(tar, MANIFEST, json.dumps(manifest, indent=2).encode())


def create_backup(settings: Settings, out: io.BufferedIOBase | Path) -> str:
    """Write a gzipped tar of the data to `out` (a directory or a stream).

    Returns the archive name.
    """
    name = f"centriminds-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}.tar.gz"
    if isinstance(out, Path):
        out.mkdir(parents=True, exist_ok=True)
        partial = out / f".{name}.part"
        try:
            with tarfile.open(partial, "w:gz") as tar:
                _write_archive(settings, tar)
            partial.replace(out / name)
        finally:
            partial.unlink(missing_ok=True)
    else:
        with tarfile.open(fileobj=out, mode="w|gz") as tar:
            _write_archive(settings, tar)
    return name


def _verify(root: Path) -> dict:
    """Check an archive unpacked in `root` against its manifest (for restore)."""
    try:
        manifest = json.loads((root / MANIFEST).read_text())
    except (OSError, ValueError) as exc:
        raise BackupError(f"archive has no readable {MANIFEST}") from exc
    if manifest.get("format") != FORMAT_VERSION:
        raise BackupError(f"unsupported backup format {manifest.get('format')!r}")
    for rel, expected in manifest["files"].items():
        path = root / rel
        if not path.is_file() or _sha256(path) != expected:
            raise BackupError(f"checksum mismatch for {rel}")
    # Without one, the restore would move the live database aside and leave
    # the app with none.
    if "app.db" not in manifest["files"]:
        raise BackupError("archive has no database")
    return manifest


def verify_archive(stream: io.BufferedIOBase) -> dict:
    """Check an archive without unpacking it: every file the manifest lists is
    present with its recorded SHA-256, and there is a database. Run on each
    new backup before it is uploaded, and on a download before a restore."""
    seen: dict[str, str] = {}
    manifest: dict | None = None
    try:
        with tarfile.open(fileobj=stream, mode="r|gz") as tar:
            for member in tar:
                fh = tar.extractfile(member) if member.isfile() else None
                if fh is None:
                    continue
                name = member.name.removeprefix("./")
                if name == MANIFEST:
                    manifest = json.loads(fh.read())
                    continue
                digest = hashlib.sha256()
                for chunk in iter(lambda fh=fh: fh.read(1 << 20), b""):
                    digest.update(chunk)
                seen[name] = digest.hexdigest()
    except (tarfile.TarError, OSError, EOFError, ValueError) as exc:
        raise BackupError(f"unreadable archive: {exc}") from exc
    if manifest is None:
        raise BackupError(f"archive has no {MANIFEST}")
    if manifest.get("format") != FORMAT_VERSION:
        raise BackupError(f"unsupported backup format {manifest.get('format')!r}")
    for rel, expected in manifest["files"].items():
        if seen.get(rel) != expected:
            raise BackupError(f"checksum mismatch for {rel}")
    if "app.db" not in manifest["files"]:
        raise BackupError("archive has no database")
    return manifest


#: What a restore replaces. SQLite side files go with the database: a stale
#: -wal next to a restored app.db would be replayed into it.
_DATA_ENTRIES = ("app.db", "app.db-wal", "app.db-shm", "app.db-journal", "odx")


def restore_backup(settings: Settings, archive: Path) -> dict:
    """Replace the database and uploads with the archive's contents.

    Run with the application stopped. Works inside the data directory (it may
    be a volume mount point that cannot itself be renamed): the current data
    moves to `.pre-restore-<utc>/` in the same directory and stays there.
    """
    data_dir = settings.data_dir
    data_dir.mkdir(parents=True, exist_ok=True)
    # Staged on the data volume, so the swap below is a rename, not a copy.
    with tempfile.TemporaryDirectory(dir=data_dir, prefix=".restore-") as tmp:
        stage = Path(tmp)
        with tarfile.open(archive, "r:gz") as tar:
            # The "data" filter keeps every member inside the stage and refuses
            # links that point out of it and special files such as devices.
            tar.extractall(stage, filter="data")
        manifest = _verify(stage)

        previous = data_dir / f".pre-restore-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"
        previous.mkdir()
        moved: list[str] = []
        try:
            for entry in _DATA_ENTRIES:
                if (data_dir / entry).exists():
                    (data_dir / entry).rename(previous / entry)
                    moved.append(entry)
            for entry in ("app.db", "odx"):
                if (stage / entry).exists():
                    (stage / entry).rename(data_dir / entry)
        except Exception:
            for entry in ("app.db", "odx"):  # put the old data back
                if (data_dir / entry).exists() and entry in moved:
                    shutil.rmtree(data_dir / entry) if entry == "odx" else (
                        data_dir / entry
                    ).unlink()
            for entry in moved:
                (previous / entry).rename(data_dir / entry)
            raise
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.backup", description=__doc__.split("\n\n")[0]
    )
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create", help="write a backup archive")
    target = create.add_mutually_exclusive_group(required=True)
    target.add_argument("--out", type=Path, help="directory to write the archive into")
    target.add_argument("--stdout", action="store_true", help="stream the archive to stdout")
    verify = sub.add_parser("verify", help="check an archive's checksums (- reads stdin)")
    verify.add_argument("archive", type=Path)
    restore = sub.add_parser("restore", help="replace the data with an archive (app stopped)")
    restore.add_argument("archive", type=Path)
    restore.add_argument("--force", action="store_true", help="required: confirms data replacement")
    args = parser.parse_args(argv)

    if args.command == "verify":
        try:
            if str(args.archive) == "-":
                manifest = verify_archive(sys.stdin.buffer)
            else:
                with args.archive.open("rb") as fh:
                    manifest = verify_archive(fh)
        except BackupError as exc:
            print(f"backup archive is not valid: {exc}", file=sys.stderr)
            return 1
        print(f"ok: {len(manifest['files'])} files from {manifest['created_at']}", file=sys.stderr)
        return 0

    settings = get_settings()
    if args.command == "create":
        if args.stdout:
            name = create_backup(settings, sys.stdout.buffer)
        else:
            name = create_backup(settings, args.out)
        print(name, file=sys.stderr)
        return 0
    if not args.force:
        parser.error("restore replaces all current data; pass --force to confirm")
    manifest = restore_backup(settings, args.archive)
    print(f"restored {len(manifest['files'])} files from {manifest['created_at']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
