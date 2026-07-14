# PR #1: Add type hints and arithmetic operations

**Author:** danielparks
**State:** open
**Branch:** `feat/type-hints-and-ops` → `main`
**URL:** https://github.com/danielparks-test/gh-pr-render-fixtures/pull/1
**Labels:** feature

> Adds type annotations to all functions and implements `power` and `modulo` operations.

## Changed Files

- `calculator.py` (modified) +12 / -4

## Discussion

### Comment by danielparks less than a minute later (id: 4427286000):

> Overall looks good! The type hints are a nice addition.

### Comment by danielparks less than a minute later (id: 4427286037, minimized: duplicate):

> This is a duplicate of last week's PR.

### Diff comment on `calculator.py` (outdated, id: 3223656523):

```diff
+
+
+def power(a: float, b: int) -> float:
+    result = 1.0
```

#### danielparks less than a minute later:

> This loop runs in O(b) time. Python has a built-in `**` operator.

### Diff comment on `calculator.py` line 13 (id: 3223656596):

```diff
-def divide(a, b):
+def divide(a: float, b: float) -> float:
```

#### danielparks less than a minute later (minimized: outdated):

### Review by danielparks less than a minute later:

> Please add docstrings to each function.

### Diff comment on `calculator.py` (resolved, outdated, id: 3223656785):

```diff
+
+
+def power(base: float, exponent: int) -> float:
```

#### danielparks less than a minute later:

> Nice, much cleaner!

### Diff comment on `calculator.py` line 23 (id: 3223656851):

```diff
+
+
+def power(base: float, exponent: int) -> float:
+    return base ** exponent
+
+
+def modulo(dividend: float, divisor: float) -> float:
```

#### danielparks less than a minute later:

> Good choice of parameter names.

#### danielparks less than a minute later:

> Agreed — much clearer than `a` and `b`.
