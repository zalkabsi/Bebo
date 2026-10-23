export interface CellCoord {
  row: number;
  col: number;
}

export function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) {
    if (ch < "A" || ch > "Z") throw new Error(`Invalid column: ${col}`);
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

export function indexToCol(index: number): string {
  let s = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function parseA1(address: string): CellCoord {
  const m = /^([A-Za-z]+)(\d+)$/.exec(address.trim());
  if (!m) throw new Error(`Invalid A1 address: ${address}`);
  return { row: parseInt(m[2], 10) - 1, col: colToIndex(m[1]) };
}

export function toA1(coord: CellCoord): string {
  return `${indexToCol(coord.col)}${coord.row + 1}`;
}

export interface RangeBounds {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export function parseRange(address: string): RangeBounds {
  const trimmed = address.trim();
  const m = /^([A-Za-z]+\d+)(?::([A-Za-z]+\d+))?$/.exec(trimmed);
  if (!m) throw new Error(`Invalid range: ${address}`);
  const start = parseA1(m[1]);
  const end = m[2] ? parseA1(m[2]) : start;
  return {
    startRow: Math.min(start.row, end.row),
    startCol: Math.min(start.col, end.col),
    endRow: Math.max(start.row, end.row),
    endCol: Math.max(start.col, end.col),
  };
}

export function rangeDimensions(b: RangeBounds): { rows: number; cols: number } {
  return { rows: b.endRow - b.startRow + 1, cols: b.endCol - b.startCol + 1 };
}

export function rangeStartAddress(address: string): string {
  const b = parseRange(address);
  return toA1({ row: b.startRow, col: b.startCol });
}

export function boundsToAddress(b: RangeBounds): string {
  const start = toA1({ row: b.startRow, col: b.startCol });
  const end = toA1({ row: b.endRow, col: b.endCol });
  return start === end ? start : `${start}:${end}`;
}

export function shiftBounds(b: RangeBounds, rowDelta: number, colDelta: number): RangeBounds {
  return {
    startRow: b.startRow + rowDelta,
    startCol: b.startCol + colDelta,
    endRow: b.endRow + rowDelta,
    endCol: b.endCol + colDelta,
  };
}
