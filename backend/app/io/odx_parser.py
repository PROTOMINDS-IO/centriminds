"""Parser for VIBXPERT Omnitrend `.odx` vibration-export files.

An `.odx` file is a plain-text export containing a header section followed by
N measurement blocks, one per RPM-sweep step. Each block carries a single FFT
spectrum (amplitude vs frequency) plus the reference-shaft RPM, motor load
and a Unix timestamp captured at that step.

Block layout observed in real files:

    #Date
    <unix_ts>=<human_readable>
    #Channel
    <int>
    #X-Start,Increment,X-End
    <x_start> <increment> <x_end>
    #Y-Count
    <n>, <hex_checksum>
    #Y-Values
    <float> <float> ...                (continues over multiple lines)
    ...                                (until next `#` line)
    #RefSpeed
    <float>                            (rpm of reference shaft)
    #RefLoad
    <float>                            (motor load %)

The frequency axis is derived per block from X-Start/Increment/X-End. Every
block in a file must share the same axis; the parser raises if not. The
Y-Values count must equal what `#Y-Count` declares; the parser raises if not.
The channel number is not read: an export holds one measuring point.
"""

from __future__ import annotations

import contextlib
import hashlib
import math
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np


class OdxParseError(ValueError):
    """Raised on any malformed block or inconsistent axis across blocks."""


@dataclass(frozen=True)
class OdxFile:
    """Parsed representation of a full `.odx` file.

    `y_matrix` is the stack of per-block spectra, shape (N, len(freq_axis)).
    All blocks share `freq_axis` in Hz.

    The `header_*` fields capture file-level metadata that lives above the
    measurement blocks (Omnitrend tree path, export date, format version).
    They're optional because not every export carries every key.
    """

    content_sha256: str
    freq_axis: list[float]
    ref_speeds: list[float]
    ref_loads: list[float]
    dates_unix: list[int]
    dates_human: list[str]
    y_matrix: np.ndarray
    header_path: str | None = None
    header_export_human: str | None = None
    header_format_version: str | None = None

    def as_numpy(self) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Return numpy arrays suitable for analysis; `y_matrix` is the
        parsed array itself, not a copy.

        Returns (freq_axis[bins], ref_speeds[N], y_matrix[N, bins], ref_loads[N]).
        """
        return (
            np.asarray(self.freq_axis, dtype=np.float64),
            np.asarray(self.ref_speeds, dtype=np.float64),
            self.y_matrix,
            np.asarray(self.ref_loads, dtype=np.float64),
        )


_DATE_RE = re.compile(r"^\s*(\d+)\s*=\s*(.+?)\s*$")

#: Upper bound on spectrum lines per block. VIBXPERT spectra top out at
#: 102 400 lines; the bound stops a few bytes of X-Start/Increment/X-End from
#: asking for a billion-point axis.
MAX_BINS = 1 << 18


def _tokenize_blocks(text: str) -> list[tuple[str, list[str]]]:
    """Split text into `(#Key, payload_lines)` pairs, preserving order.

    A block starts at a line beginning with `#` and continues through the
    following non-# lines. Blank lines stay in the payload (the readers skip
    them) and do not end a block; lines before the first `#` are dropped.
    """
    blocks: list[tuple[str, list[str]]] = []
    current_key: str | None = None
    current_payload: list[str] = []
    for raw in text.splitlines():
        if raw.startswith("#"):
            if current_key is not None:
                blocks.append((current_key, current_payload))
            current_key = raw.rstrip()
            current_payload = []
        else:
            if current_key is not None:
                current_payload.append(raw)
    if current_key is not None:
        blocks.append((current_key, current_payload))
    return blocks


def _parse_float(s: str, label: str) -> float:
    try:
        value = float(s)
    except ValueError as e:
        raise OdxParseError(f"{label}: expected float, got {s!r}") from e
    if not math.isfinite(value):
        raise OdxParseError(f"{label}: expected a finite number, got {s!r}")
    return value


def _parse_int(s: str, label: str) -> int:
    try:
        return int(s)
    except ValueError as e:
        raise OdxParseError(f"{label}: expected int, got {s!r}") from e


def _first_nonblank(payload: list[str], label: str) -> str:
    for line in payload:
        stripped = line.strip()
        if stripped:
            return stripped
    raise OdxParseError(f"{label}: empty payload")


def _flatten_y(payload: list[str]) -> np.ndarray:
    tokens = " ".join(payload).split()
    try:
        # numpy converts the whole block at once: most of a parse otherwise.
        values = np.array(tokens, dtype=np.float64)
    except ValueError:
        # Only to name the offending token.
        for tok in tokens:
            try:
                float(tok)
            except ValueError as e:
                raise OdxParseError(f"Y-Values: bad token {tok!r}") from e
        raise
    if not np.isfinite(values).all():
        raise OdxParseError("Y-Values: non-finite value (nan/inf)")
    return values


def _same_axis(a: tuple[float, float, int], b: tuple[float, float, int]) -> bool:
    """Two linear axes agree on every line iff they agree at both ends."""
    (start_a, inc_a, n_a), (start_b, inc_b, n_b) = a, b
    last_a, last_b = start_a + inc_a * (n_a - 1), start_b + inc_b * (n_b - 1)
    return n_a == n_b and abs(start_a - start_b) <= 1e-9 and abs(last_a - last_b) <= 1e-9


def parse_odx(source: str | Path | bytes) -> OdxFile:
    """Parse an `.odx` file from disk (a Path) or its content (bytes, or text
    as a str).

    Raises OdxParseError if any block is malformed or axes drift across blocks.
    """
    if isinstance(source, Path):
        raw = source.read_bytes()
    elif isinstance(source, bytes):
        raw = source
    elif isinstance(source, str):
        raw = source.encode("utf-8")
    else:
        raise OdxParseError(f"Unsupported source type: {type(source).__name__}")

    content_sha256 = hashlib.sha256(raw).hexdigest()
    text = raw.decode("utf-8", errors="replace")
    tokens = _tokenize_blocks(text)

    ref_speeds: list[float] = []
    ref_loads: list[float] = []
    dates_unix: list[int] = []
    dates_human: list[str] = []
    spectra: list[np.ndarray] = []
    freq_axis: list[float] | None = None
    axis_spec: tuple[float, float, int] | None = None
    header_path: str | None = None
    header_export_human: str | None = None
    header_format_version: str | None = None

    i = 0
    pending: dict = {}
    while i < len(tokens):
        key, payload = tokens[i]
        normalized = key.strip().lower()

        if normalized.startswith("#condition monitoring"):
            for line in payload:
                stripped = line.strip()
                if stripped:
                    header_format_version = stripped
                    break
        elif normalized == "#date of export":
            with contextlib.suppress(OdxParseError):  # optional header
                header_export_human = _first_nonblank(payload, "#Date of Export")
        elif normalized == "#path":
            with contextlib.suppress(OdxParseError):  # optional header
                header_path = _first_nonblank(payload, "#Path")
        elif normalized == "#date":
            line = _first_nonblank(payload, "#Date")
            m = _DATE_RE.match(line)
            if m:
                pending["date_unix"] = _parse_int(m.group(1), "#Date unix")
                pending["date_human"] = m.group(2).strip()
            else:
                pending["date_unix"] = 0
                pending["date_human"] = line
        elif normalized == "#x-start,increment,x-end":
            parts = _first_nonblank(payload, "#X-Start,Increment,X-End").split()
            if len(parts) < 3:
                raise OdxParseError(f"#X-Start,Increment,X-End: need 3 floats, got {parts!r}")
            x_start = _parse_float(parts[0], "X-Start")
            increment = _parse_float(parts[1], "Increment")
            x_end = _parse_float(parts[2], "X-End")
            if increment <= 0:
                raise OdxParseError(f"Increment must be positive, got {increment}")
            span = (x_end - x_start) / increment  # inf if the subtraction overflows
            n_lines = round(span) + 1 if math.isfinite(span) else 0
            if not 1 <= n_lines <= MAX_BINS:
                raise OdxParseError(
                    f"X-Start/Increment/X-End ({x_start:g} {increment:g} {x_end:g}) do not "
                    f"describe 1 to {MAX_BINS} spectrum lines"
                )
            # The axis itself is built once the block's Y-Values have arrived.
            pending["x_spec"] = (x_start, increment, n_lines)
        elif normalized == "#y-count":
            count_line = _first_nonblank(payload, "#Y-Count")
            count_str = count_line.split(",")[0].strip()
            pending["y_count_declared"] = _parse_int(count_str, "#Y-Count")
        elif normalized == "#y-values":
            values = _flatten_y(payload)
            pending["y_values"] = values
        elif normalized == "#refspeed":
            pending["ref_speed"] = _parse_float(_first_nonblank(payload, "#RefSpeed"), "#RefSpeed")
        elif normalized == "#refload":
            pending["ref_load"] = _parse_float(_first_nonblank(payload, "#RefLoad"), "#RefLoad")

        has_block = {"y_values", "ref_speed", "ref_load", "x_spec"}.issubset(pending.keys())
        if has_block:
            values = pending["y_values"]
            x_start, increment, n_lines = pending["x_spec"]
            declared = pending.get("y_count_declared", len(values))
            if len(values) != declared:
                raise OdxParseError(
                    f"Y-Values count mismatch: declared {declared}, got {len(values)}"
                )
            if len(values) != n_lines:
                raise OdxParseError(
                    f"Y-Values ({len(values)}) does not match frequency axis "
                    f"from X-Start/Increment/X-End ({n_lines})"
                )
            if freq_axis is None or axis_spec is None:
                axis_spec = pending["x_spec"]
                freq_axis = [x_start + increment * k for k in range(n_lines)]
            elif not _same_axis(axis_spec, pending["x_spec"]):
                raise OdxParseError(
                    "Frequency axis drift between blocks: all blocks must share "
                    "the same X-Start/Increment/X-End"
                )
            spectra.append(values)
            ref_speeds.append(pending["ref_speed"])
            ref_loads.append(pending["ref_load"])
            dates_unix.append(pending.get("date_unix", 0))
            dates_human.append(pending.get("date_human", ""))
            pending = {}
        i += 1

    if not spectra or freq_axis is None:
        raise OdxParseError("No complete measurement blocks found in file")
    return OdxFile(
        content_sha256=content_sha256,
        freq_axis=freq_axis,
        ref_speeds=ref_speeds,
        ref_loads=ref_loads,
        dates_unix=dates_unix,
        dates_human=dates_human,
        y_matrix=np.stack(spectra),
        header_path=header_path,
        header_export_human=header_export_human,
        header_format_version=header_format_version,
    )
