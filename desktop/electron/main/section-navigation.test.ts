import assert from "node:assert/strict";
import test from "node:test";
import {
  DESKTOP_SECTION_IDS,
  activeSectionFromPositions,
  sectionActivationLine,
} from "../../src/section-navigation.ts";

test("suit la dernière section ayant franchi la ligne d’activation", () => {
  const positions = [
    { id: "overview" as const, top: -520 },
    { id: "project" as const, top: 90 },
    { id: "workspace" as const, top: 1_180 },
  ];

  assert.equal(activeSectionFromPositions(positions, 180), "project");
  assert.equal(
    activeSectionFromPositions(
      positions.map((position) => ({
        ...position,
        top: position.top - 1_100,
      })),
      180,
    ),
    "workspace",
  );
});

test("conserve Aperçu avant la première section et couvre les trois repères", () => {
  assert.deepEqual(DESKTOP_SECTION_IDS, [
    "overview",
    "project",
    "workspace",
  ]);
  assert.equal(
    activeSectionFromPositions(
      [
        { id: "overview", top: 260 },
        { id: "project", top: 780 },
        { id: "workspace", top: 1_420 },
      ],
      180,
    ),
    "overview",
  );
});

test("calcule le repère dans le vrai conteneur de défilement desktop", () => {
  const activationLine = sectionActivationLine({
    containerTop: 36,
    containerHeight: 800,
    viewportHeight: 1_080,
    scrollsInternally: true,
  });

  assert.equal(activationLine, 246);
  assert.equal(
    activeSectionFromPositions(
      [
        { id: "overview", top: -480 },
        { id: "project", top: 232 },
        { id: "workspace", top: 940 },
      ],
      activationLine,
    ),
    "project",
  );
  assert.equal(
    sectionActivationLine({
      containerTop: 36,
      containerHeight: 800,
      viewportHeight: 1_000,
      scrollsInternally: false,
    }),
    210,
  );
});
