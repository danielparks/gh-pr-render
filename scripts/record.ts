#!/usr/bin/env node
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { fetchPRData } from "../src/fetch.js";

function detectRepo(): string {
  const url = execSync("git remote get-url origin", {
    encoding: "utf8",
  }).trim();
  const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!match?.[1]) {
    throw new Error(`Cannot parse GitHub repository from remote URL: ${url}`);
  }
  return match[1];
}

const args = process.argv.slice(2);
let repo: string;
let prNumber: number;

if (args.length === 2) {
  repo = args[0]!;
  prNumber = parseInt(args[1]!, 10);
} else if (args.length === 1) {
  repo = detectRepo();
  prNumber = parseInt(args[0]!, 10);
} else {
  console.error("Usage: npm run record [owner/repo] <pr-number>");
  process.exit(1);
}

if (isNaN(prNumber)) {
  console.error(`Invalid PR number: ${args[args.length - 1]}`);
  process.exit(1);
}

const slash = repo.indexOf("/");
if (slash === -1) {
  console.error(`Invalid repository format: "${repo}" (expected owner/repo)`);
  process.exit(1);
}
const owner = repo.slice(0, slash);
const repoName = repo.slice(slash + 1);

console.error(`Fetching ${repo} PR #${prNumber}...`);
const data = await fetchPRData(repo, prNumber);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "fixtures", owner, repoName);
mkdirSync(dir, { recursive: true });
const outPath = join(dir, `${prNumber}.json`);
writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n");
console.error(`Saved ${outPath}`);
