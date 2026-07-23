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

**Empty-body `COMMENTED` reviews are intentionally excluded** from the timeline. They are just grouping containers for diff comments and carry no information of their own. Only reviews with a body, or with state `APPROVED`, `CHANGES_REQUESTED`, or `DISMISSED`, appear as timeline entries.

**Minimized comments are filtered out by default.** `--include-minimized` includes them marked with their reason. A minimized root comment causes its entire diff thread to be skipped.

**All free-text bodies (PR description, comments, reviews) are rendered as blockquotes.** The primary consumer is an LLM, and the `> ` prefix on every line makes it structurally impossible for a body — which can contain arbitrary markdown, including its own headings or `---` rules — to be mistaken for renderer-generated structure. Because that boundary is unambiguous on its own, the `---` thematic breaks that used to separate the PR body and timeline entries were removed as redundant; headings plus the blockquote marker already delimit sections.

**Every comment — top-level and diff-thread replies alike — renders its `databaseId`.** The main use case is an LLM (e.g. Claude) picking the conversation back up: replying to or resolving a specific comment requires its ID, so every comment gets one, not just the first comment in a thread.

**Every inline comment thread renders its GraphQL thread `id`, not just each comment's `databaseId`.** Resolving a thread requires the thread's node ID — a comment's `databaseId` only supports replying — so it's exposed in the thread header (e.g. `id: RT_kwDO...`) alongside the per-comment `databaseId`s.

**Long comment lists are truncated to head + tail, not fetched or rendered in full.** Top-level comments and each inline thread's comments are capped by `--comment-head-limit`/`--comment-tail-limit` (default 20 + 20); a gap is shown as an "N comments omitted" marker naming the `thread <id>` subcommand so an LLM knows how to get the rest of a specific thread. This exists because PRs can accumulate hundreds of comments, and the previous behavior silently dropped anything past the first 100 fetched. The review-threads list itself and the reviews list are still fetched and rendered in full — reviews rarely run long, and truncating threads the same way would be misleading since each is anchored to a different file/line rather than being one chronological conversation.

**The `## Commits` section renders "No commits." explicitly when a PR has none**, rather than an empty section, since a PR with no commits is unusual enough to call out rather than silently omit.

## Testing

Snapshot tests run against recorded fixtures in `fixtures/{owner}/{repo}/{prNumber}.json`. Expected output is stored as rendered markdown files in `snapshots/{owner}-{repo}-{prNumber}[.variant].md` (via `toMatchFileSnapshot`) rather than in a single `.snap` file, so a PR's rendered output can be viewed directly on GitHub.

- **Run tests**: `npm test`
- **Recreate fixtures, snapshots, and README**: `scripts/update-tests.sh`

`src/render.test.ts` was split by concern once it passed 1000 lines: `render.helpers.test.ts` (small formatting helpers), `render.snapshot.test.ts` (the fixture-driven snapshot tests above), `render.top-comments.test.ts`, and `render.thread-comments.test.ts`. Put new render tests in whichever of these they match, rather than growing one file again.

### Updating test PR fixture generation

Adding a new rendering scenario, e.g. a new comment type or a label, means adding it to `scripts/setup.ts`. That script is idempotent — it doesn't recreate the PR if it already exists, it just applies whatever new step you added — so the full loop for the canonical `danielparks-test/gh-pr-render-fixtures` PR #1 fixture is:

```sh
scripts/update-tests.sh
```

Requires `gh` auth with write access to that repo (`gh auth login`). If `npm run setup` fails cloning with `Permission denied (publickey)`, `gh` is set to clone over SSH but no SSH key is configured — fix with `gh config set -h github.com git_protocol https`.

## Committing

Make commits for logical changes, creating a new branch if on `main`.

Run `npm install` to deal with environment differences before committing.

This repo is managed with `jj` (Jujutsu), colocated with git. Plain `git commit` works fine — the pre-commit hooks run either way — but it leaves `HEAD` detached (normal for jj; don't try to "fix" it) and does **not** move the current branch's jj bookmark. After committing with `git commit`, run `jj bookmark set <branch-name> -r @-` to bring the bookmark up to the new commit — `@-` is reliably the commit `git commit` just made, since jj auto-imports it as the parent of a new empty working-copy commit. Skipping this leaves the branch looking stale to `jj log`/`jj bookmark list` and to anything that pushes from the bookmark rather than from git HEAD.
