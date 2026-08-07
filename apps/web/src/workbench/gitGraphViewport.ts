export const GIT_GRAPH_MIN_VIEWPORT_WIDTH = 72;
export const GIT_GRAPH_MAX_VIEWPORT_WIDTH = 720;
export const GIT_GRAPH_MESSAGE_MIN_WIDTH = 260;
export const GIT_GRAPH_AUTO_MAX_VIEWPORT_WIDTH = 340;

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export interface GitGraphViewportMetrics {
  readonly preferredWidth: number;
  readonly effectiveWidth: number;
  readonly intrinsicWidth: number;
  readonly maxGraphOffset: number;
  readonly constrained: boolean;
}

/** One width contract shared by frozen rows, clipping, and graph scroll geometry. */
export function calculateGitGraphViewportMetrics(input: {
  readonly intrinsicWidth: number;
  readonly availableWidth: number;
  readonly preferredWidth?: number | null;
}): GitGraphViewportMetrics {
  const intrinsicWidth = Math.max(
    GIT_GRAPH_MIN_VIEWPORT_WIDTH,
    Math.ceil(finitePositive(input.intrinsicWidth, GIT_GRAPH_MIN_VIEWPORT_WIDTH)),
  );
  const availableWidth = finitePositive(input.availableWidth, 900);
  const automaticWidth = Math.min(
    GIT_GRAPH_AUTO_MAX_VIEWPORT_WIDTH,
    Math.max(GIT_GRAPH_MIN_VIEWPORT_WIDTH, intrinsicWidth),
  );
  const preferredWidth = Math.min(
    GIT_GRAPH_MAX_VIEWPORT_WIDTH,
    Math.max(
      GIT_GRAPH_MIN_VIEWPORT_WIDTH,
      finitePositive(input.preferredWidth ?? automaticWidth, automaticWidth),
    ),
  );
  const reservedContentWidth = Math.min(
    GIT_GRAPH_MESSAGE_MIN_WIDTH,
    Math.max(0, availableWidth - GIT_GRAPH_MIN_VIEWPORT_WIDTH),
  );
  const effectiveWidth = Math.min(
    preferredWidth,
    Math.max(GIT_GRAPH_MIN_VIEWPORT_WIDTH, availableWidth - reservedContentWidth),
  );
  return {
    preferredWidth,
    effectiveWidth,
    intrinsicWidth,
    maxGraphOffset: Math.max(0, intrinsicWidth - effectiveWidth),
    constrained: effectiveWidth < preferredWidth,
  };
}
