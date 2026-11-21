import { describe, expect, test } from "bun:test";
import { calculateBoardLayout } from "../src/board-layout";
import type { BoardLayout, BoardLayoutInput } from "../src/board-layout";

const input: BoardLayoutInput = {
  width: 1200,
  viewportHeight: 1000,
  chromeHeight: 120,
  messageCount: 0,
  columns: 7,
  reserveRows: 1,
  tableauLengths: [2, 5, 12],
  compact: false,
};
const totalHeight = (layout: BoardLayout, options: BoardLayoutInput) =>
  layout.boardHeight +
  options.chromeHeight +
  2 * layout.edgeSpace +
  (2 + options.messageCount) * layout.sectionGap;
const fit = (options: Partial<BoardLayoutInput>) =>
  calculateBoardLayout({ ...input, ...options });

describe("board fitting", () => {
  test("short columns retain normal cards, overlap and whitespace", () => {
    const layout = fit({ tableauLengths: [0, 1, 3] });
    expect(layout.cardWidth).toBe(84);
    expect(layout.cardHeight).toBe(120);
    expect(layout.overlaps).toEqual([29, 29, 29]);
    expect(layout.edgeSpace).toBe(32);
    expect(layout.sectionGap).toBe(24);
  });

  test("spends whitespace before compressing any column", () => {
    const options = { ...input, viewportHeight: 850 };
    const layout = calculateBoardLayout(options);
    expect(layout.cardWidth).toBe(84);
    expect(layout.edgeSpace).toBeLessThan(32);
    expect(layout.edgeSpace).toBeGreaterThanOrEqual(16);
    expect(layout.sectionGap).toBeGreaterThanOrEqual(16);
    expect(layout.overlaps).toEqual([29, 29, 29]);
    expect(totalHeight(layout, options)).toBeCloseTo(850);
  });

  test("only the long column compresses while short columns keep their spacing", () => {
    const options = { ...input, viewportHeight: 800 };
    const layout = calculateBoardLayout(options);
    expect(layout.cardWidth).toBe(84);
    expect(layout.edgeSpace).toBe(16);
    expect(layout.overlaps.slice(0, 2)).toEqual([29, 29]);
    expect(layout.overlaps[2]).toBeLessThan(29);
    expect(layout.overlaps[2]).toBeGreaterThanOrEqual(84 * 0.27);
    expect(totalHeight(layout, options)).toBeCloseTo(800);
  });

  test("multiple long columns get individual gaps and identical card sizes", () => {
    const layout = fit({ viewportHeight: 770, tableauLengths: [2, 11, 12] });
    expect(layout.overlaps[0]).toBe(29);
    expect(layout.overlaps[1]).toBeLessThan(29);
    expect(layout.overlaps[2]).toBeLessThan(layout.overlaps[1]);
    expect(layout.cardWidth).toBe(84);
  });

  test("shrinks every card proportionally after the readable overlap limit", () => {
    const options = { ...input, viewportHeight: 500 };
    const layout = calculateBoardLayout(options);
    expect(layout.cardWidth).toBeLessThan(84);
    expect(layout.cardHeight / layout.cardWidth).toBeCloseTo(10 / 7);
    expect(layout.overlaps[2]).toBeCloseTo(layout.cardWidth * 0.27);
    expect(totalHeight(layout, options)).toBeLessThanOrEqual(500.0001);
  });

  test("new messages and a second reserve row are included in the budget", () => {
    const options = {
      ...input,
      viewportHeight: 650,
      messageCount: 2,
      chromeHeight: 180,
      reserveRows: 2,
    };
    const layout = calculateBoardLayout(options);
    expect(layout.cardWidth).toBeLessThan(
      fit({ viewportHeight: 650 }).cardWidth,
    );
    expect(totalHeight(layout, options)).toBeLessThanOrEqual(650.0001);
  });

  test("moving, Undo or resizing restores the full size and normal overlap", () => {
    expect(fit({ viewportHeight: 500 }).cardWidth).toBeLessThan(84);
    expect(fit({})).toEqual(calculateBoardLayout(input));
    expect(fit({ viewportHeight: 800 }).overlaps[2]).toBeLessThan(29);
    expect(
      fit({ viewportHeight: 800, tableauLengths: [2, 5, 6] }).overlaps,
    ).toEqual([29, 29, 29]);
  });

  test("ten columns fit narrow screens and empty columns remain finite", () => {
    const layout = fit({
      width: 288,
      columns: 10,
      compact: true,
      tableauLengths: [0, 1, 6],
    });
    expect(layout.cardWidth * 10 + layout.pileGap * 9).toBeLessThanOrEqual(288);
    expect(layout.overlaps.every(Number.isFinite)).toBe(true);
    expect(fit({ tableauLengths: [] }).boardHeight).toBeGreaterThan(0);
  });

  test("extremely short viewports retain chrome size and allow natural scrolling", () => {
    const options = { ...input, viewportHeight: 100 };
    const layout = calculateBoardLayout(options);
    expect(layout.edgeSpace).toBe(16);
    expect(layout.sectionGap).toBe(16);
    expect(layout.cardWidth).toBeGreaterThan(0);
    expect(totalHeight(layout, options)).toBeGreaterThan(
      options.viewportHeight,
    );
  });
});
