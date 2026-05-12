import { formatDistance } from "date-fns";
import type {
  IssueComment,
  PRData,
  Review,
  ReviewState,
  ReviewThread,
  ThreadComment,
} from "./types.js";

function formatDate(iso: string, baseDate: string): string {
  return formatDistance(iso, baseDate) + " later";
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

interface TimelineEntry {
  timestamp: string;
  content: string;
}

function renderIssueComment(comment: IssueComment, baseDate: string): string {
  const author = comment.author?.login ?? "ghost";
  const time = formatDate(comment.createdAt, baseDate);
  const minimized = comment.isMinimized
    ? ` [minimized: ${comment.minimizedReason ?? "hidden"}]`
    : "";
  return [
    `### Comment by ${author} ${time}${minimized}:`,
    "",
    comment.body,
  ].join("\n");
}

function renderReview(review: Review, baseDate: string): string {
  const state = reviewStateLabel(review.state);
  const time = formatDate(review.submitted_at, baseDate);
  const header = `### ${state} by ${review.user.login} ${time}:`;
  return review.body.trim() ? [header, "", review.body].join("\n") : header;
}

// Trim everything up to the last block of changes.
function renderDiffHunk(hunk: string): string {
  return hunk.replace(/.*^ [^\n\r]*[\n\r]+/ms, "");
}

function renderThreadComment(comment: ThreadComment, baseDate: string): string {
  const author = comment.author?.login ?? "ghost";
  const time = formatDate(comment.createdAt, baseDate);
  const minimized = comment.isMinimized
    ? ` (minimized: ${comment.minimizedReason ?? "hidden"})`
    : "";
  const header = `#### ${author} ${time}${minimized}:`;
  return comment.isMinimized ? header : [header, "", comment.body].join("\n");
}

function renderReviewThread(
  thread: ReviewThread,
  includeMinimized: boolean,
  baseDate: string,
): string {
  const first = thread.comments.nodes[0];
  if (!first) return "";

  const location =
    thread.line !== null
      ? `\`${thread.path}\` line ${thread.line}`
      : `\`${thread.path}\``;

  const tags: string[] = [];
  if (thread.isResolved) tags.push("resolved");
  if (thread.isOutdated) tags.push("outdated");
  tags.push(`id: ${first.databaseId}`);
  const tagStr = ` (${tags.join(", ")})`;

  const lines: string[] = [
    `### Diff comment on ${location}${tagStr}:`,
    "",
    "```diff",
    renderDiffHunk(first.diffHunk),
    "```",
  ];

  for (const comment of thread.comments.nodes) {
    if (comment.isMinimized && !includeMinimized) continue;
    lines.push("", renderThreadComment(comment, baseDate));
  }

  return lines.join("\n");
}

export interface RenderOptions {
  includeMinimized: boolean;
}

export function renderPR(data: PRData, options: RenderOptions): string {
  const { pull, files, topComments, reviews, reviewThreads } = data;
  const { includeMinimized } = options;
  const out: string[] = [];

  // Header
  out.push(`# PR #${pull.number}: ${pull.title}`, "");
  out.push(
    `**Author:** ${pull.user.login}`,
    `**State:** ${pull.state}`,
    `**Branch:** \`${pull.head.ref}\` → \`${pull.base.ref}\``,
    `**URL:** ${pull.html_url}`,
  );

  if (pull.body?.trim()) {
    out.push("", "---", "", pull.body, "", "---");
  }

  // Changed files
  out.push("", "## Changed Files", "");
  for (const file of files) {
    out.push(
      `- \`${file.filename}\` (${file.status}) +${file.additions} / -${file.deletions}`,
    );
  }

  // Timeline
  const timeline: TimelineEntry[] = [];

  for (const comment of topComments) {
    if (comment.isMinimized && !includeMinimized) continue;
    timeline.push({
      timestamp: comment.createdAt,
      content: renderIssueComment(comment, pull.created_at),
    });
  }

  for (const review of reviews) {
    if (isSignificantReview(review)) {
      timeline.push({
        timestamp: review.submitted_at,
        content: renderReview(review, pull.created_at),
      });
    }
  }

  for (const thread of reviewThreads) {
    const first = thread.comments.nodes[0];
    if (!first) continue;
    if (first.isMinimized && !includeMinimized) continue;
    timeline.push({
      timestamp: first.createdAt,
      content: renderReviewThread(thread, includeMinimized, pull.created_at),
    });
  }

  timeline.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  let separator: string[] = [];
  if (timeline.length > 0) {
    out.push("", "## Discussion", "");
    for (const entry of timeline) {
      out.push(...separator, entry.content);
      separator = ["", "---", ""];
    }
  }

  out.push("");
  return out.join("\n");
}
