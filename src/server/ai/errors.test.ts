import { describe, expect, it } from "vitest";
import { AI_SETUP_MESSAGE, aiErrorMessage } from "./service";

describe("AI error messages", () => {
  it("passes the setup message through and hides other internals", () => {
    expect(aiErrorMessage(new Error(AI_SETUP_MESSAGE))).toBe(AI_SETUP_MESSAGE);
    expect(aiErrorMessage(new Error("socket hang up at 10.0.0.3"))).toBe("Something went wrong with AI. Try again.");
  });
});
