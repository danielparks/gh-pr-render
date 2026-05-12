import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderPR } from "./render.js";
import type { PRData } from "./types.js";

function loadFixture(owner: string, repo: string, prNumber: number): PRData {
  const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));
  const path = join(fixturesDir, owner, repo, `${prNumber}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as PRData;
}

// Freeze time so formatDistanceToNow produces stable snapshot output.
const SNAPSHOT_NOW = new Date("2026-06-01T00:00:00Z");

describe("renderPR - danielparks/htmlize #66", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SNAPSHOT_NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  const data = loadFixture("danielparks", "htmlize", 66);

  it("renders without minimized comments", () => {
    expect(renderPR(data, { includeMinimized: false })).toMatchSnapshot();
  });

  it("renders with minimized comments", () => {
    expect(renderPR(data, { includeMinimized: true })).toMatchSnapshot();
  });
});

describe("renderPR - danielparks-test/gh-pr-render-fixtures #1", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SNAPSHOT_NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  const data = loadFixture("danielparks-test", "gh-pr-render-fixtures", 1);

  it("renders without minimized comments", () => {
    expect(renderPR(data, { includeMinimized: false })).toMatchSnapshot();
  });

  it("renders with minimized comments", () => {
    expect(renderPR(data, { includeMinimized: true })).toMatchSnapshot();
  });
});
