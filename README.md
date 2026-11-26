# gh-pr-render — Render GitHub PRs with comments for LLM PR reviews

This is a CLI tool that downloads PR comments and reviews from GitHub and formats them into Markdown for easy consumption by LLMs.

The primary use case is helping LLMs keep track of the conversation on a PR when re-reviewing. My GitHub action [danielparks/claude-pr-review] uses `gh-pr-render` to provide context to Claude in automatic PR reviews.

## Using to render a PR

```text
gh-pr-render [options] <pr-url>
gh-pr-render [options] <owner/repo> <pr-number>
gh-pr-render [options] <pr-number | branch-name>
gh-pr-render [options]
```

If the PR number or repo isn’t specified, `gh-pr-render` will determine them based on the branch name and remote URL.

Options:

- `--help` — show usage information.
- `--version` — show release version.
- `--include-minimized` — include minimized comments, marked with their reason. Off by default: minimized comments are usually outdated or off-topic noise.
- `--no-files` — omit the `## Changed Files` list.
- `--no-commits` — omit the `## Commits` list.
- `--comment-head-limit <n>` — comments and reviews to show at the start of a long conversation, or comments to show at the start of an inline thread (default: 20).
- `--comment-tail-limit <n>` — likewise for the end (default: 20).
- `--diff-hunk-limit <n>` — maximum lines of diff to show above each inline comment; the commented lines are never cut (default: 10, 0 for no limit). Also accepted by `thread`.
- `--body-line-limit <n>` — maximum lines of each top-level comment, review, and inline comment body to show; a note says how many lines were cut (default: 50, 0 for no limit). Doesn’t apply to the PR description, or to `conversation` and `thread`, which always show bodies in full.
- `--no-collapse-resolved` — show resolved inline threads in full. By default they’re collapsed to their location, the first line of the first comment, and a pointer to `thread`.
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

## Using to render a comment thread

```text
gh-pr-render thread <thread-id>
```

Fetch and display all comments in a single review thread. Pass the thread ID shown in `gh-pr-render` output, e.g. `RT_kwDO...`.

## Using to render the whole conversation

```text
gh-pr-render conversation [repo-or-pr] [pr]
```

Fetch and display every top-level comment and overall review on a PR, in order and with bodies in full. This is what to run when `gh-pr-render` output says “N comments and reviews omitted” or cuts a body short. Takes the same PR arguments as `gh-pr-render`, and `--include-minimized`.

## Example output

Long comment bodies are cut short here (`--body-line-limit 5`) to keep the example brief.

<!-- rumdl-disable -->
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
> ### Inline comment on `calculator.py` line 20 (when commented) (id: PRRT_kwDOSa9ycc6BSipb, outdated):
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
> ### Inline comment on `calculator.py` line 19 (when commented) (id: PRRT_kwDOSa9ycc6BSisk, resolved, outdated):
>
> #### danielparks less than a minute later (id: 3223656785):
>
> > Nice, much cleaner!
>
> Collapsed (1 comment) — run `gh-pr-render thread PRRT_kwDOSa9ycc6BSisk` to see all
>
> ### Inline comment on `calculator.py` line 23 (id: PRRT_kwDOSa9ycc6BSitZ):
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
>
> ### Inline comment on `calculator.py` lines 5–9 (id: PRRT_kwDOSa9ycc65VME5):
>
> ```diff
> +def subtract(a: float, b: float) -> float:
>      return a - b
>
>
> -def multiply(a, b):
> +def multiply(a: float, b: float) -> float:
> ```
>
> #### danielparks 6 months later (id: 4624495958):
>
> > Comment on new lines 5–9, with a removed line in the middle.
>
> ### Inline comment on `calculator.py` lines 9 (old file) – 10 (new file) (id: PRRT_kwDOSa9ycc65VMF_):
>
> ```diff
> -def multiply(a, b):
> +def multiply(a: float, b: float) -> float:
>      return a * b
> ```
>
> #### danielparks 6 months later (id: 4624496083):
>
> > Comment from old line 9 through new line 10, crossing sides.
>
> ### Inline comment on `calculator.py` lines 13 (old file) – 13 (new file) (id: PRRT_kwDOSa9ycc65VMHE):
>
> ```diff
> -def divide(a, b):
> +def divide(a: float, b: float) -> float:
> ```
>
> #### danielparks 6 months later (id: 4624496187):
>
> > Comment from old line 13 to new line 13: same number, different sides.
>
> ### Inline comment on `calculator.py` line 1 (old file) (id: PRRT_kwDOSa9ycc65VMID):
>
> ```diff
> -def add(a, b):
> ```
>
> #### danielparks 6 months later (id: 4624496288):
>
> > Comment on a removed line.

<!-- example-output-end -->
<!-- rumdl-enable -->

See [`snapshots/`] for more examples of rendered output, including inline comments, reviews, and minimized comments.

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
