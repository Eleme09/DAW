import { describe, expect, it } from "vitest";
import { interpolateAutomation } from "./automation";
import type { AutomationPoint } from "@/types/project";

function pt(time: number, value: number): AutomationPoint {
  return { id: `${time}`, time, value };
}

describe("interpolateAutomation", () => {
  it("returns the single point's value everywhere when there's only one point", () => {
    const points = [pt(5, -12)];
    expect(interpolateAutomation(points, 0)).toBe(-12);
    expect(interpolateAutomation(points, 5)).toBe(-12);
    expect(interpolateAutomation(points, 100)).toBe(-12);
  });

  it("holds flat before the first and after the last point", () => {
    const points = [pt(2, -20), pt(8, 0)];
    expect(interpolateAutomation(points, 0)).toBe(-20);
    expect(interpolateAutomation(points, 10)).toBe(0);
  });

  it("linearly interpolates between two points", () => {
    const points = [pt(0, -20), pt(10, 0)];
    expect(interpolateAutomation(points, 5)).toBeCloseTo(-10);
    expect(interpolateAutomation(points, 2.5)).toBeCloseTo(-15);
  });

  it("works across more than two points, regardless of input order", () => {
    const points = [pt(10, 0), pt(0, -20), pt(20, -20)];
    expect(interpolateAutomation(points, 5)).toBeCloseTo(-10);
    expect(interpolateAutomation(points, 15)).toBeCloseTo(-10);
  });
});
