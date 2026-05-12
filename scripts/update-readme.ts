#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { renderPR } from "../src/render.js";
import type { PRData } from "../src/types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const fixturePath = join(
  root,
  "fixtures",
  "danielparks-test",
  "gh-pr-render-fixtures",
  "1.json",
);
const data = JSON.parse(readFileSync(fixturePath, "utf8")) as PRData;

const rendered = renderPR(data, { includeMinimized: false });

const blockquote = rendered
  .trimEnd()
  .split("\n")
  .map((line) => (line === "" ? ">" : `> ${line}`))
  .join("\n");

const readmePath = join(root, "README.md");
const readme = readFileSync(readmePath, "utf8");

const START = "<!-- example-output-start -->\n";
const END = "\n<!-- example-output-end -->";
const startIndex = readme.indexOf(START);
const endIndex = readme.indexOf(END);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find example output markers in README.md");
  process.exit(1);
}

const updated =
  readme.slice(0, startIndex + START.length) +
  "\n" +
  blockquote +
  "\n" +
  readme.slice(endIndex);

writeFileSync(readmePath, updated);
console.error("Updated README.md example output.");
