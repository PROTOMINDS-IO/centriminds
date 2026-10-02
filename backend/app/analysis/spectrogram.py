"""A project's stored `.odx` as numeric arrays, and their downsampling for
API delivery.

The raw parse produces a matrix of shape `(n_blocks, bin_count)`. A typical
sweep is 234 spectra × 3200 lines, more than the browser needs to draw the
waterfall, so the web app loads a preview: stride-sampled on the block
(speed) axis (`stride_indices`) and max-pooled on the frequency axis
(`maxpool_axis1`) so peaks survive.

Parsing an 8 MB export takes tens of milliseconds, so the numeric arrays are
cached in memory per file (keyed on path, mtime and size — a replaced or
deleted file is never served stale). Every endpoint and the analysis
pipeline read from that cache.

Downsampling uses max-pool for bins because that axis carries the information
that matters (peak amplitudes at excitation frequencies). Stride-sampling for
blocks is acceptable because the blocks are a speed sweep in recording order,
so neighbours differ little in speed: dropping intermediate steps does not
hide peaks — they just reappear in the next retained block.
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..config import Settings
from ..io.odx_parser import OdxFile, parse_odx


class SpectrogramNotFoundError(FileNotFoundError):
    """Raised when a project's stored `.odx` file is missing from disk."""


def _odx_path(settings: Settings, project_id: int):
    return settings.odx_dir / f"{project_id}.odx"


@dataclass(frozen=True)
class SpectrumArrays:
    """The numeric content of one `.odx` file, as read-only numpy arrays.

    Shared between requests through the cache below — never mutate.
    """

    freq_axis: np.ndarray  # (bin_count,) Hz
    ref_speeds: np.ndarray  # (n_blocks,) rpm
    ref_loads: np.ndarray  # (n_blocks,) %
    z_matrix: np.ndarray  # (n_blocks, bin_count) mm/s
    dates_unix: np.ndarray  # (n_blocks,) int
    dates_human: np.ndarray  # (n_blocks,) str

    @property
    def n_blocks(self) -> int:
        return int(self.z_matrix.shape[0])

    @property
    def bin_count(self) -> int:
        return int(self.z_matrix.shape[1])


def _frozen(a: np.ndarray) -> np.ndarray:
    a.setflags(write=False)
    return a


def arrays_from_parsed(parsed: OdxFile) -> SpectrumArrays:
    freq, speeds, matrix, loads = parsed.as_numpy()
    return SpectrumArrays(
        freq_axis=_frozen(freq),
        ref_speeds=_frozen(speeds),
        ref_loads=_frozen(loads),
        z_matrix=_frozen(matrix),
        dates_unix=_frozen(np.asarray(parsed.dates_unix, dtype=np.int64)),
        dates_human=_frozen(np.asarray(parsed.dates_human)),
    )


class _ArrayCache:
    """Small thread-safe LRU of parsed files (~6 MB each for a typical sweep)."""

    def __init__(self, maxsize: int) -> None:
        self._maxsize = maxsize
        self._items: OrderedDict[tuple[str, int, int], SpectrumArrays] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: tuple[str, int, int]):
        with self._lock:
            hit = self._items.get(key)
            if hit is not None:
                self._items.move_to_end(key)
            return hit

    def put(self, key: tuple[str, int, int], value: SpectrumArrays) -> None:
        with self._lock:
            self._items[key] = value
            self._items.move_to_end(key)
            while len(self._items) > self._maxsize:
                self._items.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


_cache = _ArrayCache(maxsize=8)


def _key(path: Path) -> tuple[str, int, int]:
    stat = path.stat()
    return (str(path), stat.st_mtime_ns, stat.st_size)


def load_arrays(settings: Settings, project_id: int) -> SpectrumArrays:
    """Parsed arrays for a project's stored `.odx`, served from the cache."""
    path = _odx_path(settings, project_id)
    try:
        key = _key(path)
    except FileNotFoundError as exc:
        raise SpectrogramNotFoundError(str(path)) from exc
    hit = _cache.get(key)
    if hit is None:
        hit = arrays_from_parsed(parse_odx(path))
        _cache.put(key, hit)
    return hit


def prime_cache(settings: Settings, project_id: int, parsed: OdxFile) -> None:
    """Seed the cache after an upload so the first view does not re-parse."""
    _cache.put(_key(_odx_path(settings, project_id)), arrays_from_parsed(parsed))


def stride_indices(n: int, max_n: int) -> np.ndarray:
    """Pick up to max_n evenly-spaced indices covering [0, n-1] inclusive."""
    if n <= max_n:
        return np.arange(n)
    return np.linspace(0, n - 1, max_n).round().astype(int)


def maxpool_axis1(
    matrix: np.ndarray, axis_values: np.ndarray, max_bins: int
) -> tuple[np.ndarray, np.ndarray]:
    """Max-pool the frequency axis (axis=1) of `matrix` into at most max_bins buckets.

    Returns `(pooled_matrix, pooled_axis)`. Bucket edges are evenly spaced over
    the source index range; the per-bucket axis value is the mean of the source
    bin centres that fell into it, so the output axis still represents Hz
    faithfully.
    """
    n_bins = matrix.shape[1]
    if n_bins <= max_bins:
        return matrix, axis_values
    # max_bins + 1 edges in source-index space. They are more than one bin
    # apart, so every bucket holds at least one source bin.
    edges = np.linspace(0, n_bins, max_bins + 1).round().astype(int)
    starts = edges[:-1]
    pooled = np.maximum.reduceat(matrix, starts, axis=1)
    pooled_axis = np.add.reduceat(axis_values, starts) / np.diff(edges)
    return pooled, pooled_axis.astype(axis_values.dtype, copy=False)
