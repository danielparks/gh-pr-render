import { execSync } from "child_process";
import type {
  ChangedFile,
  DiffComment,
  IssueComment,
  PRData,
  PullRequest,
  Review,
} from "./types.js";

function ghApi(endpoint: string): unknown {
  return JSON.parse(
    execSync(`gh api "${endpoint}"`, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }),
  );
}

function ghApiArray(endpoint: string): unknown[] {
  const results: unknown[] = [];
  let page = 1;
  const sep = endpoint.includes("?") ? "&" : "?";
  while (true) {
    const items = ghApi(
      `${endpoint}${sep}per_page=100&page=${page}`,
    ) as unknown[];
    results.push(...items);
    if (items.length < 100) break;
    page++;
  }
  return results;
}

export function fetchPRData(repo: string, prNumber: number): PRData {
  const base = `repos/${repo}`;
  return {
    pull: ghApi(`${base}/pulls/${prNumber}`) as PullRequest,
    files: ghApiArray(`${base}/pulls/${prNumber}/files`) as ChangedFile[],
    topComments: ghApiArray(
      `${base}/issues/${prNumber}/comments`,
    ) as IssueComment[],
    reviews: ghApiArray(`${base}/pulls/${prNumber}/reviews`) as Review[],
    diffComments: ghApiArray(
      `${base}/pulls/${prNumber}/comments`,
    ) as DiffComment[],
  };
}
