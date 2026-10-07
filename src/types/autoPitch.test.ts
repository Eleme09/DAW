import { describe, expect, it } from "vitest";
import { AUTOPITCH_RECIPES } from "./autoPitch";

describe("AutoPitch recipes", () => {
  it("every description fits the two lines the panel shows (it was cut with an ellipsis once)", () => {
    for (const r of AUTOPITCH_RECIPES) expect(r.description.length, r.id).toBeLessThanOrEqual(105);
  });
});
