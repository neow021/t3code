import { describe, expect, it } from "vite-plus/test";

import { calculateGitGraphViewportMetrics } from "./gitGraphViewport";

describe("calculateGitGraphViewportMetrics", () => {
  it("temporarily constrains a wide preference while preserving message access", () => {
    const metrics = calculateGitGraphViewportMetrics({
      intrinsicWidth: 800,
      preferredWidth: 720,
      availableWidth: 500,
    });

    expect(metrics.preferredWidth).toBe(720);
    expect(metrics.effectiveWidth).toBe(240);
    expect(metrics.maxGraphOffset).toBe(560);
    expect(metrics.constrained).toBe(true);
  });

  it("restores the same preferred width when space returns", () => {
    expect(
      calculateGitGraphViewportMetrics({
        intrinsicWidth: 800,
        preferredWidth: 720,
        availableWidth: 1200,
      }).effectiveWidth,
    ).toBe(720);
  });

  it("never emits negative widths for an extremely narrow Pane", () => {
    const metrics = calculateGitGraphViewportMetrics({ intrinsicWidth: 400, availableWidth: 40 });
    expect(metrics.effectiveWidth).toBe(72);
    expect(metrics.maxGraphOffset).toBeGreaterThanOrEqual(0);
  });
});
