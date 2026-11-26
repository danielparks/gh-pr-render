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

## Discussion

### Comment by danielparks less than a minute later (id: 4427286000):

> Overall looks good! The type hints are a nice addition.

#### Reactions

- 👍 danielparks
- 🎉 danielparks

### Inline comment on `calculator.py` line 20 (when commented) (id: PRRT_kwDOSa9ycc6BSipb, outdated):

```diff
+
+
+def power(a: float, b: int) -> float:
+    result = 1.0
```

#### danielparks less than a minute later (id: 3223656523):

> This loop runs in O(b) time. Python has a built-in `**` operator.

### Review by danielparks less than a minute later:

> Please add docstrings to each function.

### Inline comment on `calculator.py` line 19 (when commented) (id: PRRT_kwDOSa9ycc6BSisk, resolved, outdated):

```diff
+
+
+def power(base: float, exponent: int) -> float:
```

#### danielparks less than a minute later (id: 3223656785):

> Nice, much cleaner!

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

### Change request by danielparks-test-1 7 months later:

> Please add tests before merging.

### Comment by danielparks 7 months later (id: 7203762426):

> Tests are coming in a separate PR.

### Comment by danielparks 7 months later (id: 7203762950):

> Local test run:
>
> ```text
> step 1/60: ok
> step 2/60: ok
> step 3/60: ok
> step 4/60: ok
> step 5/60: ok
> step 6/60: ok
> step 7/60: ok
> step 8/60: ok
> step 9/60: ok
> step 10/60: ok
> step 11/60: ok
> step 12/60: ok
> step 13/60: ok
> step 14/60: ok
> step 15/60: ok
> step 16/60: ok
> step 17/60: ok
> step 18/60: ok
> step 19/60: ok
> step 20/60: ok
> step 21/60: ok
> step 22/60: ok
> step 23/60: ok
> step 24/60: ok
> step 25/60: ok
> step 26/60: ok
> step 27/60: ok
> step 28/60: ok
> step 29/60: ok
> step 30/60: ok
> step 31/60: ok
> step 32/60: ok
> step 33/60: ok
> step 34/60: ok
> step 35/60: ok
> step 36/60: ok
> step 37/60: ok
> step 38/60: ok
> step 39/60: ok
> step 40/60: ok
> step 41/60: ok
> step 42/60: ok
> step 43/60: ok
> step 44/60: ok
> step 45/60: ok
> step 46/60: ok
> step 47/60: ok

… 14 more lines omitted — run `gh-pr-render conversation https://github.com/danielparks-test/gh-pr-render-fixtures/pull/1` to see all

### Comment by danielparks-test-1 7 months later (id: 7203763530):

> That works for me, thanks.

### Comment by danielparks 7 months later (id: 7203764098):

> CI is green now.

### Approval by danielparks-test-1 7 months later:

> Looks good now.

### Comment by danielparks 7 months later (id: 7203765186):

> Merging after one more look.

### Comment by danielparks 7 months later (id: 7203765676):

> Thanks for the review!
