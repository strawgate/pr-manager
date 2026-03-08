import { describe, expect, it } from "vitest";
import { fetchPrDetail } from "@/features/dashboard/api/pr-detail";

describe("fetchPrDetail guards", () => {
  it("rejects missing owner/repo", async () => {
    await expect(fetchPrDetail("ghp_token", "invalid", 1)).rejects.toThrow(
      "Missing repository owner/name",
    );
  });

  it("rejects empty string", async () => {
    await expect(fetchPrDetail("ghp_token", "", 1)).rejects.toThrow(
      "Missing repository owner/name",
    );
  });
});
