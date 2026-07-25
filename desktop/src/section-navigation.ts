export const DESKTOP_SECTION_IDS = [
  "overview",
  "project",
  "workspace",
] as const;

export type DesktopSectionId = (typeof DESKTOP_SECTION_IDS)[number];

export type SectionPosition = {
  id: DesktopSectionId;
  top: number;
};

export type ActivationLineMetrics = {
  containerTop: number;
  containerHeight: number;
  viewportHeight: number;
  scrollsInternally: boolean;
};

export function sectionActivationLine({
  containerTop,
  containerHeight,
  viewportHeight,
  scrollsInternally,
}: ActivationLineMetrics): number {
  const visibleHeight = scrollsInternally
    ? containerHeight
    : viewportHeight;
  const visibleTop = scrollsInternally ? Math.max(0, containerTop) : 0;

  return visibleTop + Math.min(210, visibleHeight * 0.28);
}

export function activeSectionFromPositions(
  positions: readonly SectionPosition[],
  activationLine: number,
): DesktopSectionId {
  let active: DesktopSectionId = "overview";

  for (const position of positions) {
    if (position.top <= activationLine) {
      active = position.id;
    }
  }

  return active;
}
