# PR #1: Add type hints and arithmetic operations

**Author:** danielparks
**State:** open
**Branch:** `feat/type-hints-and-ops` → `main`
**URL:** https://github.com/danielparks-test/gh-pr-render-fixtures/pull/1
**Labels:** feature
**Milestone:** v1.0
**Assignees:** danielparks

> Adds type annotations to all functions and implements `power` and `modulo` operations.

## Reactions

- 🚀 danielparks

## Commits

- `997eb92` Add type hints and power/modulo operations (gh-pr-render setup)
- `159bc54` Simplify power and modulo using built-in operators (gh-pr-render setup)

## Changed Files

- `calculator.py` (modified) +12 / -4

## Discussion

### Comment by danielparks less than a minute later (id: 4427286000):

> Overall looks good! The type hints are a nice addition.

#### Reactions

- 👍 danielparks
- 🎉 danielparks

### Comment by danielparks less than a minute later (id: 4427286037, minimized: duplicate):

> This is a duplicate of last week's PR.

### Inline comment on `calculator.py` line 20 (when commented) (id: PRRT_kwDOSa9ycc6BSipb, outdated):

```diff
+
+
+def power(a: float, b: int) -> float:
+    result = 1.0
```

#### danielparks less than a minute later (id: 3223656523):

> This loop runs in O(b) time. Python has a built-in `**` operator.

### Inline comment on `calculator.py` line 13 (id: PRRT_kwDOSa9ycc6BSiqV):

```diff
-def divide(a, b):
+def divide(a: float, b: float) -> float:
```

#### danielparks less than a minute later (id: 3223656596, minimized: outdated):

### Review by danielparks less than a minute later:

> Please add docstrings to each function.

### Inline comment on `calculator.py` line 19 (when commented) (id: PRRT_kwDOSa9ycc6BSisk, resolved, outdated):

#### danielparks less than a minute later (id: 3223656785):

> Nice, much cleaner!

Collapsed (1 comment) — run `gh-pr-render thread PRRT_kwDOSa9ycc6BSisk` to see all

### Inline comment on `calculator.py` line 23 (id: PRRT_kwDOSa9ycc6BSitZ):

```diff
+
+
+def power(base: float, exponent: int) -> float:
+    return base ** exponent
+
+
+def modulo(dividend: float, divisor: float) -> float:
```

#### danielparks less than a minute later (id: 3223656851):

> Good choice of parameter names.

#### danielparks less than a minute later (id: 3223656909):

> Agreed — much clearer than `a` and `b`.

##### Reactions

- 👀 danielparks

### Inline comment on `calculator.py` lines 5–9 (id: PRRT_kwDOSa9ycc65VME5):

```diff
+def subtract(a: float, b: float) -> float:
     return a - b
 
 
-def multiply(a, b):
+def multiply(a: float, b: float) -> float:
```

#### danielparks 6 months later (id: 4624495958):

> Comment on new lines 5–9, with a removed line in the middle.

### Inline comment on `calculator.py` lines 9 (old file) – 10 (new file) (id: PRRT_kwDOSa9ycc65VMF_):

```diff
-def multiply(a, b):
+def multiply(a: float, b: float) -> float:
     return a * b
```

#### danielparks 6 months later (id: 4624496083):

> Comment from old line 9 through new line 10, crossing sides.

### Inline comment on `calculator.py` lines 13 (old file) – 13 (new file) (id: PRRT_kwDOSa9ycc65VMHE):

```diff
-def divide(a, b):
+def divide(a: float, b: float) -> float:
```

#### danielparks 6 months later (id: 4624496187):

> Comment from old line 13 to new line 13: same number, different sides.

### Inline comment on `calculator.py` line 1 (old file) (id: PRRT_kwDOSa9ycc65VMID):

```diff
-def add(a, b):
```

#### danielparks 6 months later (id: 4624496288):

> Comment on a removed line.
