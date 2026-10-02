"""Spectrogram endpoints — serve a project's parsed `.odx` matrix to the UI.

* `GET /api/projects/{id}/spectrogram` — full-resolution matrix.
* `GET /api/projects/{id}/spectrogram/preview` — downsampled; this is what
  the web app draws as the 3D waterfall.
* `GET /api/projects/{id}/thumbnail` — a tiny normalised matrix for the
  dashboard's project list.
"""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..analysis.spectrogram import SpectrumArrays, load_arrays, maxpool_axis1, stride_indices
from ..auth import get_current_user
from ..config import Settings, get_settings
from ..db import get_session
from ..models import User
from ..schemas import SpectrogramRead, ThumbnailRead
from ._common import STORED_ODX_ERRORS, require_project, stored_odx_error

router = APIRouter(prefix="/api/projects", tags=["spectrograms"])


def _load(settings: Settings, project_id: int) -> SpectrumArrays:
    try:
        return load_arrays(settings, project_id)
    except STORED_ODX_ERRORS as exc:
        raise stored_odx_error(exc) from exc


def _to_read(
    project_id: int, arr: SpectrumArrays, max_blocks: int, max_bins: int
) -> SpectrogramRead:
    """The spectrogram with at most max_blocks spectra (stride-sampled) of at
    most max_bins lines (max-pooled)."""
    rows = stride_indices(arr.n_blocks, max_blocks)
    z, freq = maxpool_axis1(arr.z_matrix[rows], arr.freq_axis, max_bins)
    return SpectrogramRead(
        project_id=project_id,
        n_blocks=len(rows),
        bin_count=len(freq),
        source_n_blocks=arr.n_blocks,
        source_bin_count=arr.bin_count,
        freq_axis=freq.tolist(),
        ref_speeds=arr.ref_speeds[rows].tolist(),
        ref_loads=arr.ref_loads[rows].tolist(),
        dates_unix=arr.dates_unix[rows].tolist(),
        dates_human=arr.dates_human[rows].tolist(),
        z_matrix=z.tolist(),
    )


@router.get("/{project_id}/spectrogram", response_model=SpectrogramRead)
def get_spectrogram(
    project_id: int,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> SpectrogramRead:
    require_project(project_id, session, current_user)
    arr = _load(settings, project_id)
    return _to_read(project_id, arr, arr.n_blocks, arr.bin_count)


@router.get("/{project_id}/spectrogram/preview", response_model=SpectrogramRead)
def get_spectrogram_preview(
    project_id: int,
    max_blocks: int = Query(200, ge=1, le=10_000),
    max_bins: int = Query(512, ge=1, le=20_000),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> SpectrogramRead:
    require_project(project_id, session, current_user)
    return _to_read(project_id, _load(settings, project_id), max_blocks, max_bins)


@router.get("/{project_id}/thumbnail", response_model=ThumbnailRead)
def get_thumbnail(
    project_id: int,
    n_blocks: int = Query(24, ge=4, le=128),
    n_bins: int = Query(64, ge=8, le=512),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> ThumbnailRead:
    """Tiny normalised spectrogram, drawn inline in the project list.

    Rows are ordered by ascending speed (whatever order the sweep was
    recorded in) and amplitudes scaled to [0, 1] of the thumbnail's max, so a
    canvas can paint it with a colour map directly.
    """
    project = require_project(project_id, session, current_user)
    arr = _load(settings, project_id)

    order = np.argsort(arr.ref_speeds, kind="stable")
    rows = order[stride_indices(len(order), n_blocks)]
    z, _ = maxpool_axis1(arr.z_matrix[rows], arr.freq_axis, n_bins)
    peak = float(z.max()) if z.size else 0.0
    z = z / peak if peak > 0 else np.zeros_like(z)

    return ThumbnailRead(
        project_id=project_id,
        n_blocks=int(z.shape[0]),
        bin_count=int(z.shape[1]),
        rpm_min=project.rpm_min,
        rpm_max=project.rpm_max,
        freq_min_hz=project.freq_min_hz,
        freq_max_hz=project.freq_max_hz,
        z_matrix=np.round(z, 4).tolist(),
    )
