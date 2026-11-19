import type { DiffSide } from "./types.js";

export interface HunkTrimOptions {
  // Maximum number of diff lines to show. 0 means unlimited. The commented
  // range is always shown in full, even if it exceeds this limit.
  limit: number;
  // First line of a multi-line comment, as a line number in the old (`LEFT`) or
  // new (`RIGHT`) version of the file. The comment ends at the last line of the
  // hunk. `null` for a single-line comment. If the line can’t be found in the
  // hunk, the range is assumed to be that last line.
  start: { line: number; side: DiffSide } | null;
}

const HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// Finds the index in `body` of the line numbered `line` on `side`.
//
// Uses the hunk header’s start numbers to number each line of the body. Context
// lines have a number on both sides; `-` lines only on the old side, `+` lines
// only on the new side. This is exact even if the range has lines from the
// other side in the middle, or starts on a different side than it ends.
function findLine(
  header: string | undefined,
  body: string[],
  line: number,
  side: DiffSide,
): number | null {
  const match = header === undefined ? null : HEADER_RE.exec(header);
  if (!match) return null;

  let oldNumber = Number(match[1]);
  let newNumber = Number(match[2]);
  for (const [i, text] of body.entries()) {
    // "\ No newline at end of file" isn't a line of the file.
    if (text.startsWith("\\")) continue;
    const inOld = text.startsWith(" ") || text.startsWith("-");
    const inNew = text.startsWith(" ") || text.startsWith("+");
    if (
      side === "LEFT"
        ? inOld && oldNumber === line
        : inNew && newNumber === line
    ) {
      return i;
    }
    if (inOld) oldNumber++;
    if (inNew) newNumber++;
  }
  return null;
}

// Trims a diff hunk (as given by GitHub, ending at the commented line) to the
// part relevant to the comment.
//
// Drops the `@@` header — the thread header gives the location, and the header
// would be wrong once lines are removed — then keeps only the last block of
// changes, dropping everything up to and including the last context line. That
// is extended backwards if needed to include the whole commented range, and
// then capped to `options.limit` lines (but never cutting into the commented
// range). If the cap removes lines, a first line notes how many.
export function trimDiffHunk(hunk: string, options: HunkTrimOptions): string {
  const lines = hunk.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const header = lines[0]?.startsWith("@@") ? lines[0] : undefined;
  const body = header === undefined ? lines : lines.slice(1);

  // Start of the last block of changes.
  const blockStart = body.findLastIndex((l) => l.startsWith(" ")) + 1;

  // Start of the commented range: the last line, unless it’s a multi-line
  // comment.
  const lastLine = Math.max(
    body.findLastIndex((l) => !l.startsWith("\\")),
    0,
  );
  const rangeStart = options.start
    ? (findLine(header, body, options.start.line, options.start.side) ??
      lastLine)
    : lastLine;

  let start = Math.min(blockStart, rangeStart);
  const wanted = options.limit > 0 ? body.length - options.limit : 0;
  let omitted = 0;
  if (wanted > start) {
    // Cap exceeded, but don’t cut into the commented range.
    const capped = Math.min(wanted, rangeStart);
    omitted = capped - start;
    start = capped;
  }

  const kept = body.slice(start);
  if (omitted > 0) {
    kept.unshift(`… ${omitted} more ${omitted === 1 ? "line" : "lines"} above`);
  }
  return kept.join("\n");
}
