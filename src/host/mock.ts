import {
  boundsToAddress,
  indexToCol,
  parseA1,
  parseRange,
  rangeDimensions,
  toA1,
} from "./address.js";
import type {
  CellFormat,
  CellInput,
  CellValue,
  ChartSpec,
  CheckpointData,
  NamedRange,
  RangeData,
  SearchMatch,
  SelectionInfo,
  SheetOverview,
  SheetSnapshot,
  StructureOp,
  TableInfo,
  WorkbookHost,
  WorkbookOverview,
} from "./types.js";
import { diffSheet, emptySnapshot } from "./snapshot.js";

interface MockCell {
  value: CellValue;
  formula: string | null;
  format: CellFormat | null;
}

interface MockSheet {
  name: string;
  cells: Map<string, MockCell>;
  tables: TableInfo[];
}

const MAX_ROWS = 1_000_000;
const MAX_COLS = 16_384;

export class MockHost implements WorkbookHost {
  readonly kind = "mock";
  sheets = new Map<string, MockSheet>();
  namedRanges: NamedRange[] = [];
  activeSheet = "Sheet1";
  selection: SelectionInfo | null = null;
  charts: ChartSpec[] = [];

  constructor(seed?: Record<string, Record<string, CellValue>>) {
    this.sheets.set("Sheet1", { name: "Sheet1", cells: new Map(), tables: [] });
    if (seed) {
      for (const [sheetName, cells] of Object.entries(seed)) {
        const sheet = this.ensureSheet(sheetName);
        for (const [addr, value] of Object.entries(cells)) {
          if (typeof value === "string" && value.startsWith("=")) {
            this.setCell(sheet, addr, this.evaluate(sheet, value), value);
          } else {
            this.setCell(sheet, addr, value);
          }
        }
      }
    }
  }

  private ensureSheet(name: string): MockSheet {
    let sheet = this.sheets.get(name);
    if (!sheet) {
      sheet = { name, cells: new Map(), tables: [] };
      this.sheets.set(name, sheet);
    }
    return sheet;
  }

  private getSheet(name: string): MockSheet {
    const sheet = this.sheets.get(name);
    if (!sheet) throw new Error(`Sheet not found: ${name}`);
    return sheet;
  }

  private setCell(sheet: MockSheet, addr: string, value: CellValue, formula: string | null = null): void {
    const empty = value === null || value === "";
    const prev = sheet.cells.get(addr);
    if (empty && formula === null && !prev?.format) {
      sheet.cells.delete(addr);
    } else {
      sheet.cells.set(addr, { value: empty ? null : value, formula, format: prev?.format ?? null });
    }
  }

  private evaluate(sheet: MockSheet, formula: string): CellValue {
    const body = formula.replace(/^=/, "").trim();
    const agg = /^(SUM|AVERAGE|COUNT|MIN|MAX)\(([^)]+)\)$/i.exec(body);
    if (agg) {
      const fn = agg[1].toUpperCase();
      const nums = this.refsToNumbers(sheet, agg[2]);
      if (fn === "COUNT") return nums.length;
      if (nums.length === 0) return 0;
      if (fn === "SUM") return nums.reduce((a, b) => a + b, 0);
      if (fn === "AVERAGE") return nums.reduce((a, b) => a + b, 0) / nums.length;
      if (fn === "MIN") return Math.min(...nums);
      return Math.max(...nums);
    }
    const expr = body.replace(/[A-Za-z]+\d+/g, (ref) => {
      const v = this.cellValue(sheet, ref);
      return typeof v === "number" ? String(v) : "0";
    });
    if (!/^[\d\s+\-*/().]+$/.test(expr)) return null;
    try {
      return new Function(`return (${expr})`)() as number;
    } catch {
      return null;
    }
  }

  private refsToNumbers(sheet: MockSheet, refList: string): number[] {
    const nums: number[] = [];
    for (const part of refList.split(",")) {
      const p = part.trim();
      if (!p) continue;
      if (p.includes(":")) {
        const b = parseRange(p);
        for (let r = b.startRow; r <= b.endRow; r++) {
          for (let c = b.startCol; c <= b.endCol; c++) {
            const v = this.cellValue(sheet, toA1({ row: r, col: c }));
            if (typeof v === "number") nums.push(v);
          }
        }
      } else {
        const v = this.cellValue(sheet, p);
        if (typeof v === "number") nums.push(v);
      }
    }
    return nums;
  }

  private cellValue(sheet: MockSheet, addr: string): CellValue {
    const cell = sheet.cells.get(addr.toUpperCase());
    if (!cell) return null;
    if (cell.formula) return this.evaluate(sheet, cell.formula);
    return cell.value;
  }

  private sheetBounds(sheet: MockSheet): { endRow: number; endCol: number } | null {
    let endRow = -1;
    let endCol = -1;
    for (const addr of sheet.cells.keys()) {
      const { row, col } = parseA1(addr);
      if (row > endRow) endRow = row;
      if (col > endCol) endCol = col;
    }
    return endRow < 0 ? null : { endRow, endCol };
  }

  async getOverview(): Promise<WorkbookOverview> {
    const sheets: SheetOverview[] = [...this.sheets.values()].map((sheet) => {
      const bounds = this.sheetBounds(sheet);
      const usedRange = bounds
        ? boundsToAddress({ startRow: 0, startCol: 0, endRow: bounds.endRow, endCol: bounds.endCol })
        : null;
      const headers: string[] = [];
      if (bounds) {
        for (let c = 0; c <= bounds.endCol; c++) {
          const v = this.cellValue(sheet, toA1({ row: 0, col: c }));
          headers.push(v === null ? "" : String(v));
        }
      }
      return {
        name: sheet.name,
        usedRange,
        rowCount: bounds ? bounds.endRow + 1 : 0,
        colCount: bounds ? bounds.endCol + 1 : 0,
        headers,
        tables: sheet.tables,
      };
    });
    return { sheets, namedRanges: this.namedRanges, activeSheet: this.activeSheet, selection: this.selection };
  }

  async readRange(sheetName: string, address: string): Promise<RangeData> {
    const sheet = this.getSheet(sheetName);
    const b = parseRange(address);
    const { rows, cols } = rangeDimensions(b);
    const values: CellValue[][] = [];
    const formulas: (string | null)[][] = [];
    const formats: (CellFormat | null)[][] = [];
    for (let r = 0; r < rows; r++) {
      values.push([]);
      formulas.push([]);
      formats.push([]);
      for (let c = 0; c < cols; c++) {
        const addr = toA1({ row: b.startRow + r, col: b.startCol + c });
        const cell = sheet.cells.get(addr);
        values[r].push(this.cellValue(sheet, addr));
        formulas[r].push(cell?.formula ?? null);
        formats[r].push(cell?.format ?? null);
      }
    }
    return { sheet: sheetName, address, values, formulas, formats };
  }

  async writeRange(sheetName: string, address: string, values: CellValue[][]): Promise<void> {
    const sheet = this.ensureSheet(sheetName);
    const b = parseRange(address);
    values.forEach((rowVals, r) => {
      rowVals.forEach((value, c) => {
        const addr = toA1({ row: b.startRow + r, col: b.startCol + c });
        if (typeof value === "string" && value.startsWith("=")) {
          this.setCell(sheet, addr, this.evaluate(sheet, value), value);
        } else {
          this.setCell(sheet, addr, value);
        }
      });
    });
    this.recalcAll();
  }

  async setFormula(sheetName: string, address: string, formula: string): Promise<void> {
    const sheet = this.ensureSheet(sheetName);
    const f = formula.startsWith("=") ? formula : `=${formula}`;
    const b = parseRange(address);
    for (let r = b.startRow; r <= b.endRow; r++) {
      for (let c = b.startCol; c <= b.endCol; c++) {
        const addr = toA1({ row: r, col: c });
        this.setCell(sheet, addr, this.evaluate(sheet, f), f);
      }
    }
    this.recalcAll();
  }

  private recalcAll(): void {
    for (const sheet of this.sheets.values()) {
      for (const cell of sheet.cells.values()) {
        if (cell.formula) cell.value = this.evaluate(sheet, cell.formula);
      }
    }
  }

  async getSelection(): Promise<SelectionInfo | null> {
    return this.selection;
  }

  async applyStructureOp(op: StructureOp): Promise<void> {
    switch (op.kind) {
      case "insertRows":
        this.shiftCells(this.getSheet(op.sheet), (row) => (row >= op.index ? op.count : 0), () => 0);
        break;
      case "deleteRows":
        this.shiftCells(
          this.getSheet(op.sheet),
          (row) => (row >= op.index && row < op.index + op.count ? null : row >= op.index + op.count ? -op.count : 0),
          () => 0,
        );
        break;
      case "insertCols":
        this.shiftCells(this.getSheet(op.sheet), () => 0, (col) => (col >= op.index ? op.count : 0));
        break;
      case "deleteCols":
        this.shiftCells(
          this.getSheet(op.sheet),
          () => 0,
          (col) => (col >= op.index && col < op.index + op.count ? null : col >= op.index + op.count ? -op.count : 0),
        );
        break;
      case "addSheet":
        if (this.sheets.has(op.name)) throw new Error(`Sheet already exists: ${op.name}`);
        this.sheets.set(op.name, { name: op.name, cells: new Map(), tables: [] });
        break;
      case "deleteSheet":
        if (!this.sheets.delete(op.name)) throw new Error(`Sheet not found: ${op.name}`);
        if (this.activeSheet === op.name) this.activeSheet = this.sheets.keys().next().value ?? "";
        break;
      case "renameSheet": {
        const sheet = this.getSheet(op.from);
        if (this.sheets.has(op.to)) throw new Error(`Sheet already exists: ${op.to}`);
        this.sheets.delete(op.from);
        sheet.name = op.to;
        this.sheets.set(op.to, sheet);
        break;
      }
    }
    this.recalcAll();
  }

  private shiftCells(sheet: MockSheet, rowShift: (row: number) => number | null, colShift: (col: number) => number | null): void {
    const next = new Map<string, MockCell>();
    for (const [addr, cell] of sheet.cells) {
      const { row, col } = parseA1(addr);
      const rd = rowShift(row);
      const cd = colShift(col);
      if (rd === null || cd === null) continue;
      const nr = row + rd;
      const nc = col + cd;
      if (nr < 0 || nc < 0 || nr >= MAX_ROWS || nc >= MAX_COLS) continue;
      next.set(`${indexToCol(nc)}${nr + 1}`, cell);
    }
    sheet.cells = next;
  }

  async setFormat(sheetName: string, address: string, format: CellFormat): Promise<void> {
    const sheet = this.getSheet(sheetName);
    const b = parseRange(address);
    for (let r = b.startRow; r <= b.endRow; r++) {
      for (let c = b.startCol; c <= b.endCol; c++) {
        const addr = toA1({ row: r, col: c });
        const cell = sheet.cells.get(addr) ?? { value: null, formula: null, format: null };
        cell.format = { ...(cell.format ?? {}), ...format };
        sheet.cells.set(addr, cell);
      }
    }
  }

  async addChart(spec: ChartSpec): Promise<void> {
    this.getSheet(spec.sheet);
    this.charts.push(spec);
  }

  async search(query: string, opts?: { matchCase?: boolean; formulasToo?: boolean }): Promise<SearchMatch[]> {
    const needle = opts?.matchCase ? query : query.toLowerCase();
    const matches: SearchMatch[] = [];
    for (const sheet of this.sheets.values()) {
      for (const [addr, cell] of sheet.cells) {
        const value = this.cellValue(sheet, addr);
        const haystacks: string[] = [];
        if (value !== null) haystacks.push(String(value));
        if (opts?.formulasToo && cell.formula) haystacks.push(cell.formula);
        const hit = haystacks.some((h) => (opts?.matchCase ? h : h.toLowerCase()).includes(needle));
        if (hit) matches.push({ sheet: sheet.name, address: addr, value, formula: cell.formula });
      }
    }
    return matches;
  }

  async captureCheckpoint(): Promise<CheckpointData> {
    return { sheets: [...this.sheets.values()].map((sheet, i) => this.snapshotSheet(sheet, i)) };
  }

  private snapshotSheet(sheet: MockSheet, position: number): SheetSnapshot {
    const snap = emptySnapshot(sheet.name, position);
    snap.charts = this.charts.flatMap((c, i) => (c.sheet === sheet.name ? [String(i)] : []));
    const bounds = this.sheetBounds(sheet);
    if (!bounds) return snap;
    const formats: (CellFormat | null)[][] = [];
    for (let r = 0; r <= bounds.endRow; r++) {
      const inputs: CellInput[] = [];
      formats.push([]);
      for (let c = 0; c <= bounds.endCol; c++) {
        const cell = sheet.cells.get(toA1({ row: r, col: c }));
        inputs.push(cell?.formula ?? cell?.value ?? "");
        formats[r].push(cell?.format ? { ...cell.format } : null);
      }
      snap.inputs.push(inputs);
    }
    snap.formats = formats;
    return snap;
  }

  async restoreCheckpoint(data: CheckpointData): Promise<void> {
    const byName = new Map(data.sheets.map((s) => [s.name, s]));
    this.charts = this.charts.filter((c, i) => byName.get(c.sheet)?.charts.includes(String(i)) ?? false);

    const ordered = [...data.sheets].sort((a, b) => a.position - b.position);
    const next = new Map<string, MockSheet>();
    for (const target of ordered) {
      const sheet = this.sheets.get(target.name) ?? { name: target.name, cells: new Map(), tables: [] };
      const diff = diffSheet(target, this.snapshotSheet(sheet, target.position));
      for (const run of diff.contentRuns) {
        run.items.forEach((input, i) => {
          const addr = toA1({ row: run.row, col: run.startCol + i });
          if (typeof input === "string" && input.startsWith("=")) this.setCell(sheet, addr, null, input);
          else this.setCell(sheet, addr, input === "" ? null : input);
        });
      }
      for (const run of diff.formatRuns) {
        run.items.forEach((format, i) => {
          const addr = toA1({ row: run.row, col: run.startCol + i });
          const cell = sheet.cells.get(addr);
          if (format) {
            sheet.cells.set(addr, { value: cell?.value ?? null, formula: cell?.formula ?? null, format: { ...(format as CellFormat) } });
          } else if (cell) {
            cell.format = null;
            if (cell.formula === null && cell.value === null) sheet.cells.delete(addr);
          }
        });
      }
      next.set(target.name, sheet);
    }
    this.sheets = next;
    if (!this.sheets.has(this.activeSheet)) this.activeSheet = this.sheets.keys().next().value ?? "";
    this.recalcAll();
  }

  async listFormulas(): Promise<{ sheet: string; address: string; formula: string }[]> {
    const out: { sheet: string; address: string; formula: string }[] = [];
    for (const sheet of this.sheets.values()) {
      for (const [addr, cell] of sheet.cells) {
        if (cell.formula) out.push({ sheet: sheet.name, address: addr, formula: cell.formula });
      }
    }
    return out;
  }

  getCapabilities(): { undoGrouping: boolean; charts: boolean } {
    return { undoGrouping: false, charts: true };
  }
}
