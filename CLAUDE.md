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

## Testing

Snapshot tests run against recorded fixtures in `fixtures/{owner}/{repo}/{prNumber}.json`.

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
