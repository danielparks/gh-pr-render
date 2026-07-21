# gh-pr-render — Render GitHub PRs with comments for LLM PR reviews

This is a CLI tool that downloads PR comments and reviews from GitHub and formats them into Markdown for easy consumption by LLMs.

The primary use case is helping LLMs keep track of the conversation on a PR when re-reviewing. My GitHub action [danielparks/claude-pr-review] uses `gh-pr-render` to provide context to Claude in automatic PR reviews.

## Options

- `--include-minimized` — include minimized comments, marked with their reason. Off by default: minimized comments are usually outdated or off-topic noise.
- `--no-files` — omit the `## Changed Files` list.
- `--no-commits` — omit the `## Commits` list.
- `--timings` — print request timings to stderr.

### When to use `--no-files` / `--no-commits`

The changed-files and commits lists are included by default because they're cheap (a line or two per entry) and, in practice, get checked on nearly every review regardless of PR shape — an LLM reviewer tends to want an overview of scope before diving into any diff. Neither list embeds the diff itself; that still comes from wherever the consumer reads it (e.g. `git diff` against an already-checked-out PR branch, as in [danielparks/claude-pr-review]).

Reasons to drop one or both:

- **The consumer already has git access and you'd rather it choose when to spend a step on `git log` / `git diff --stat`,** instead of paying for that context on every render regardless of whether it's used.
- **Squash-merge workflows**, where the single commit message just repeats the PR body — `--no-commits` costs nothing to add and removes pure duplication.
- **Minimal-context surfaces** where only the discussion matters, not the scaffolding around it.

Reasons to keep the defaults:

- **Commits structured as logical units** (not "wip"/"fix typo" churn) — subjects describe the shape of the change, and are cheap to cross-reference against review-thread timestamps to check whether feedback was actually addressed.
- **Large or noisy PRs** (generated files, lockfiles, vendored updates mixed with the real change) — the file list is how a reviewer decides what to skip _before_ opening any diff, human or LLM.

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
> **Milestone:** v1.0
> **Assignees:** danielparks
>
> > Adds type annotations to all functions and implements `power` and `modulo` operations.
>
> ## Reactions
>
> - 🚀 danielparks
>
> ## Commits
>
> - `997eb92` Add type hints and power/modulo operations (gh-pr-render setup)
> - `159bc54` Simplify power and modulo using built-in operators (gh-pr-render setup)
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
> #### Reactions
>
> - 👍 danielparks
> - 🎉 danielparks
>
> ### Diff comment on `calculator.py` (outdated):
>
> ```diff
> +
> +
> +def power(a: float, b: int) -> float:
> +    result = 1.0
> ```
>
> #### danielparks less than a minute later (id: 3223656523):
>
> > This loop runs in O(b) time. Python has a built-in `**` operator.
>
> ### Review by danielparks less than a minute later:
>
> > Please add docstrings to each function.
>
> ### Diff comment on `calculator.py` (resolved, outdated):
>
> ```diff
> +
> +
> +def power(base: float, exponent: int) -> float:
> ```
>
> #### danielparks less than a minute later (id: 3223656785):
>
> > Nice, much cleaner!
>
> ### Diff comment on `calculator.py` line 23:
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
> #### danielparks less than a minute later (id: 3223656851):
>
> > Good choice of parameter names.
>
> #### danielparks less than a minute later (id: 3223656909):
>
> > Agreed — much clearer than `a` and `b`.
>
> ##### Reactions
>
> - 👀 danielparks

<!-- example-output-end -->
<!-- eslint-enable -->

See [`snapshots/`] for more examples of rendered output, including diff comments, reviews, and minimized comments.

## License

Unless otherwise noted, this project is dual-licensed under the Apache 2 and MIT licenses. You may choose to use either.

- [Apache License, Version 2.0][LICENSE-APACHE]
- [MIT license][LICENSE-MIT]

### Contributions

Unless you explicitly state otherwise, any contribution you submit as defined in the Apache 2.0 license shall be dual licensed as above, without any additional terms or conditions.

[danielparks/claude-pr-review]: https://github.com/danielparks/claude-pr-review
[`snapshots/`]: snapshots/
[LICENSE-APACHE]: LICENSE-APACHE
[LICENSE-MIT]: LICENSE-MIT
