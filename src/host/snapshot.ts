import type { CellInput, SheetSnapshot } from "./types.js";

/** A horizontal run of adjacent cells in one row (0-based indexes) that need rewriting. */
export interface CellRun<T> {
  row: number;
  startCol: number;
  items: T[];
}

export interface SheetDiff {
  /** Cells whose content differs; items are the inputs to write back. */
  contentRuns: CellRun<CellInput>[];
  /**
   * Cells whose format differs; items are the formats to restore. A run is either all
   * non-null (apply these formats) or all null (clear formats: the cell was unformatted).
   */
  formatRuns: CellRun<unknown | null>[];
}

export function emptySnapshot(name: string, position: number): SheetSnapshot {
  return { name, position, startRow: 0, startCol: 0, inputs: [], formats: [], charts: [] };
}

function inputAt(s: SheetSnapshot, row: number, col: number): CellInput {
  const r = row - s.startRow;
  const c = col - s.startCol;
  if (r < 0 || c < 0) return "";
  return s.inputs[r]?.[c] ?? "";
}

function formatAt(s: SheetSnapshot, row: number, col: number): unknown | null {
  const r = row - s.startRow;
  const c = col - s.startCol;
  if (r < 0 || c < 0) return null;
  return s.formats?.[r]?.[c] ?? null;
}

function extent(s: SheetSnapshot): { endRow: number; endCol: number } | null {
  const rows = s.inputs.length;
  const cols = s.inputs[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return null;
  return { endRow: s.startRow + rows - 1, endCol: s.startCol + cols - 1 };
}

/** JSON with sorted keys, so structurally equal formats compare equal regardless of key order. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/**
 * Computes the minimal set of writes that turn `current` back into `target`. Cells the agent
 * never touched compare equal and are left alone, which is what keeps rollback from
 * disturbing tables, spilled arrays, and formatting it has no business rewriting.
 */
export function diffSheet(target: SheetSnapshot, current: SheetSnapshot): SheetDiff {
  const diff: SheetDiff = { contentRuns: [], formatRuns: [] };
  const t = extent(target);
  const c = extent(current);
  if (!t && !c) return diff;

  const startRow = Math.min(t ? target.startRow : Infinity, c ? current.startRow : Infinity);
  const startCol = Math.min(t ? target.startCol : Infinity, c ? current.startCol : Infinity);
  const endRow = Math.max(t?.endRow ?? -1, c?.endRow ?? -1);
  const endCol = Math.max(t?.endCol ?? -1, c?.endCol ?? -1);
  const compareFormats = target.formats !== null && current.formats !== null;

  for (let row = startRow; row <= endRow; row++) {
    let content: CellRun<CellInput> | null = null;
    let format: CellRun<unknown | null> | null = null;
    for (let col = startCol; col <= endCol; col++) {
      const want = inputAt(target, row, col);
      if (want !== inputAt(current, row, col)) {
        if (content && content.startCol + content.items.length === col) {
          content.items.push(want);
        } else {
          content = { row, startCol: col, items: [want] };
          diff.contentRuns.push(content);
        }
      }

      if (!compareFormats) continue;
      const wantFmt = formatAt(target, row, col);
      const curFmt = formatAt(current, row, col);
      if (stableStringify(wantFmt) !== stableStringify(curFmt)) {
        const contiguous = format && format.startCol + format.items.length === col;
        const sameKind = format && (format.items[0] === null) === (wantFmt === null);
        if (format && contiguous && sameKind) {
          format.items.push(wantFmt);
        } else {
          format = { row, startCol: col, items: [wantFmt] };
          diff.formatRuns.push(format);
        }
      }
    }
  }
  return diff;
}
