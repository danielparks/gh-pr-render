# gh-pr-render

CLI tool that fetches a GitHub PR and renders it as markdown for LLM consumption — a structured timeline of diff comment threads, top-level comments, and review summaries.

## TypeScript

Two strict flags are active beyond the defaults:

- `noUncheckedIndexedAccess` — array indexing returns `T | undefined`, not `T`
- `exactOptionalPropertyTypes` — optional properties cannot be explicitly set to `undefined`

These require specific patterns and are easy to violate accidentally. Run `npm run check` to verify.

`npm run check` uses `tsconfig.check.json`, not `tsconfig.json` directly — the build config's `rootDir: "src"` can't include `scripts/` or emit `.test.ts` files into `dist`, so the check-only config widens `rootDir` to the repo root, includes every `**/*.ts` file (also picking up root-level config files like `vitest.config.ts`), and sets `noEmit`. Without this, `scripts/*.ts`, `src/**/*.test.ts`, and config-file type errors (e.g. a helper call missing a newly required option) go unnoticed until something breaks at runtime. The build config (`tsconfig.json`) excludes those same root-level `.ts`/`.mts` files so they don't get compiled into `dist`.

## Data fetching

Uses a mix of REST (`gh api` via `execSync`) and GraphQL (`@octokit/graphql`):

- **REST**: PR metadata, changed files, reviews — no GraphQL-only fields needed
- **GraphQL**: Top-level comments and diff review threads — required for `isMinimized`/`minimizedReason` (both types) and `isResolved`/`isOutdated` (threads), which are not exposed by the REST API

Auth falls back through `GH_TOKEN` → `GITHUB_TOKEN` → `gh auth token`.

## Rendering decisions

### Empty-body `COMMENTED` reviews do not appear themselves

They are just grouping containers for diff comments and carry no information of their own. Only reviews with a body, or with state `APPROVED`, `CHANGES_REQUESTED`, or `DISMISSED`, appear as timeline entries.

### Minimized comments are filtered out by default

`--include-minimized` includes them marked with their reason. A minimized root comment causes its entire diff thread to be skipped.

### All free-text bodies (PR description, comments, reviews) are rendered as blockquotes

The primary consumer is an LLM, and the `> ` prefix on every line makes it structurally impossible for a body — which can contain arbitrary markdown, including its own headings or `---` rules — to be mistaken for renderer-generated structure.

### Every comment — top-level and diff-thread replies alike — renders its `databaseId`

Replying to or resolving a specific comment requires its ID.

### Every inline comment thread renders its GraphQL thread `id`

Resolving a thread requires the thread's node ID so it's exposed in the thread header (e.g. `id: RT_kwDO...`) in addition to the per-comment `databaseId`s.

### Top-level comments and overall reviews are one list, elided together

GitHub's UI shows them as a single conversation, and they often refer to each other, so a conversation's first `--comment-head-limit` and last `--comment-tail-limit` entries are shown (default 20 + 20) with an "N comments and reviews omitted" marker pointing to the `conversation` subcommand.

Only comments are fetched as head/tail slices; all top-level reviews are fetched at once via REST (there are rarely many), which lets empty `COMMENTED` reviews be filtered out before counting. The combined head is then exactly the first N of (first N comments + all reviews), and likewise for the tail, so the omitted count is exact. This relies on `compareItems` giving one fixed order. **Each reviewer's latest `APPROVED`/`CHANGES_REQUESTED` review is kept even when it falls in the omitted middle** (not counted as omitted, and not if it was dismissed), so the PR's status is never hidden by truncation. The "omitted" marker is placed just before the first entry kept after the omitted items (a pinned review, else the tail), since inline threads are interleaved with them by time and omitted comments' timestamps aren't fetched.

### Each inline thread's comments are elided the same way, separately

Thread comments are capped by the same limits, with a marker pointing to the `thread <id>` subcommand. The review-threads list itself is still fetched and rendered in full: truncating it would be misleading since each thread is anchored to a different file/line rather than being one chronological conversation.

### Comment bodies are cut at `--body-line-limit` lines (default 50)

The action consuming this output limits bytes, and a single pasted log or bot report can outweigh the rest of the discussion. A note after the blockquote (outside it, since it is renderer-generated) says how many lines were cut and names `conversation` or `thread`. It applies to top-level comments, reviews, and inline comments, but **not to the PR description** (usually the most important text). The `conversation` and `thread` subcommands never cut bodies, so there is always a way to see everything.

This counts lines, not bytes, so one enormous line gets through.

### Resolved inline threads are collapsed by default

They collapse down to their location, the first comment's first line, and a pointer to `thread <id>`. `--no-collapse-resolved` shows them in full. **Unresolved threads are never collapsed, even when outdated**, since an outdated thread may still be unaddressed. `thread <id>` never collapses.

## The `## Commits` section renders "No commits." when a PR has none

A PR with no commits is unusual enough to call out rather than silently omit.

## Testing

Snapshot tests run against recorded fixtures in `fixtures/{owner}/{repo}/{prNumber}.json`. Expected output is stored as rendered markdown files in `snapshots/{owner}-{repo}-{prNumber}[.variant].md` (via `toMatchFileSnapshot`) rather than in a single `.snap` file, so a PR's rendered output can be viewed directly on GitHub.

- **Run tests**: `npm test`
- **Recreate fixtures, snapshots, and README**: `scripts/update-tests.sh`

`src/render.test.ts` was split by concern once it passed 1000 lines: `render.helpers.test.ts` (small formatting helpers), `render.snapshot.test.ts` (the fixture-driven snapshot tests above), `render.top-comments.test.ts`, `render.conversation.test.ts` (merged comment/review truncation and the `conversation` subcommand), and `render.thread-comments.test.ts`. Put new render tests in whichever of these they match, rather than growing one file again.

### Updating test PR fixture generation

Adding a new rendering scenario, e.g. a new comment type or a label, means adding it to `scripts/setup.ts`. That script is idempotent — it doesn't recreate the PR if it already exists, it just applies whatever new step you added — so the full loop for the canonical `danielparks-test/gh-pr-render-fixtures` PR #1 fixture is:

```sh
scripts/update-tests.sh
```

Requires `gh` auth with write access to that repo (`gh auth login`). The conversation scenario (approvals and change requests) also needs a second GitHub account, `danielparks-test-1`, because GitHub rejects those reviews from a PR's author: log in as it too with `gh auth login` (`gh auth token --user` finds the token), or set `GH_REVIEWER_TOKEN`. Without it that scenario is skipped, with a note. If `npm run setup` fails cloning with `Permission denied (publickey)`, `gh` is set to clone over SSH but no SSH key is configured — fix with `gh config set -h github.com git_protocol https`.

## Committing

Make commits for logical changes, creating a new branch if on `main`.

Run `npm install` to deal with environment differences before committing.
