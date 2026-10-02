"""Speed formulas of machine profiles: a small, safe arithmetic language.

A profile describes each component's speed as a formula, the way a
commissioning sheet does, e.g. ``n - sign(K1*K2) * d`` for the scroll of a
decanter. Formulas are parsed with Python's own parser and evaluated by
walking the tree, so only the constructs below run — never `eval`:

* numbers, ``+ - * / **`` and parentheses (an exponent at most 4 in size)
* names: ``n`` (the bowl speed, rpm), ``pi``, the profile's parameters and
  the components declared before this one
* functions: ``abs``, ``sign``, ``min``, ``max``, ``sqrt``

Everything a formula can do is arithmetic on floats, so a profile shared by
someone else cannot run code.
"""

from __future__ import annotations

import ast
import math
import operator
import re
from collections.abc import Callable, Mapping

#: Longest formula accepted (characters).
MAX_LENGTH = 500
#: The size of an exponent is capped so a formula cannot build huge numbers.
MAX_EXPONENT = 4

#: Names every formula can use; profiles cannot define them again.
RESERVED_NAMES = frozenset({"n", "pi", "abs", "sign", "min", "max", "sqrt"})

IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,39}$")


class FormulaError(ValueError):
    """A formula that does not parse, names something unknown, or cannot be
    evaluated (division by zero, root of a negative number)."""


def _sign(x: float) -> float:
    return float((x > 0) - (x < 0))


def _sqrt(x: float) -> float:
    if x < 0:
        raise FormulaError("square root of a negative number")
    return math.sqrt(x)


_FUNCTIONS: dict[str, tuple[Callable[..., float], int, int]] = {
    # name: (function, fewest arguments, most arguments)
    "abs": (abs, 1, 1),
    "sign": (_sign, 1, 1),
    "sqrt": (_sqrt, 1, 1),
    "min": (min, 2, 8),
    "max": (max, 2, 8),
}

_BINARY: dict[type[ast.operator], Callable[[float, float], float]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
}


def parse(formula: str) -> ast.expr:
    """Parse a formula; FormulaError if it is not one this language allows."""
    text = formula.strip()
    if not text:
        raise FormulaError("the formula is empty")
    if len(text) > MAX_LENGTH:
        raise FormulaError(f"the formula is longer than {MAX_LENGTH} characters")
    try:
        tree = ast.parse(text, mode="eval")
    except SyntaxError as exc:
        raise FormulaError(f"cannot read the formula ({exc.msg})") from exc
    _check(tree.body)
    return tree.body


def _check(node: ast.AST) -> None:
    """Allow only the constructs listed in the module docstring."""
    match node:
        case ast.Constant(value=value):
            if isinstance(value, bool) or not isinstance(value, int | float):
                raise FormulaError("only numbers can appear as values")
        case ast.Name():
            pass
        case ast.UnaryOp(op=ast.UAdd() | ast.USub(), operand=operand):
            _check(operand)
        case ast.BinOp(op=op, left=left, right=right) if type(op) in _BINARY:
            _check(left)
            _check(right)
        case ast.Call(func=ast.Name(id=name), args=args, keywords=[]) if name in _FUNCTIONS:
            _, lo, hi = _FUNCTIONS[name]
            if not lo <= len(args) <= hi:
                raise FormulaError(f"{name}() takes {lo}–{hi} arguments, got {len(args)}")
            for arg in args:
                _check(arg)
        case ast.Call():
            raise FormulaError("only abs, sign, min, max and sqrt can be called")
        case _:
            raise FormulaError(f"'{ast.unparse(node)}' is not allowed in a formula")


def names_in(tree: ast.expr) -> set[str]:
    """The variable names a parsed formula reads (function names excluded)."""
    called = {
        id(n.func)
        for n in ast.walk(tree)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
    }
    return {n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and id(n) not in called}


def evaluate(tree: ast.expr, variables: Mapping[str, float]) -> float:
    """Evaluate a parsed formula with the given variables (rpm, ratios, …)."""
    try:
        value = _eval(tree, variables)
    except ZeroDivisionError as exc:
        raise FormulaError("division by zero") from exc
    except OverflowError as exc:
        raise FormulaError("the result is too large") from exc
    if not math.isfinite(value):
        raise FormulaError("the result is not a finite number")
    return value


def _eval(node: ast.AST, env: Mapping[str, float]) -> float:
    match node:
        case ast.Constant(value=value):
            return float(value)
        case ast.Name(id="pi"):
            return math.pi
        case ast.Name(id=name):
            if name not in env:
                raise FormulaError(f"unknown name '{name}'")
            return float(env[name])
        case ast.UnaryOp(op=ast.USub(), operand=operand):
            return -_eval(operand, env)
        case ast.UnaryOp(operand=operand):
            return _eval(operand, env)
        case ast.BinOp(op=ast.Pow(), left=left, right=right):
            exponent = _eval(right, env)
            if abs(exponent) > MAX_EXPONENT:
                raise FormulaError(f"exponents are limited to ±{MAX_EXPONENT}")
            result = _eval(left, env) ** exponent
            if isinstance(result, complex):
                raise FormulaError("fractional power of a negative number")
            return result
        case ast.BinOp(op=op, left=left, right=right):
            return _BINARY[type(op)](_eval(left, env), _eval(right, env))
        case ast.Call(func=ast.Name(id=name), args=args):
            fn = _FUNCTIONS[name][0]
            return float(fn(*(_eval(a, env) for a in args)))
    raise FormulaError("unsupported formula")  # unreachable after _check
