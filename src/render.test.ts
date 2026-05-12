import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { renderPR } from "./render.js";
import type { PRData } from "./types.js";

function loadFixture(owner: string, repo: string, prNumber: number): PRData {
  const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));
  const path = join(fixturesDir, owner, repo, `${prNumber}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as PRData;
}

describe("renderPR - danielparks/htmlize #66", () => {
  const data = loadFixture("danielparks", "htmlize", 66);

  it("renders without minimized comments", () => {
    expect(renderPR(data, { includeMinimized: false })).toMatchSnapshot();
  });

  it("renders with minimized comments", () => {
    expect(renderPR(data, { includeMinimized: true })).toMatchSnapshot();
  });
});

describe("renderPR - danielparks-test/gh-pr-render-fixtures #1", () => {
  const data = loadFixture("danielparks-test", "gh-pr-render-fixtures", 1);

  it("renders without minimized comments", () => {
    expect(renderPR(data, { includeMinimized: false })).toMatchSnapshot();
  });

  it("renders with minimized comments", () => {
    expect(renderPR(data, { includeMinimized: true })).toMatchSnapshot();
  });
});
