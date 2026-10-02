"""The speed-formula language of machine profiles (physics/expressions.py)."""

from __future__ import annotations

import math

import pytest

from app.physics.expressions import FormulaError, evaluate, names_in, parse


def calc(formula: str, **variables: float) -> float:
    return evaluate(parse(formula), variables)


def test_arithmetic_and_functions() -> None:
    assert calc("n - sign(K1 * K2) * d", n=3000, K1=-60, K2=2, d=10) == 3010
    assert calc("n * D_machine / D_motor", n=1200, D_machine=150, D_motor=300) == 600
    assert calc("pi * 2") == pytest.approx(2 * math.pi)
    assert calc("abs(-3) + min(1, 2, 0.5) + max(4, 5) + sqrt(16) + 2 ** 3") == 20.5
    assert calc("-x + +x", x=4) == 0
    assert calc("sign(0)") == 0


def test_names_in_lists_variables_not_functions() -> None:
    assert names_in(parse("abs(n - d * K1) + pi")) == {"n", "d", "K1", "pi"}


@pytest.mark.parametrize(
    "formula",
    [
        "__import__('os').system('true')",
        "n.__class__",
        "open('x')",
        "[n for n in (1, 2)]",
        "lambda: 1",
        "'text'",
        "True",
        "n if n else 1",
        "n < 2",
        "n // 2",
        "n % 2",
        "abs(x=1)",
        "min(1)",
        "",
        "n +",
        "x" * 501,
    ],
)
def test_rejects_anything_but_arithmetic(formula: str) -> None:
    with pytest.raises(FormulaError):
        parse(formula)


@pytest.mark.parametrize(
    "formula, error",
    [
        ("1 / (n - n)", "division by zero"),
        ("n ** 5", "exponents are limited"),
        ("(-n) ** 0.5", "fractional power"),
        ("sqrt(-n)", "negative"),
        ("unknown + 1", "unknown name 'unknown'"),
        ("10.0 ** 4 ** 4", "exponents are limited"),
    ],
)
def test_evaluation_errors_are_formula_errors(formula: str, error: str) -> None:
    with pytest.raises(FormulaError, match=error):
        calc(formula, n=4)
