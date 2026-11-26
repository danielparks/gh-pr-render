import { formatDistance } from "date-fns";
import { DEFAULT_BODY_LINE_LIMIT, DEFAULT_DIFF_HUNK_LIMIT } from "./limits.js";
import { trimDiffHunk } from "./hunk.js";
import type {
  Commit,
  ConversationData,
  DiffSide,
  IssueComment,
  PRData,
  PullRequest,
  PullRequestRef,
  ReactionContent,
  ReactionGroup,
  Review,
  ReviewState,
  ReviewThread,
  ThreadComment,
  TruncatedCommentList,
} from "./types.js";

function formatDate(iso: string, baseDate: string): string {
  return formatDistance(iso, baseDate) + " later";
}

// Prefixes every line with "> ".
//
// This ensures bodies containing arbitrary markdown are always visually and
// structurally distinct from renderer-generated structure.
//
// This normalizes CRLF to LF and strips a single trailing newline if it exists.
export function blockquote(text: string): string {
  return text
    .replace(/\r\n/gm, "\n")
    .replace(/\n$/, "")
    .replace(/^/gm, "> ")
    .replace(/^> $/gm, ">");
}

// Like `blockquote`, but keeps only the first `limit` lines (0 = unlimited).
// If lines were cut, a note follows the quote — outside of it, since it’s
// renderer-generated, not part of the body. `hint` says how to see the rest.
//
// Returns string lines without newlines.
function quoteBody(body: string, limit: number, hint: string): string[] {
  const lines = body.replace(/\r\n/gm, "\n").replace(/\n$/, "").split("\n");
  if (limit === 0 || lines.length <= limit) return [blockquote(body)];

  const omitted = lines.length - limit;
  return [
    blockquote(lines.slice(0, limit).join("\n")),
    "",
    `… ${omitted} more ${omitted === 1 ? "line" : "lines"} omitted — ${hint}`,
  ];
}

const REACTION_EMOJI: Record<ReactionContent, string> = {
  THUMBS_UP: "👍",
  THUMBS_DOWN: "👎",
  LAUGH: "😄",
  HOORAY: "🎉",
  CONFUSED: "😕",
  HEART: "❤️",
  ROCKET: "🚀",
  EYES: "👀",
};

// Displays emoji reactions and their authors.
//
// Only displays header if there are reactions. Shows reactions we don’t have
// authors for with “(+N more)” (see REACTOR_LIMIT in fetch.ts).
//
// Returns string lines without newlines.
export function formatReactions(
  groups: ReactionGroup[],
  heading: string,
): string[] {
  const nonEmpty = groups.filter((group) => group.reactors.totalCount > 0);
  if (nonEmpty.length === 0) return [];

  const lines = nonEmpty.map((group) => {
    const logins = group.reactors.nodes.map((node) => node.login);
    const remaining = group.reactors.totalCount - logins.length;
    const more = remaining > 0 ? ` (+${remaining} more)` : "";
    return `- ${REACTION_EMOJI[group.content]} ${logins.join(", ")}${more}`;
  });

  return ["", heading, "", ...lines];
}

interface TruncatedComments<T> {
  head: T[];
  omittedCount: number;
  tail: T[];
}

// Reconciles a comment list's separately fetched head and tail slices (see
// TruncatedCommentList in types.ts) into what to actually render, so long
// lists (e.g. a very active thread, or a PR with hundreds of top-level
// comments) show as "first N ... M omitted ... last N" instead of in full.
//
// `headNodes`/`tailNodes` were fetched with their own head/tail sizes (see
// FetchOptions in fetch.ts), which should be at least headLimit/tailLimit —
// a smaller fetch just yields a shorter head/tail than requested here, not
// an error. When totalCount is small enough that both slices were requested
// past the end of the list, they overlap in the middle; that overlap is
// trimmed out rather than deduplicated by identity, since connection
// ordering guarantees the overlap is exactly the last
// `headNodes.length + tailNodes.length - totalCount` entries of `headNodes`.
function truncateComments<T>(
  headNodes: T[],
  tailNodes: T[],
  totalCount: number,
  headLimit: number,
  tailLimit: number,
): TruncatedComments<T> {
  if (totalCount <= headLimit + tailLimit) {
    const overlap = Math.max(
      0,
      headNodes.length + tailNodes.length - totalCount,
    );
    return {
      head: [...headNodes, ...tailNodes.slice(overlap)],
      omittedCount: 0,
      tail: [],
    };
  }
  const head = headNodes.slice(0, headLimit);
  const tail = tailLimit ? tailNodes.slice(-tailLimit) : [];
  return { head, omittedCount: totalCount - head.length - tail.length, tail };
}

// Returns open, closed, or merged with metadata.
//
// Does not return draft status.
//
// The REST API only identifies who closed a PR when that close was a merge
// (`merged_by`) — a plain close carries no actor, just a timestamp.
export function formatState(pull: PullRequest): string {
  const closed_at = pull.merged_at ?? pull.closed_at;
  const when = closed_at ? ` ${formatDate(closed_at, pull.created_at)}` : "";
  if (pull.merged) {
    const by = pull.merged_by ? ` by ${pull.merged_by.login}` : "";
    return `merged${when}${by}`;
  } else if (pull.state === "closed") {
    return `closed without merge${when}`;
  } else {
    return pull.state;
  }
}

function reviewStateLabel(state: ReviewState): string {
  switch (state) {
    case "APPROVED":
      return "Approval";
    case "CHANGES_REQUESTED":
      return "Change request";
    case "COMMENTED":
      return "Review";
    case "DISMISSED":
      return "Review dismissal";
    case "PENDING":
      return "Pending review";
  }
}

// Significant = worth showing as a standalone timeline entry.
// Empty-body COMMENTED reviews are just grouping containers for diff comments.
function isSignificantReview(review: Review): boolean {
  return (
    review.body.trim().length > 0 ||
    review.state === "APPROVED" ||
    review.state === "CHANGES_REQUESTED" ||
    review.state === "DISMISSED"
  );
}

// A top-level comment or an overall review. GitHub shows these as one
// chronological conversation, and they often refer to each other, so they are
// truncated together rather than as two lists.
type ConversationItem =
  | { kind: "comment"; time: string; comment: IssueComment }
  | { kind: "review"; time: string; review: Review };

function commentItem(comment: IssueComment): ConversationItem {
  return { kind: "comment", time: comment.createdAt, comment };
}

function reviewItem(review: Review): ConversationItem {
  return { kind: "review", time: review.submitted_at, review };
}

// Chronological, with a fixed tie-break so every slice of the list agrees on
// what the order is.
function compareItems(a: ConversationItem, b: ConversationItem): number {
  const byTime = new Date(a.time).getTime() - new Date(b.time).getTime();
  if (byTime !== 0) return byTime;
  if (a.kind !== b.kind) return a.kind === "comment" ? -1 : 1;
  const id = (i: ConversationItem) =>
    i.kind === "comment" ? i.comment.databaseId : i.review.id;
  return id(a) - id(b);
}

function sortItems(items: ConversationItem[]): ConversationItem[] {
  return items.sort(compareItems);
}

// Each reviewer’s latest approval or change request, which together say where
// the PR stands. These are kept even when they would fall in the omitted middle
// of a long conversation. A review that was dismissed no longer counts.
function pinnedReviews(reviews: ConversationItem[]): Set<ConversationItem> {
  const latest = new Map<string, ConversationItem>();
  for (const item of reviews) {
    if (item.kind !== "review") continue;
    const { state, user } = item.review;
    if (
      state !== "APPROVED" &&
      state !== "CHANGES_REQUESTED" &&
      state !== "DISMISSED"
    ) {
      continue;
    }
    const previous = latest.get(user.login);
    if (!previous || compareItems(previous, item) < 0) {
      latest.set(user.login, item);
    }
  }
  return new Set(
    [...latest.values()].filter(
      (i) => i.kind === "review" && i.review.state !== "DISMISSED",
    ),
  );
}

interface TruncatedConversation {
  head: ConversationItem[];
  // Reviews kept from the omitted middle, in order.
  pinned: ConversationItem[];
  // Number of items not shown, not counting `pinned`.
  omittedCount: number;
  tail: ConversationItem[];
}

// Picks which comments and reviews to show: the first `headLimit` and last
// `tailLimit` of the combined, chronological list, plus any pinned reviews.
//
// Only the first headLimit of the combined list can come from the first
// headLimit comments and the first headLimit reviews (and likewise for the
// tail), so the comment slices that were fetched are enough to find the exact
// head and tail. Reviews are always fetched in full.
function truncateConversation(
  comments: TruncatedCommentList<IssueComment>,
  reviews: Review[],
  headLimit: number,
  tailLimit: number,
): TruncatedConversation {
  const reviewItems = reviews.filter(isSignificantReview).map(reviewItem);
  const total = comments.totalCount + reviewItems.length;

  if (total <= headLimit + tailLimit) {
    // Everything fits; the comment slices can overlap, so reconcile them.
    const { head } = truncateComments(
      comments.nodes,
      comments.tailNodes,
      comments.totalCount,
      headLimit,
      tailLimit,
    );
    return {
      head: sortItems([...head.map(commentItem), ...reviewItems]),
      pinned: [],
      omittedCount: 0,
      tail: [],
    };
  }

  const head = sortItems([
    ...comments.nodes.slice(0, headLimit).map(commentItem),
    ...reviewItems,
  ]).slice(0, headLimit);
  const tail = tailLimit
    ? sortItems([
        ...comments.tailNodes.slice(-tailLimit).map(commentItem),
        ...reviewItems,
      ]).slice(-tailLimit)
    : [];

  const shown = new Set([...head, ...tail]);
  const pinned = sortItems(
    [...pinnedReviews(reviewItems)].filter((item) => !shown.has(item)),
  );
  return {
    head,
    pinned,
    omittedCount: total - head.length - tail.length - pinned.length,
    tail,
  };
}

interface TimelineEntry {
  timestamp: string;
  content: string;
}

function renderIssueComment(
  comment: IssueComment,
  baseDate: string,
  bodyLineLimit = 0,
  prUrl = "",
): string {
  const author = comment.author?.login ?? "ghost";
  const time = formatDate(comment.createdAt, baseDate);
  const minimized = comment.isMinimized
    ? `, minimized: ${comment.minimizedReason ?? "hidden"}`
    : "";
  return [
    `### Comment by ${author} ${time} (id: ${comment.databaseId}${minimized}):`,
    "",
    ...quoteBody(
      comment.body,
      bodyLineLimit,
      `run \`gh-pr-render conversation ${prUrl}\` to see all`,
    ),
    ...formatReactions(comment.reactionGroups, "#### Reactions"),
  ].join("\n");
}

function renderReview(
  review: Review,
  baseDate: string,
  bodyLineLimit = 0,
  prUrl = "",
): string {
  const state = reviewStateLabel(review.state);
  const time = formatDate(review.submitted_at, baseDate);
  const header = `### ${state} by ${review.user.login} ${time}:`;
  return review.body.trim()
    ? [
        header,
        "",
        ...quoteBody(
          review.body,
          bodyLineLimit,
          `run \`gh-pr-render conversation ${prUrl}\` to see all`,
        ),
      ].join("\n")
    : header;
}

// Describes where a thread is anchored, e.g. "`a.py` lines 4–9". Notes when
// the numbers are from the original diff (outdated threads) or refer to the old
// version of the file (comments on deleted lines).
function renderLocation(thread: ReviewThread): string {
  const path = `\`${thread.path}\``;
  const current = thread.line !== null;
  const end = thread.line ?? thread.originalLine ?? null;
  if (end === null) return path;

  const rawStart = current ? thread.startLine : thread.originalStartLine;
  const start = rawStart ?? end;
  const side = thread.diffSide;
  const startSide = thread.startDiffSide ?? side;
  const original = current ? "" : " (when commented)";

  // The numbers are from different versions of the file, so say which is which.
  // The numbers can be equal (old line 9 to new line 9), so check the sides.
  if (typeof rawStart === "number" && side && startSide !== side) {
    const label = (s: DiffSide) => (s === "LEFT" ? "old file" : "new file");
    return `${path} lines ${start} (${label(startSide!)}) – ${end} (${label(side)})${original}`;
  }

  const numbers = start < end ? `lines ${start}–${end}` : `line ${end}`;
  const notes: string[] = [];
  if (!current) notes.push("when commented");
  if (side === "LEFT") notes.push("old file");
  const suffix = notes.length > 0 ? ` (${notes.join(", ")})` : "";
  return `${path} ${numbers}${suffix}`;
}

function renderDiffHunk(thread: ReviewThread, limit: number): string {
  const first = thread.comments.nodes[0] ?? thread.comments.tailNodes[0];
  const { originalStartLine, diffSide, startDiffSide } = thread;
  // `diffHunk` is a snapshot from when the comment was made, so it’s the
  // original line numbers that match it.
  const side = startDiffSide ?? diffSide;
  // A start with the same line number as the end can still be a range, if it’s
  // on the other side of the diff.
  const start =
    typeof originalStartLine === "number" && side
      ? { line: originalStartLine, side }
      : null;
  return trimDiffHunk(first?.diffHunk ?? "", { limit, start });
}

function renderThreadComment(
  comment: ThreadComment,
  baseDate: string,
  bodyLineLimit = 0,
  threadId = "",
): string {
  const author = comment.author?.login ?? "ghost";
  const time = formatDate(comment.createdAt, baseDate);
  const minimized = comment.isMinimized
    ? `, minimized: ${comment.minimizedReason ?? "hidden"}`
    : "";
  const header = `#### ${author} ${time} (id: ${comment.databaseId}${minimized}):`;
  if (comment.isMinimized) return header;

  return [
    header,
    "",
    ...quoteBody(
      comment.body,
      bodyLineLimit,
      `run \`gh-pr-render thread ${threadId}\` to see all`,
    ),
    ...formatReactions(comment.reactionGroups, "##### Reactions"),
  ].join("\n");
}

const COLLAPSED_SUMMARY_MAX_CHARS = 200;

// Renders a resolved thread as just its location, its first comment’s first
// line, and how to expand it. Resolved threads are rarely what a reader needs,
// but they can give context, so keep a one-line hint of what they were about.
function renderCollapsedThread(
  thread: ReviewThread,
  first: ThreadComment,
  location: string,
  tagStr: string,
  baseDate: string,
): string {
  const author = first.author?.login ?? "ghost";
  const time = formatDate(first.createdAt, baseDate);
  const count = thread.comments.totalCount;
  const summary = first.body.trim().split(/\r?\n/, 1)[0] ?? "";
  const cut = summary.length > COLLAPSED_SUMMARY_MAX_CHARS;
  const more = cut || first.body.trim() !== summary ? " …" : "";
  return [
    `### Inline comment on ${location}${tagStr}:`,
    "",
    `#### ${author} ${time} (id: ${first.databaseId}):`,
    "",
    blockquote(summary.slice(0, COLLAPSED_SUMMARY_MAX_CHARS) + more),
    "",
    `Collapsed (${count} ${count === 1 ? "comment" : "comments"}) — run \`gh-pr-render thread ${thread.id}\` to see all`,
  ].join("\n");
}

function renderReviewThread(
  thread: ReviewThread,
  includeMinimized: boolean,
  baseDate: string,
  commentHeadLimit: number,
  commentTailLimit: number,
  diffHunkLimit: number,
  bodyLineLimit: number,
  collapse: boolean,
): string {
  // Defensive coding: the fetch code always fetches the first comment so we can
  // use its timestamp to place the thread in the timeline. If that ever changes
  // this will handle having tail nodes but no head nodes.
  const first = thread.comments.nodes[0] ?? thread.comments.tailNodes[0];
  if (!first || (commentHeadLimit === 0 && commentTailLimit === 0)) return "";

  const location = renderLocation(thread);

  const tags: string[] = [`id: ${thread.id}`];
  if (thread.isResolved) tags.push("resolved");
  if (thread.isOutdated) tags.push("outdated");
  const tagStr = ` (${tags.join(", ")})`;

  if (collapse) {
    return renderCollapsedThread(thread, first, location, tagStr, baseDate);
  }

  const lines: string[] = [
    `### Inline comment on ${location}${tagStr}:`,
    "",
    "```diff",
    renderDiffHunk(thread, diffHunkLimit),
    "```",
  ];

  const { head, omittedCount, tail } = truncateComments(
    thread.comments.nodes,
    thread.comments.tailNodes,
    thread.comments.totalCount,
    commentHeadLimit,
    commentTailLimit,
  );

  for (const comment of head) {
    if (comment.isMinimized && !includeMinimized) continue;
    lines.push(
      "",
      renderThreadComment(comment, baseDate, bodyLineLimit, thread.id),
    );
  }

  if (omittedCount > 0) {
    lines.push(
      "",
      `#### ${omittedCount} comments omitted — run \`gh-pr-render thread ${thread.id}\` to see all`,
    );
    for (const comment of tail) {
      if (comment.isMinimized && !includeMinimized) continue;
      lines.push(
        "",
        renderThreadComment(comment, baseDate, bodyLineLimit, thread.id),
      );
    }
  }

  return lines.join("\n");
}

// Lists commit subjects, short sha first (like `git log --oneline`).
//
// Returns string lines without newlines.
export function renderCommits(commits: Commit[]): string[] {
  const lines = ["", "## Commits", ""];
  for (const commit of commits) {
    const subject = commit.commit.message.split("\n")[0] ?? "";
    const author =
      commit.author?.login ?? commit.commit.author?.name ?? "unknown";
    lines.push(`- \`${commit.sha.slice(0, 7)}\` ${subject} (${author})`);
  }
  if (commits.length === 0) {
    // This should not happen. Be explicit.
    lines.push("No commits.");
  }
  return lines;
}

// Renders all comments for a single review thread, with a brief PR context
// header. Used by the `thread` subcommand so an LLM can zoom in on a thread
// whose comments were truncated in the full PR output.
export function renderSingleThread(
  thread: ReviewThread,
  pullRequest: PullRequestRef,
  includeMinimized: boolean,
  diffHunkLimit: number = DEFAULT_DIFF_HUNK_LIMIT,
): string {
  // Pass totalCount as head limit so truncateComments never truncates. All
  // comments were fetched into `nodes`; `tailNodes` is empty.
  const threadContent = renderReviewThread(
    thread,
    includeMinimized,
    pullRequest.createdAt,
    thread.comments.totalCount,
    0,
    diffHunkLimit,
    0,
    false,
  );
  return [
    `Part of [PR #${pullRequest.number}](${pullRequest.url})`,
    "",
    threadContent,
    "",
  ].join("\n");
}

export interface RenderOptions {
  includeMinimized: boolean;
  includeFiles: boolean;
  includeCommits: boolean;
  // How many comments to show at the start/end of a comment list that
  // exceeds commentHeadLimit + commentTailLimit (see truncateComments).
  commentHeadLimit: number;
  commentTailLimit: number;
  // Maximum lines of diff hunk to show per inline thread (0 = unlimited).
  // Defaults to DEFAULT_DIFF_HUNK_LIMIT.
  diffHunkLimit?: number;
  // Maximum lines of each top-level and inline comment body to show (0 =
  // unlimited). Defaults to DEFAULT_BODY_LINE_LIMIT.
  bodyLineLimit?: number;
  // Render resolved threads as a short summary instead of in full. Defaults to
  // true.
  collapseResolved?: boolean;
}

export function renderPR(
  { pull, files, commits, topComments, reviews, reviewThreads }: PRData,
  {
    includeMinimized,
    includeFiles,
    includeCommits,
    commentHeadLimit,
    commentTailLimit,
    diffHunkLimit = DEFAULT_DIFF_HUNK_LIMIT,
    bodyLineLimit = DEFAULT_BODY_LINE_LIMIT,
    collapseResolved = true,
  }: RenderOptions,
): string {
  const out: string[] = [];

  // Header
  out.push(`# PR #${pull.number}: ${pull.title}`, "");
  out.push(
    `**Author:** ${pull.user.login}`,
    `**State:** ${pull.draft ? "draft, " : ""}${formatState(pull)}`,
    `**Branch:** \`${pull.head.ref}\` → \`${pull.base.ref}\``,
    `**URL:** ${pull.html_url}`,
  );

  if (pull.labels.length > 0) {
    out.push(
      `**Labels:** ${pull.labels.map((label) => label.name).join(", ")}`,
    );
  }

  if (pull.milestone) {
    out.push(`**Milestone:** ${pull.milestone.title}`);
  }

  if (pull.assignees.length > 0) {
    out.push(`**Assignees:** ${pull.assignees.map((u) => u.login).join(", ")}`);
  }

  if (pull.requested_reviewers.length > 0 || pull.requested_teams.length > 0) {
    const reviewers = [
      ...pull.requested_reviewers.map((u) => u.login),
      ...pull.requested_teams.map((t) => `${t.name} (team)`),
    ];
    out.push(`**Requested reviewers:** ${reviewers.join(", ")}`);
  }

  if (pull.body?.trim()) {
    out.push("", blockquote(pull.body));
  }

  out.push(...formatReactions(pull.reactionGroups, "## Reactions"));

  if (includeCommits) {
    out.push(...renderCommits(commits));
  }

  if (includeFiles) {
    out.push("", "## Changed Files", "");
    for (const file of files) {
      out.push(
        `- \`${file.filename}\` (${file.status}) +${file.additions} / -${file.deletions}`,
      );
    }
  }

  // Timeline
  const timeline: TimelineEntry[] = [];

  const conversation = truncateConversation(
    topComments,
    reviews,
    commentHeadLimit,
    commentTailLimit,
  );

  const pushItem = (item: ConversationItem): void => {
    if (item.kind === "review") {
      timeline.push({
        timestamp: item.time,
        content: renderReview(
          item.review,
          pull.created_at,
          bodyLineLimit,
          pull.html_url,
        ),
      });
    } else if (!item.comment.isMinimized || includeMinimized) {
      timeline.push({
        timestamp: item.time,
        content: renderIssueComment(
          item.comment,
          pull.created_at,
          bodyLineLimit,
          pull.html_url,
        ),
      });
    }
  };

  conversation.head.forEach(pushItem);

  if (
    conversation.omittedCount > 0 &&
    (conversation.head.length || conversation.tail.length)
  ) {
    // Placed just after the last head item, which is where the omitted items
    // start — pushed here, ahead of the pinned and tail entries, so it sorts
    // first on an exact tie (Array#sort is stable).
    const omittedAt =
      conversation.head.at(-1)?.time ??
      conversation.tail[0]?.time ??
      pull.created_at;
    const noun = reviews.some(isSignificantReview)
      ? "comments and reviews"
      : "comments";
    timeline.push({
      timestamp: omittedAt,
      content: `### ${conversation.omittedCount} ${noun} omitted — run \`gh-pr-render conversation ${pull.html_url}\` to see all`,
    });
  }

  conversation.pinned.forEach(pushItem);
  conversation.tail.forEach(pushItem);

  for (const thread of reviewThreads) {
    // The fetch code ensures the head limit is at least 1 so we can get the
    // first timestamp to place the thread correctly in the timeline.
    const first = thread.comments.nodes[0];
    if (!first || (commentHeadLimit === 0 && commentTailLimit === 0)) continue;
    if (first.isMinimized && !includeMinimized) continue;
    timeline.push({
      timestamp: first.createdAt,
      content: renderReviewThread(
        thread,
        includeMinimized,
        pull.created_at,
        commentHeadLimit,
        commentTailLimit,
        diffHunkLimit,
        bodyLineLimit,
        collapseResolved && thread.isResolved,
      ),
    });
  }

  timeline.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  if (timeline.length > 0) {
    out.push("", "## Discussion");
    for (const entry of timeline) {
      out.push("", entry.content);
    }
  }

  out.push("");
  return out.join("\n");
}

// Renders every top-level comment and overall review on a PR in chronological
// order, with a brief PR context header. Used by the `conversation` subcommand
// so an LLM can see what was omitted from the middle of a long conversation in
// the full PR output, and read bodies that were cut short.
export function renderConversation(
  { comments, reviews, pullRequest }: ConversationData,
  includeMinimized: boolean,
): string {
  const items = sortItems([
    ...comments
      .filter((c) => includeMinimized || !c.isMinimized)
      .map(commentItem),
    ...reviews.filter(isSignificantReview).map(reviewItem),
  ]);
  const lines = [
    `Part of [PR #${pullRequest.number}](${pullRequest.url})`,
    "",
    "## Conversation",
  ];
  for (const item of items) {
    lines.push(
      "",
      item.kind === "review"
        ? renderReview(item.review, pullRequest.createdAt)
        : renderIssueComment(item.comment, pullRequest.createdAt),
    );
  }
  if (items.length === 0) {
    lines.push("", "No comments or reviews.");
  }
  lines.push("");
  return lines.join("\n");
}
