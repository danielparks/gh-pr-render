# gh-pr-render

CLI tool that fetches a GitHub PR and renders it as markdown for LLM consumption — a structured timeline of diff comment threads, top-level comments, and review summaries.

## TypeScript

Two strict flags are active beyond the defaults:

- `noUncheckedIndexedAccess` — array indexing returns `T | undefined`, not `T`
- `exactOptionalPropertyTypes` — optional properties cannot be explicitly set to `undefined`

These require specific patterns and are easy to violate accidentally. Run `npm run check` to verify.

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

## Testing

Snapshot tests run against recorded fixtures in `fixtures/{owner}/{repo}/{prNumber}.json`. Expected output is stored as rendered markdown files in `snapshots/{owner}/{repo}/{prNumber}[.variant].md` (via `toMatchFileSnapshot`) rather than in a single `.snap` file, so a PR's rendered output can be viewed directly on GitHub.

- **Run tests**: `npm test`
- **Update snapshots** (after intentional render changes): `npx vitest run --update`
- **Re-record a fixture** (if GitHub API responses change): `npm run record <owner/repo> <pr-number>`
- **Recreate the synthetic fixture repo** from scratch: `npm run setup [-- --owner <owner>]` (defaults to the authenticated `gh` user), then re-record PR #1

### Updating test PR fixture generation

Adding a new rendering scenario, e.g. a new comment type or a label, means adding it to `scripts/setup.ts`. That script is idempotent — it doesn't recreate the PR if it already exists, it just applies whatever new step you added — so the full loop for the canonical `danielparks-test/gh-pr-render-fixtures` PR #1 fixture is:

```sh
npm run setup
npm run record danielparks-test/gh-pr-render-fixtures 1
npm run update-readme
npx vitest run --update
```

Requires `gh` auth with write access to that repo (`gh auth login`). If `npm run setup` fails cloning with `Permission denied (publickey)`, `gh` is set to clone over SSH but no SSH key is configured — fix with `gh config set -h github.com git_protocol https`.

## Committing

Make commits for logical changes, creating a new branch if on `main`.

Run `npm install` to deal with environment differences before committing.

This repo is managed with `jj` (Jujutsu), colocated with git. Plain `git commit` works fine — the pre-commit hooks run either way — but it leaves `HEAD` detached (normal for jj; don't try to "fix" it) and does **not** move the current branch's jj bookmark. After committing with `git commit`, run `jj bookmark set <branch-name> -r @-` to bring the bookmark up to the new commit — `@-` is reliably the commit `git commit` just made, since jj auto-imports it as the parent of a new empty working-copy commit. Skipping this leaves the branch looking stale to `jj log`/`jj bookmark list` and to anything that pushes from the bookmark rather than from git HEAD.
