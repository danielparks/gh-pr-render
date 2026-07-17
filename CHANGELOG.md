# Change log

All notable changes to this project will be documented in this file.

## main branch

- Render emoji reactions to comments and PRs.
- Add `--version` option to display gh-pr-render version.
- Fixed release process.
- Use metadata from package in `--help` to ensure consistency.
- Set minimum Node version in `package.json`: 20.18.3.

## Release 0.3.0 (2026-07-14)

_This was incorrectly released and the published version was actually just version 0.2.0 again._

- Render PR labels.
- Render descriptions and comments with blockquotes to ensure a distinction between content and structure.
- Add ID to all comments to make it easy for Claude to update them.
- Add `snapshots/` directory with example output.

## Release 0.2.0 (2026-05-12)

- Add ID to review threads to make it easy for Claude to post replies.
- Switch times from being relative to now to being relative to PR creation.
- Tweak output to distinguish top level comments and reviews from replies to comments on diffs.
- Support PR URL as a command line argument.
- Add `--timings` option to print API request times.
- Cut run time from 3.5 seconds to 2 seconds (on my laptop) by running API calls in parallel.

## Release 0.1.0 (2026-05-11)

- Basic functionality.
