// Comment lists longer than head + tail limit are rendered as their first
// `head` and last `tail` entries, with a note on how many were omitted in
// between, rather than in full. Applies to top-level PR comments (render.ts)
// and individual review-thread comments (fetch.ts fetches the tail
// separately when a thread has more comments than fit in one page;
// render.ts does the head/tail slicing and reports the omitted count).
//
// These are just the CLI's default values (see index.ts) — both limits are
// configurable per invocation via RenderOptions/FetchOptions.
export const DEFAULT_COMMENT_HEAD_LIMIT = 20;
export const DEFAULT_COMMENT_TAIL_LIMIT = 20;

// GitHub GraphQL connections reject `first`/`last` above 100, regardless of
// how high a caller sets --comment-head-limit/--comment-tail-limit.
// Requesting more than this just yields a shorter head/tail than asked for,
// rather than erroring.
export const MAX_PAGE_SIZE = 100;
