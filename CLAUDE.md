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

## Testing

Snapshot tests run against recorded fixtures in `fixtures/{owner}/{repo}/{prNumber}.json`.

- **Run tests**: `npm test`
- **Update snapshots** (after intentional render changes): `npx vitest run --update`
- **Re-record a fixture** (if GitHub API responses change): `npm run record <owner/repo> <pr-number>`
- **Recreate the synthetic fixture repo** from scratch: `npm run setup [-- --owner <owner>]` (defaults to the authenticated `gh` user), then re-record PR #1
