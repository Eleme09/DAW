import { describe, expect, it } from "vitest";
import { likelyUsingHeadphones } from "./outputHeuristics";

describe("likelyUsingHeadphones", () => {
  it("returns null when there are no output devices at all", () => {
    expect(likelyUsingHeadphones([])).toBeNull();
  });

  it("returns null when every device has an empty label (no permission granted yet)", () => {
    expect(likelyUsingHeadphones([{ label: "" }, { label: "" }])).toBeNull();
  });

  it("returns true when a labeled device looks like headphones", () => {
    expect(likelyUsingHeadphones([{ label: "Speaker (Realtek)" }, { label: "Headphones (USB)" }])).toBe(true);
  });

  it("returns true for a Spanish 'auriculares' label", () => {
    expect(likelyUsingHeadphones([{ label: "Auriculares Bluetooth" }])).toBe(true);
  });

  it("returns true for AirPods", () => {
    expect(likelyUsingHeadphones([{ label: "AirPods Pro" }])).toBe(true);
  });

  it("returns false when labeled devices exist but none look like headphones", () => {
    expect(likelyUsingHeadphones([{ label: "Speaker (Realtek)" }, { label: "HDMI Output" }])).toBe(false);
  });
});
