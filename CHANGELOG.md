# Change log

All notable changes to this project will be documented in this file.

## Release 0.2.0 (2026-05-12)

- Add ID to review threads to make it easy for Claude to post replies.
- Switch times from being relative to now to being relative to PR creation.
- Tweak output to distinguish top level comments and reviews from replies to comments on diffs.
- Support PR URL as a command line argument.
- Add `--timings` option to print API request times.
- Cut run time from 3.5 seconds to 2 seconds (on my laptop) by running API calls in parallel.

## Release 0.1.0 (2026-05-11)

- Basic functionality.
