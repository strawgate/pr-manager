import { describe, expect, it } from "vitest";
import {
  buildQuickComment,
  closePr,
  postPrComment,
} from "@/features/dashboard/api/pr-actions";

describe("buildQuickComment", () => {
  it("builds ai-prefixed comment with custom instruction", () => {
    expect(
      buildQuickComment("ai", "Improve logging", "please fix tests"),
    ).toBe("/ai please fix tests");
  });

  it("builds copilot-prefixed default template", () => {
    expect(buildQuickComment("copilot", "Improve logging", "")).toContain(
      '@copilot Please address requested review changes and rerun checks for "Improve logging".',
    );
  });
});

describe("postPrComment guards", () => {
  it("rejects missing owner/repo", async () => {
    await expect(
      postPrComment("ghp_token", {
        repositoryNameWithOwner: "invalid",
        number: 123,
        body: "hello",
      }),
    ).rejects.toThrow("Missing repository owner/name");
  });

  it("rejects empty comment body", async () => {
    await expect(
      postPrComment("ghp_token", {
        repositoryNameWithOwner: "org/repo",
        number: 123,
        body: "   ",
      }),
    ).rejects.toThrow("Comment cannot be empty");
  });
});

describe("closePr guards", () => {
  it("rejects missing owner/repo", async () => {
    await expect(closePr("ghp_token", "invalid", 1)).rejects.toThrow(
      "Missing repository owner/name",
    );
  });
});
