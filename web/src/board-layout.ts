export interface BoardLayoutInput {
  width: number;
  viewportHeight: number;
  chromeHeight: number;
  messageCount: number;
  columns: number;
  reserveRows: number;
  tableauLengths: number[];
  compact: boolean;
}

export interface BoardLayout {
  cardWidth: number;
  cardHeight: number;
  pileGap: number;
  edgeSpace: number;
  sectionGap: number;
  reserveGap: number;
  foundationGap: number;
  overlaps: number[];
  boardHeight: number;
}

// These match the fixed pile labels/counts in app.css. Cards and their corner
// markings scale together; 0.27 widths keeps both rank and suit exposed.
const RESERVE_LABELS = 38;
const TABLEAU_LABEL = 18;
const minimumOverlap = (width: number) => width * 0.27;
const normalOverlap = (width: number) => Math.min(29, width * 0.35);

export function calculateBoardLayout(input: BoardLayoutInput): BoardLayout {
  const {
    width,
    viewportHeight,
    chromeHeight,
    messageCount,
    reserveRows,
    tableauLengths,
    compact,
  } = input;
  const columns = Math.max(1, input.columns);
  const pileGap = Math.max(8, Math.min(18, width * 0.015));
  const baseWidth = Math.max(
    0.1,
    Math.min(compact ? 72 : 84, (width - (columns - 1) * pileGap) / columns),
  );
  const gaps = 2 + messageCount;

  const dimensions = (
    cardWidth: number,
    spacing: number,
    compress: boolean,
  ): BoardLayout => {
    const cardHeight = (cardWidth * 10) / 7;
    const edgeSpace = 16 + ((compact ? 22 : 32) - 16) * spacing;
    const sectionGap = 16 + 8 * spacing;
    const reserveGap = reserveRows ? 16 + 11 * spacing : 0;
    const foundationGap = 8 + 4 * spacing;
    const reserveHeight =
      reserveRows * (cardHeight + RESERVE_LABELS) +
      Math.max(0, reserveRows - 1) * foundationGap +
      reserveGap;
    const availableStack =
      viewportHeight -
      chromeHeight -
      2 * edgeSpace -
      gaps * sectionGap -
      reserveHeight -
      TABLEAU_LABEL;
    const overlaps = tableauLengths.map((length) => {
      const normal = normalOverlap(cardWidth);
      if (!compress || length <= 1) return normal;
      return Math.max(
        minimumOverlap(cardWidth),
        Math.min(normal, (availableStack - cardHeight) / (length - 1)),
      );
    });
    const stackHeight = Math.max(
      cardHeight,
      ...tableauLengths.map(
        (length, i) => cardHeight + Math.max(0, length - 1) * overlaps[i],
      ),
    );
    return {
      cardWidth,
      cardHeight,
      pileGap,
      edgeSpace,
      sectionGap,
      reserveGap,
      foundationGap,
      overlaps,
      boardHeight: reserveHeight + TABLEAU_LABEL + stackHeight,
    };
  };
  const fits = (layout: BoardLayout) =>
    layout.boardHeight +
      chromeHeight +
      2 * layout.edgeSpace +
      gaps * layout.sectionGap <=
    viewportHeight;

  // First spend the surrounding whitespace, then compress only overflowing
  // columns, and finally shrink every card by the same factor.
  const normal = dimensions(baseWidth, 1, false);
  if (fits(normal)) return normal;
  if (fits(dimensions(baseWidth, 0, false))) {
    let low = 0,
      high = 1;
    for (let i = 0; i < 32; i++) {
      const middle = (low + high) / 2;
      if (fits(dimensions(baseWidth, middle, false))) low = middle;
      else high = middle;
    }
    return dimensions(baseWidth, low, false);
  }
  const compressed = dimensions(baseWidth, 0, true);
  if (fits(compressed)) return compressed;
  let low = 0.1,
    high = baseWidth;
  for (let i = 0; i < 32; i++) {
    const middle = (low + high) / 2;
    if (fits(dimensions(middle, 0, true))) low = middle;
    else high = middle;
  }
  return dimensions(low, 0, true);
}
