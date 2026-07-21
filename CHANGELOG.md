# Change log

All notable changes to this project will be documented in this file.

## main branch

### Security

- Minor: updated transitive dev dependency [brace-expansion] to avoid denial of service vulnerability ([GHSA-3jxr-9vmj-r5cp]). Realistically this could not have been exploited, since it was only used by eslint.

[brace-expansion]: https://www.npmjs.com/package/brace-expansion
[GHSA-3jxr-9vmj-r5cp]: https://github.com/advisories/GHSA-3jxr-9vmj-r5cp

### Changes

- Added when and how a PR was closed (merged vs. closed without merging) to PR rendering.
- Added requested reviewers (team and user), assignees, draft status, and milestone to PR rendering.
- Added a `## Commits` list (short sha, subject, author) to PR rendering.
- Added `--no-files` and `--no-commits` options to omit the changed-files and commits lists, respectively.

## Release 0.4.0 (2026-07-17)

- Updated to render PR descriptions and comments with blockquotes to ensure a distinction between content and structure.
- Added emoji reactions to comments and PRs.
- Added PR labels.
- Added ID to all comments to make it easy for Claude to update them.
- Added `snapshots/` directory with example output.
- Added `--version` option to display gh-pr-render version.
- Fixed release process; version 0.3.0 was actually just a copy of 0.2.0.
- Used metadata from package in `--help` to ensure consistency.
- Set minimum Node version in `package.json`: 20.18.3.

## Release 0.3.0 (2026-07-14)

_Accidentally republished version 0.2.0 as 0.3.0._

## Release 0.2.0 (2026-05-12)

- Add ID to review threads to make it easy for Claude to post replies.
- Switch times from being relative to now to being relative to PR creation.
- Tweak output to distinguish top level comments and reviews from replies to comments on diffs.
- Support PR URL as a command line argument.
- Add `--timings` option to print API request times.
- Cut run time from 3.5 seconds to 2 seconds (on my laptop) by running API calls in parallel.

## Release 0.1.0 (2026-05-11)

- Basic functionality.
