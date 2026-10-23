export type CellValue = string | number | boolean | null;

export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  fontColor?: string;
  fillColor?: string;
  numberFormat?: string;
  horizontalAlign?: "left" | "center" | "right";
}

export interface RangeData {
  sheet: string;
  address: string;
  values: CellValue[][];
  formulas: (string | null)[][];
  formats: (CellFormat | null)[][];
}

export interface TableInfo {
  name: string;
  range: string;
  columns: string[];
}

export interface NamedRange {
  name: string;
  refersTo: string;
}

export interface SheetOverview {
  name: string;
  usedRange: string | null;
  rowCount: number;
  colCount: number;
  headers: string[];
  tables: TableInfo[];
}

export interface SelectionInfo {
  sheet: string;
  address: string;
}

export interface WorkbookOverview {
  sheets: SheetOverview[];
  namedRanges: NamedRange[];
  activeSheet: string;
  selection: SelectionInfo | null;
}

export interface SearchMatch {
  sheet: string;
  address: string;
  value: CellValue;
  formula: string | null;
}

export type StructureOp =
  | { kind: "insertRows"; sheet: string; index: number; count: number }
  | { kind: "deleteRows"; sheet: string; index: number; count: number }
  | { kind: "insertCols"; sheet: string; index: number; count: number }
  | { kind: "deleteCols"; sheet: string; index: number; count: number }
  | { kind: "addSheet"; name: string }
  | { kind: "deleteSheet"; name: string }
  | { kind: "renameSheet"; from: string; to: string };

export type ChartType = "column" | "bar" | "line" | "pie" | "scatter";

export interface ChartSpec {
  sheet: string;
  dataRange: string;
  type: ChartType;
  title?: string;
  position?: string;
}

/** What you would write back into a cell: a formula ("=..."), a constant, or "" for empty. */
export type CellInput = string | number | boolean;

/**
 * Dense snapshot of one sheet's used range. `formats` holds host-specific per-cell format
 * objects (compared structurally, never interpreted outside the host); null means formats
 * were not captured for this sheet (e.g. too large), so rollback leaves formatting alone.
 */
export interface SheetSnapshot {
  name: string;
  position: number;
  startRow: number;
  startCol: number;
  inputs: CellInput[][];
  formats: unknown[][] | null;
  charts: string[];
}

export interface CheckpointData {
  sheets: SheetSnapshot[];
}

export interface WorkbookHost {
  readonly kind: string;
  getOverview(): Promise<WorkbookOverview>;
  readRange(sheet: string, address: string): Promise<RangeData>;
  writeRange(sheet: string, address: string, values: CellValue[][]): Promise<void>;
  setFormula(sheet: string, address: string, formula: string): Promise<void>;
  getSelection(): Promise<SelectionInfo | null>;
  applyStructureOp(op: StructureOp): Promise<void>;
  setFormat(sheet: string, address: string, format: CellFormat): Promise<void>;
  addChart(spec: ChartSpec): Promise<void>;
  search(query: string, opts?: { matchCase?: boolean; formulasToo?: boolean }): Promise<SearchMatch[]>;
  captureCheckpoint(): Promise<CheckpointData>;
  restoreCheckpoint(data: CheckpointData): Promise<void>;
  listFormulas(): Promise<{ sheet: string; address: string; formula: string }[]>;
  getCapabilities(): { undoGrouping: boolean; charts: boolean };
}
