# gh-pr-render — Render GitHub PRs with comments for LLM PR reviews

This is a CLI tool that downloads PR comments and reviews from GitHub and formats them into Markdown for easy consumption by LLMs.

The primary use case is helping LLMs keep track of the conversation on a PR when re-reviewing. My GitHub action [danielparks/claude-pr-review] uses `gh-pr-render` to provide context to Claude in automatic PR reviews.

## Example output

<!-- eslint-disable -->
<!-- example-output-start -->

> # PR #1: Add type hints and arithmetic operations
>
> **Author:** danielparks
> **State:** open
> **Branch:** `feat/type-hints-and-ops` → `main`
> **URL:** https://github.com/danielparks-test/gh-pr-render-fixtures/pull/1
> **Labels:** feature
>
> > Adds type annotations to all functions and implements `power` and `modulo` operations.
>
> ## Changed Files
>
> - `calculator.py` (modified) +12 / -4
>
> ## Discussion
>
> ### Comment by danielparks less than a minute later (id: 4427286000):
>
> > Overall looks good! The type hints are a nice addition.
>
> ### Diff comment on `calculator.py` (outdated, id: 3223656523):
>
> ```diff
> +
> +
> +def power(a: float, b: int) -> float:
> +    result = 1.0
> ```
>
> #### danielparks less than a minute later:
>
> > This loop runs in O(b) time. Python has a built-in `**` operator.
>
> ### Review by danielparks less than a minute later:
>
> > Please add docstrings to each function.
>
> ### Diff comment on `calculator.py` (resolved, outdated, id: 3223656785):
>
> ```diff
> +
> +
> +def power(base: float, exponent: int) -> float:
> ```
>
> #### danielparks less than a minute later:
>
> > Nice, much cleaner!
>
> ### Diff comment on `calculator.py` line 23 (id: 3223656851):
>
> ```diff
> +
> +
> +def power(base: float, exponent: int) -> float:
> +    return base ** exponent
> +
> +
> +def modulo(dividend: float, divisor: float) -> float:
> ```
>
> #### danielparks less than a minute later:
>
> > Good choice of parameter names.
>
> #### danielparks less than a minute later:
>
> > Agreed — much clearer than `a` and `b`.

<!-- example-output-end -->
<!-- eslint-enable -->

## License

Unless otherwise noted, this project is dual-licensed under the Apache 2 and MIT licenses. You may choose to use either.

- [Apache License, Version 2.0](LICENSE-APACHE)
- [MIT license](LICENSE-MIT)

### Contributions

Unless you explicitly state otherwise, any contribution you submit as defined in the Apache 2.0 license shall be dual licensed as above, without any additional terms or conditions.

[danielparks/claude-pr-review]: https://github.com/danielparks/claude-pr-review
