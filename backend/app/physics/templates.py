"""Starting points for machine profiles, and the built-in generic profile.

Templates carry the kinematics of common decanter drive trains as formulas;
their parameter values are round example numbers, to be replaced with the
machine's own (the commissioning-sheet import fills them in). No real
machine's data lives in the code.

The Cyclo formulas follow the usual commissioning-sheet conventions: the
signs of the stage ratios K1, K2 encode the stages' directions of rotation,
so keep them as given.
"""

from __future__ import annotations

from typing import Any

from .profile import MachineProfileData

#: The profile of a project without one: the rotor at the measured speed and
#: the mains. Kept in the database as a shared, read-only row.
GENERIC_KEY = "generic"

_MAINS_PARAMETER = {
    "key": "f_mains",
    "label": "Mains frequency",
    "unit": "Hz",
    "value": 50,
    "run_specific": True,
}
_MAINS_COMPONENT = {
    "key": "mains",
    "label": "Mains",
    "kind": "electrical",
    "speed_rpm": "60 * f_mains",
    "max_order": 3,
}
_DIFFERENTIAL = {
    "key": "d",
    "label": "Differential speed",
    "unit": "rpm",
    "value": 10,
    "run_specific": True,
}
_MAIN_BELT_PARAMETERS = [
    {"key": "D_motor", "label": "Pulley Ø, motor", "unit": "mm", "value": 300},
    {"key": "D_machine", "label": "Pulley Ø, machine", "unit": "mm", "value": 175},
    {"key": "L_belt", "label": "Belt length", "unit": "mm", "value": 2000},
]
_MAIN_DRIVE = [
    {"key": "main_motor", "label": "Main motor", "speed_rpm": "n * D_machine / D_motor"},
    {
        "key": "belt",
        "label": "Belt",
        "kind": "belt",
        "speed_rpm": "pi * D_machine / L_belt * n",
    },
    {"key": "belt_flex", "label": "Belt flex", "kind": "belt", "speed_rpm": "2 * belt"},
]

GENERIC: dict[str, Any] = {
    "name": "Generic (rotor speed only)",
    "machine_type": "Any rotating machine",
    "description": (
        "Used when a project has no machine profile: the rotor turns at the "
        "measured speed, and the mains frequency is marked."
    ),
    "parameters": [_MAINS_PARAMETER],
    "components": [{"key": "rotor", "label": "Rotor", "speed_rpm": "n"}, _MAINS_COMPONENT],
}

TEMPLATES: dict[str, dict[str, Any]] = {
    "decanter-cyclo": {
        "name": "Decanter, two-stage Cyclo gearbox",
        "machine_type": "Decanter centrifuge",
        "description": (
            "Main motor driving the bowl through a belt; two-stage Cyclo gearbox "
            "with a secondary motor on its input shaft. Example values."
        ),
        "parameters": [
            _DIFFERENTIAL,
            {"key": "K1", "label": "Gearbox 1st stage ratio", "value": -60},
            {"key": "K2", "label": "Gearbox 2nd stage ratio", "value": 2},
            *_MAIN_BELT_PARAMETERS,
            _MAINS_PARAMETER,
        ],
        "components": [
            {"key": "bowl", "label": "Bowl", "speed_rpm": "n"},
            {"key": "scroll", "label": "Scroll", "speed_rpm": "n - sign(K1 * K2) * d"},
            *_MAIN_DRIVE[:1],
            {
                "key": "secondary_motor",
                "label": "Secondary motor (Vs)",
                "speed_rpm": "n - d * abs(K1 * K2)",
            },
            {
                "key": "intermediate_shaft",
                "label": "Gearbox intermediate shaft (Vi)",
                "speed_rpm": "n - sign(K1) * d * K1 * (-sign(K1 * K2))",
            },
            *_MAIN_DRIVE[1:],
            _MAINS_COMPONENT,
        ],
    },
    "decanter-planetary": {
        "name": "Decanter, planetary gearbox with back-drive",
        "machine_type": "Decanter centrifuge",
        "description": (
            "Main motor driving the bowl through a belt; planetary gearbox whose "
            "pinion a back-drive motor turns through a second belt. Example values."
        ),
        "parameters": [
            _DIFFERENTIAL,
            {"key": "K1", "label": "Gearbox 1st stage ratio", "value": 40},
            {"key": "K2", "label": "Gearbox 2nd stage ratio", "value": 1},
            *_MAIN_BELT_PARAMETERS,
            {"key": "D2_motor", "label": "Back-drive pulley Ø, motor", "unit": "mm", "value": 200},
            {
                "key": "D2_machine",
                "label": "Back-drive pulley Ø, gearbox",
                "unit": "mm",
                "value": 500,
            },
            {"key": "L2_belt", "label": "Back-drive belt length", "unit": "mm", "value": 5000},
            _MAINS_PARAMETER,
        ],
        "components": [
            {"key": "bowl", "label": "Bowl", "speed_rpm": "n"},
            {"key": "scroll", "label": "Scroll", "speed_rpm": "n - sign(K1 * K2) * d"},
            *_MAIN_DRIVE[:1],
            {"key": "pinion", "label": "Gearbox pinion (Vi)", "speed_rpm": "n - d * K1 * K2"},
            {
                "key": "secondary_motor",
                "label": "Back-drive motor (Vs)",
                "speed_rpm": "pinion * D2_machine / D2_motor",
            },
            *_MAIN_DRIVE[1:],
            # The back-drive belt runs with the pinion's pulley, not the bowl.
            {
                "key": "belt2",
                "label": "Back-drive belt",
                "kind": "belt",
                "speed_rpm": "pi * D2_machine / L2_belt * pinion",
            },
            {
                "key": "belt2_flex",
                "label": "Back-drive belt flex",
                "kind": "belt",
                "speed_rpm": "2 * belt2",
            },
            _MAINS_COMPONENT,
        ],
    },
}


def generic_profile() -> MachineProfileData:
    return MachineProfileData.model_validate(GENERIC)


def template(template_id: str) -> MachineProfileData:
    """A template as a profile document (KeyError if unknown)."""
    return MachineProfileData.model_validate(TEMPLATES[template_id])
