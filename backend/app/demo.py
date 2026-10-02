"""Demo data: a made-up decanter and a few analysed sweeps for one account.

    python -m app.demo seed  --email demo@example.com --create   # the shared demo login
    python -m app.demo seed  --email client@example.com          # an existing account, once
    python -m app.demo reset --email demo@example.com            # nightly: back to the seed

Everything here is synthetic: the machine ("Demo decanter D-500") is the
Cyclo template with invented numbers, and the sweeps are generated from its
own order lines plus mains lines, a structural resonance and noise, so a
public demo never carries customer measurements or machine data.

`seed` adds the demo profile and projects to an account that has none of
them yet (a second run changes nothing). `--create` makes the account first,
with the password from the `DEMO_PASSWORD` environment variable (never an
argument, which would land in shell history and the process list). `reset`
deletes every project and machine profile of the account, then seeds it
again; it is meant for the shared demo login only.
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from textwrap import dedent

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from .analysis.pipeline import PIPELINE_VERSION, run_and_persist
from .auth import PASSWORD_MIN_LEN, get_user_by_email, hash_password
from .config import Settings, get_settings
from .db import _session_factory, run_migrations
from .io.odx_parser import parse_odx
from .models import AUTHOR_USER, Annotation, MachineProfile, MeasurementMetadata, Project, User
from .physics.kinematics import compile_machine
from .physics.profile import MachineProfileData
from .physics.templates import template
from .profiles import inputs_hash
from .routers.projects import project_from_upload, store_upload

PROFILE_NAME = "Demo decanter D-500"
#: Recognises the demo sweeps' header path (and nothing a real export carries).
MATCH_PATTERN = "demo decanter d-500"
BOWL_DIAMETER_MM = 500.0
RESONANCE_HZ = 38.5


class DemoError(RuntimeError):
    """The command cannot run as asked (missing account, password, …)."""


def demo_profile_document() -> dict:
    doc = template("decanter-cyclo").model_dump(mode="json")
    doc.update(
        name=PROFILE_NAME,
        description="A made-up decanter for the public demo. All values are invented.",
        match_patterns=[MATCH_PATTERN],
        bowl_diameter_mm=BOWL_DIAMETER_MM,
        structural_modes=[
            {"name": "Frame mode, horizontal", "freq_hz": RESONANCE_HZ, "source": "Demo data"}
        ],
    )
    return MachineProfileData.model_validate(doc).model_dump(mode="json")


@dataclass(frozen=True)
class Sweep:
    name: str
    notes: str
    #: Scales the bowl's 1× line (unbalance).
    unbalance: float
    #: Peak gain of the structural resonance on lines that cross it.
    resonance_gain: float
    seed: int


SWEEPS = [
    Sweep(
        "Demo D-500 · commissioning run-up",
        "Run-up after commissioning. Bowl balanced; the frame mode at 38.5 Hz is crossed "
        "on the way up and stays clear of operating speed.",
        unbalance=1.0,
        resonance_gain=2.5,
        seed=1,
    ),
    Sweep(
        "Demo D-500 · after six months",
        "Same machine six months later: the bowl's 1× line has grown (unbalance from "
        "solids build-up). Rated usable; cleaning recommended.",
        unbalance=2.6,
        resonance_gain=2.5,
        seed=2,
    ),
    Sweep(
        "Demo D-500 · loose frame",
        "Frame bolts loosened: the frame mode is weakly damped and amplifies every line "
        "that crosses it.",
        unbalance=1.4,
        resonance_gain=7.0,
        seed=3,
    ),
]


def synthetic_sweep(sweep: Sweep, profile: MachineProfileData) -> bytes:
    """An `.odx` run-up (RMS velocity, mm/s) built from the profile's own
    order lines, so the analysis finds what was put in."""
    rng = np.random.default_rng(sweep.seed)
    machine = compile_machine(profile)
    rpms = np.linspace(400.0, 3200.0, 120)
    increment = 0.125
    freqs = np.arange(3201) * increment  # 0-400 Hz, 3200 lines
    top = rpms[-1]

    def line(spectrum: np.ndarray, f: float, amp: float) -> None:
        if 0 < f < freqs[-1]:
            gain = 1 + (sweep.resonance_gain - 1) / (1 + ((f - RESONANCE_HZ) / 1.5) ** 2)
            spectrum += amp * gain * np.exp(-0.5 * ((freqs - f) / (1.2 * increment)) ** 2)

    blocks = []
    for rpm in rpms:
        load = (rpm / top) ** 2
        s = 0.01 + 0.006 * rng.random(freqs.size)
        hz = machine.frequencies_hz(float(rpm))
        line(s, hz["bowl"], 2.2 * sweep.unbalance * load)
        line(s, 2 * hz["bowl"], 0.5 * load)
        line(s, 3 * hz["bowl"], 0.15 * load)
        line(s, hz["main_motor"], 0.6 * load)
        line(s, 2 * hz["main_motor"], 0.2 * load)
        line(s, hz["secondary_motor"], 0.25)
        line(s, hz["belt"], 0.15 * load)
        line(s, 50.0, 0.25)
        line(s, 100.0, 0.55)
        line(s, 150.0, 0.1)
        blocks.append((rpm, s))

    header = dedent(
        f"""\
        #Condition Monitoring - Omnitrend Data Exchange
        250
        #Date of Export
        Thu Oct 01 09:00:00 2026
        #Path
        Demo\\Demo decanter D-500\\Main bearing\\{sweep.seed}
        """
    )
    parts = [header]
    for b, (rpm, s) in enumerate(blocks):
        ys = " ".join(f"{y:.5f}" for y in s)
        parts.append(
            dedent(
                f"""\
                #Date
                {1790000000 + 10 * b}=Block {b}
                #Channel
                0
                #X-Start,Increment,X-End
                0.000000 {increment:.6f} {freqs[-1]:.6f}
                #Y-Count
                {freqs.size}, 00000000
                #Y-Values
                {ys}
                #RefSpeed
                {rpm:.1f}
                #RefLoad
                {40 + 50 * (rpm / top):.1f}
                """
            )
        )
    return "".join(parts).encode("utf-8")


def _demo_profile(session: Session, user: User) -> MachineProfile | None:
    return session.scalars(
        select(MachineProfile).where(
            MachineProfile.user_id == user.id, MachineProfile.name == PROFILE_NAME
        )
    ).first()


def seed(session: Session, settings: Settings, user: User) -> int:
    """Add the demo profile and projects to the account; returns how many
    projects were added (0 when it already has them)."""
    if _demo_profile(session, user) is not None:
        return 0
    row = MachineProfile(user_id=user.id, name=PROFILE_NAME, data=demo_profile_document())
    session.add(row)
    session.commit()
    profile = MachineProfileData.model_validate(row.data)

    for sweep in SWEEPS:
        content = synthetic_sweep(sweep, profile)
        parsed = parse_odx(content)
        project = project_from_upload(
            user,
            parsed,
            name=sweep.name,
            filename=f"demo-d500-{sweep.seed}.odx",
            profile_id=row.id,
            profile_chosen=True,
            detected_id=row.id,
            notes_markdown=sweep.notes,
        )
        project.measurement_metadata = MeasurementMetadata(
            sensor_location="Main bearing, feed side",
            sensor_direction="horizontal",
            unit="mm/s",
            site="Demo plant",
        )
        store_upload(session, settings, project, content, parsed)
        run_and_persist(
            session, settings, project, profile, inputs_hash(PIPELINE_VERSION, project, profile)
        )
        session.add(
            Annotation(
                project_id=project.id,
                author=AUTHOR_USER,
                annotation_type="frequency_line",
                freq_hz=RESONANCE_HZ,
                label="Frame mode 38.5 Hz",
                color="slot:3",
            )
        )
        session.commit()
    return len(SWEEPS)


def clear(session: Session, settings: Settings, user: User) -> int:
    """Delete every project and machine profile of the account."""
    projects = session.scalars(select(Project).where(Project.user_id == user.id)).all()
    ids = [p.id for p in projects]
    for p in projects:
        session.delete(p)
    for row in session.scalars(select(MachineProfile).where(MachineProfile.user_id == user.id)):
        session.delete(row)
    session.flush()  # write lock held while the files go, as in delete_project
    for pid in ids:
        (settings.odx_dir / f"{pid}.odx").unlink(missing_ok=True)
    session.commit()
    return len(ids)


def create_account(session: Session, email: str, password: str) -> User:
    if len(password) < PASSWORD_MIN_LEN:
        raise DemoError(f"DEMO_PASSWORD must have at least {PASSWORD_MIN_LEN} characters")
    user = User(email=email, name="Demo", password_hash=hash_password(password))
    session.add(user)
    session.commit()
    return user


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.demo", description=__doc__.split("\n\n")[0]
    )
    sub = parser.add_subparsers(dest="command", required=True)
    for name, text in (("seed", "add the demo data"), ("reset", "clear and seed again")):
        cmd = sub.add_parser(name, help=text)
        cmd.add_argument("--email", required=True)
        cmd.add_argument(
            "--create",
            action="store_true",
            help="create the account if missing (password from DEMO_PASSWORD)",
        )
    args = parser.parse_args(argv)
    email = args.email.strip().lower()

    settings = get_settings()
    settings.ensure_dirs()
    run_migrations()
    with _session_factory()() as session:
        try:
            user = get_user_by_email(session, email)
            if user is None:
                if not args.create:
                    raise DemoError(f"no account {email}; sign up first or pass --create")
                user = create_account(session, email, os.environ.get("DEMO_PASSWORD", ""))
            if args.command == "reset":
                removed = clear(session, settings, user)
                print(f"removed {removed} projects", file=sys.stderr)
            added = seed(session, settings, user)
        except DemoError as exc:
            print(f"demo: {exc}", file=sys.stderr)
            return 1
    print(f"added {added} demo projects to {email}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
