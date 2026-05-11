import type { DiffComment, IssueComment, PRData, Review, ReviewState } from './types.js';

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function reviewStateLabel(state: ReviewState): string {
  switch (state) {
    case 'APPROVED':
      return 'approved this PR';
    case 'CHANGES_REQUESTED':
      return 'requested changes';
    case 'COMMENTED':
      return 'reviewed';
    case 'DISMISSED':
      return 'dismissed review';
    case 'PENDING':
      return 'pending review';
  }
}

// Significant = worth showing as a standalone timeline entry.
// Empty-body COMMENTED reviews are just grouping containers for diff comments.
function isSignificantReview(review: Review): boolean {
  return (
    review.body.trim().length > 0 ||
    review.state === 'APPROVED' ||
    review.state === 'CHANGES_REQUESTED' ||
    review.state === 'DISMISSED'
  );
}

interface TimelineEntry {
  timestamp: string;
  content: string;
}

function renderIssueComment(comment: IssueComment): string {
  return [
    `**${comment.user.login}** commented (${formatDate(comment.created_at)}):`,
    '',
    comment.body,
  ].join('\n');
}

function renderReview(review: Review): string {
  const header = `**${review.user.login}** ${reviewStateLabel(review.state)} (${formatDate(review.submitted_at)})`;
  return review.body.trim()
    ? [header, '', review.body].join('\n')
    : header;
}

function renderDiffThread(root: DiffComment, replies: DiffComment[]): string {
  const location =
    root.line !== null ? `\`${root.path}\` line ${root.line}` : `\`${root.path}\``;

  const lines: string[] = [
    `**Diff comment** on ${location} (${formatDate(root.created_at)}):`,
    '',
    '```diff',
    root.diff_hunk,
    '```',
    '',
    `**${root.user.login}** wrote:`,
    '',
    root.body,
  ];

  for (const reply of replies) {
    lines.push(
      '',
      `**${reply.user.login}** replied (${formatDate(reply.created_at)}):`,
      '',
      reply.body,
    );
  }

  return lines.join('\n');
}

function buildDiffThreadEntries(diffComments: DiffComment[]): TimelineEntry[] {
  const commentById = new Map<number, DiffComment>(diffComments.map((c) => [c.id, c]));

  function findRootId(id: number): number {
    const c = commentById.get(id);
    return c?.in_reply_to_id !== undefined ? findRootId(c.in_reply_to_id) : id;
  }

  const threadReplies = new Map<number, DiffComment[]>();
  const roots: DiffComment[] = [];

  for (const comment of diffComments) {
    if (comment.in_reply_to_id === undefined) {
      roots.push(comment);
      if (!threadReplies.has(comment.id)) threadReplies.set(comment.id, []);
    } else {
      const rootId = findRootId(comment.in_reply_to_id);
      const replies = threadReplies.get(rootId) ?? [];
      replies.push(comment);
      threadReplies.set(rootId, replies);
    }
  }

  return roots.map((root) => {
    const replies = (threadReplies.get(root.id) ?? []).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return { timestamp: root.created_at, content: renderDiffThread(root, replies) };
  });
}

export function renderPR(data: PRData): string {
  const { pull, files, topComments, reviews, diffComments } = data;
  const out: string[] = [];

  // Header
  out.push(`# PR #${pull.number}: ${pull.title}`, '');
  out.push(
    `**Author:** ${pull.user.login} | **State:** ${pull.state}`,
    `**Branch:** \`${pull.head.ref}\` → \`${pull.base.ref}\``,
    `**URL:** ${pull.html_url}`,
  );

  if (pull.body?.trim()) {
    out.push('', '---', '', pull.body);
  }

  // Changed files
  out.push('', '---', '', '## Changed Files', '');
  for (const file of files) {
    out.push(`- \`${file.filename}\` (${file.status}) +${file.additions} / -${file.deletions}`);
  }

  // Timeline
  const timeline: TimelineEntry[] = [];

  for (const comment of topComments) {
    timeline.push({ timestamp: comment.created_at, content: renderIssueComment(comment) });
  }

  for (const review of reviews) {
    if (isSignificantReview(review)) {
      timeline.push({ timestamp: review.submitted_at, content: renderReview(review) });
    }
  }

  timeline.push(...buildDiffThreadEntries(diffComments));
  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (timeline.length > 0) {
    out.push('', '---', '', '## Discussion');
    for (const entry of timeline) {
      out.push('', '---', '', entry.content);
    }
  }

  out.push('');
  return out.join('\n');
}
