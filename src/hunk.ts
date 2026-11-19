import type { DiffSide } from "./types.js";

export interface HunkTrimOptions {
  // Maximum number of diff lines to show. 0 means unlimited. The commented
  // range is always shown in full, even if it exceeds this limit.
  limit: number;
  // Number of lines the comment covers (1 for a single-line comment).
  rangeLines: number;
  // Which side of the diff `rangeLines` is counted on. `null` if unknown or if
  // the range spans both sides, in which case every diff line is counted.
  side: DiffSide | null;
}

function onSide(line: string, side: DiffSide | null): boolean {
  // "\ No newline at end of file" isn't a line of the file.
  if (line.startsWith("\\")) return false;
  if (side === null || line.startsWith(" ")) return true;
  return line.startsWith(side === "RIGHT" ? "+" : "-");
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
  const body = lines[0]?.startsWith("@@") ? lines.slice(1) : lines;

  // Start of the last block of changes.
  const blockStart = body.findLastIndex((l) => l.startsWith(" ")) + 1;

  // Start of the commented range.
  let rangeStart = 0;
  let seen = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    if (onSide(body[i]!, options.side) && ++seen >= options.rangeLines) {
      rangeStart = i;
      break;
    }
  }

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
