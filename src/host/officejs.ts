import { parseRange, rangeDimensions } from "./address.js";
import { diffSheet, emptySnapshot } from "./snapshot.js";
import type {
  CellFormat,
  CellValue,
  ChartSpec,
  CheckpointData,
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

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const Excel: any;
declare const Office: any;

const CHUNK_ROWS = 250;
/** Cells per Excel request when snapshotting; keeps each sync payload small. */
const SNAPSHOT_CHUNK_CELLS = 20_000;
/** Above this, a sheet's formats are not snapshotted (rollback restores its content only). */
const MAX_FORMAT_SNAPSHOT_CELLS = 250_000;

const CELL_FORMAT_PROPS = {
  format: {
    font: { bold: true, italic: true, underline: true, strikethrough: true, color: true, size: true, name: true },
    fill: { color: true, pattern: true },
    horizontalAlignment: true,
    verticalAlignment: true,
    wrapText: true,
    indentLevel: true,
    borders: { style: true, color: true, weight: true },
  },
};

interface SnapshotFormat {
  format: any;
  numberFormat: string;
}

/**
 * Turns a captured cell format into one safe to hand to setCellProperties: an unfilled cell
 * keeps no fill (the run's fill was already cleared, so writing its reported white would paint
 * over gridlines), and a missing border carries only its "None" style.
 */
function settableFormat(format: any): any {
  if (!format) return {};
  const out = { ...format };
  if (!out.fill || out.fill.pattern === "None") delete out.fill;
  if (out.borders) {
    out.borders = Object.fromEntries(
      Object.entries(out.borders).map(([edge, b]: [string, any]) => [edge, b?.style === "None" ? { style: "None" } : b]),
    );
  }
  return out;
}

export class OfficeJsHost implements WorkbookHost {
  readonly kind = "officejs";
  private caps: { undoGrouping: boolean; charts: boolean } | null = null;

  static isAvailable(): boolean {
    return typeof Office !== "undefined" && typeof Excel !== "undefined";
  }

  private hasApi(set: string): boolean {
    try {
      return Office.context.requirements.isSetSupported("ExcelApi", set);
    } catch {
      return false;
    }
  }

  getCapabilities(): { undoGrouping: boolean; charts: boolean } {
    if (!this.caps) this.caps = { undoGrouping: this.hasApi("1.20"), charts: this.hasApi("1.1") };
    return this.caps;
  }

  async getOverview(): Promise<WorkbookOverview> {
    return Excel.run(async (ctx: any) => {
      const sheets = ctx.workbook.worksheets;
      sheets.load("items/name");
      const names = ctx.workbook.names;
      names.load("items/name,items/formula");
      const selection = ctx.workbook.getSelectedRange();
      selection.load("address,worksheet/name");
      const active = ctx.workbook.worksheets.getActiveWorksheet();
      active.load("name");
      await ctx.sync();

      const overviews: SheetOverview[] = [];
      for (const sheet of sheets.items) {
        const used = sheet.getUsedRangeOrNullObject();
        used.load("address,rowCount,columnCount,isNullObject");
        const tables = sheet.tables;
        tables.load("items/name");
        await ctx.sync();

        const tableInfos: TableInfo[] = [];
        for (const t of tables.items) {
          const cols = t.columns;
          cols.load("items/name");
          const range = t.getRange();
          range.load("address");
          await ctx.sync();
          tableInfos.push({
            name: t.name,
            range: stripSheet(range.address),
            columns: cols.items.map((c: any) => c.name),
          });
        }

        let headers: string[] = [];
        let usedRange: string | null = null;
        let rowCount = 0;
        let colCount = 0;
        if (!used.isNullObject) {
          usedRange = stripSheet(used.address);
          rowCount = used.rowCount;
          colCount = used.columnCount;
          const headerRange = used.getRow(0);
          headerRange.load("values");
          await ctx.sync();
          headers = (headerRange.values[0] ?? []).map((v: any) => (v == null ? "" : String(v)));
        }
        overviews.push({ name: sheet.name, usedRange, rowCount, colCount, headers, tables: tableInfos });
      }

      return {
        sheets: overviews,
        namedRanges: names.items.map((n: any) => ({ name: n.name, refersTo: String(n.formula) })),
        activeSheet: active.name,
        selection: selection
          ? { sheet: stripSheet(selection.address).split("!")[0] ?? active.name, address: stripSheet(selection.address) }
          : null,
      };
    });
  }

  async readRange(sheet: string, address: string): Promise<RangeData> {
    const b = parseRange(address);
    const { rows, cols } = rangeDimensions(b);
    const values: CellValue[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
    const formulas: (string | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
    const formats: (CellFormat | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));

    await Excel.run(async (ctx: any) => {
      const ws = ctx.workbook.worksheets.getItem(sheet);
      for (let r0 = 0; r0 < rows; r0 += CHUNK_ROWS) {
        const take = Math.min(CHUNK_ROWS, rows - r0);
        const range = ws.getRangeByIndexes(b.startRow + r0, b.startCol, take, cols);
        range.load("values,formulas");
        range.format.load("font/bold,font/italic,font/size,font/color,fill/color,horizontalAlignment");
        range.load("numberFormat");
        await ctx.sync();
        for (let r = 0; r < take; r++) {
          for (let c = 0; c < cols; c++) {
            values[r0 + r][c] = range.values[r][c] as CellValue;
            const f = range.formulas[r][c];
            formulas[r0 + r][c] = typeof f === "string" && f.startsWith("=") ? f : null;
            const nf = range.numberFormat?.[r]?.[c];
            formats[r0 + r][c] = nf && nf !== "General" ? { numberFormat: String(nf) } : null;
          }
        }
      }
    });
    return { sheet, address, values, formulas, formats };
  }

  async writeRange(sheet: string, address: string, values: CellValue[][]): Promise<void> {
    await Excel.run(async (ctx: any) => {
      const ws = ctx.workbook.worksheets.getItem(sheet);
      const b = parseRange(address);
      const range = ws.getRangeByIndexes(b.startRow, b.startCol, values.length, values[0]?.length ?? 1);
      range.values = values as any;
      await ctx.sync();
    });
  }

  async setFormula(sheet: string, address: string, formula: string): Promise<void> {
    await Excel.run(async (ctx: any) => {
      const ws = ctx.workbook.worksheets.getItem(sheet);
      const b = parseRange(address);
      const { rows, cols } = rangeDimensions(b);
      const f = formula.startsWith("=") ? formula : `=${formula}`;
      const range = ws.getRangeByIndexes(b.startRow, b.startCol, rows, cols);
      range.formulas = Array.from({ length: rows }, () => Array(cols).fill(f));
      await ctx.sync();
    });
  }

  async getSelection(): Promise<SelectionInfo | null> {
    return Excel.run(async (ctx: any) => {
      const range = ctx.workbook.getSelectedRange();
      range.load("address");
      const sheet = range.worksheet;
      sheet.load("name");
      await ctx.sync();
      return { sheet: sheet.name, address: stripSheet(range.address) };
    });
  }

  async applyStructureOp(op: StructureOp): Promise<void> {
    await Excel.run(async (ctx: any) => {
      const sheets = ctx.workbook.worksheets;
      switch (op.kind) {
        case "insertRows":
        case "deleteRows": {
          const ws = sheets.getItem(op.sheet);
          const range = ws.getRangeByIndexes(op.index, 0, op.count, 1).getEntireRow();
          if (op.kind === "insertRows") range.insert("Down");
          else range.delete("Up");
          break;
        }
        case "insertCols":
        case "deleteCols": {
          const ws = sheets.getItem(op.sheet);
          const range = ws.getRangeByIndexes(0, op.index, 1, op.count).getEntireColumn();
          if (op.kind === "insertCols") range.insert("Right");
          else range.delete("Left");
          break;
        }
        case "addSheet":
          sheets.add(op.name);
          break;
        case "deleteSheet":
          sheets.getItem(op.name).delete();
          break;
        case "renameSheet":
          sheets.getItem(op.from).name = op.to;
          break;
      }
      await ctx.sync();
    });
  }

  async setFormat(sheet: string, address: string, format: CellFormat): Promise<void> {
    await Excel.run(async (ctx: any) => {
      const ws = ctx.workbook.worksheets.getItem(sheet);
      const b = parseRange(address);
      const { rows, cols } = rangeDimensions(b);
      const range = ws.getRangeByIndexes(b.startRow, b.startCol, rows, cols);
      if (format.bold !== undefined) range.format.font.bold = format.bold;
      if (format.italic !== undefined) range.format.font.italic = format.italic;
      if (format.fontSize !== undefined) range.format.font.size = format.fontSize;
      if (format.fontColor) range.format.font.color = format.fontColor;
      if (format.fillColor) range.format.fill.color = format.fillColor;
      if (format.horizontalAlign) range.format.horizontalAlignment = format.horizontalAlign;
      if (format.numberFormat) {
        range.numberFormat = Array.from({ length: rows }, () => Array(cols).fill(format.numberFormat));
      }
      await ctx.sync();
    });
  }

  async addChart(spec: ChartSpec): Promise<void> {
    if (!this.getCapabilities().charts) throw new Error("Charts not supported by this Excel client");
    await Excel.run(async (ctx: any) => {
      const ws = ctx.workbook.worksheets.getItem(spec.sheet);
      const b = parseRange(spec.dataRange);
      const { rows, cols } = rangeDimensions(b);
      const dataRange = ws.getRangeByIndexes(b.startRow, b.startCol, rows, cols);
      const anchor = spec.position ?? "A1";
      const pb = parseRange(anchor);
      const anchorRange = ws.getRangeByIndexes(pb.startRow, pb.startCol, 15, 8);
      const typeMap: Record<string, string> = {
        column: "ColumnClustered",
        bar: "BarClustered",
        line: "Line",
        pie: "Pie",
        scatter: "XYScatter",
      };
      const chart = ws.charts.add(typeMap[spec.type] ?? "ColumnClustered", dataRange, "Auto");
      chart.setPosition(anchorRange, anchorRange);
      if (spec.title) chart.title.text = spec.title;
      await ctx.sync();
    });
  }

  async search(query: string, opts?: { matchCase?: boolean; formulasToo?: boolean }): Promise<SearchMatch[]> {
    return Excel.run(async (ctx: any) => {
      const sheets = ctx.workbook.worksheets;
      sheets.load("items/name");
      await ctx.sync();
      const matches: SearchMatch[] = [];
      for (const sheet of sheets.items) {
        const used = sheet.getUsedRangeOrNullObject();
        used.load("isNullObject,values,formulas,address");
        await ctx.sync();
        if (used.isNullObject) continue;
        const needle = opts?.matchCase ? query : query.toLowerCase();
        const base = parseRange(stripSheet(used.address));
        for (let r = 0; r < used.values.length; r++) {
          for (let c = 0; c < used.values[r].length; c++) {
            const value = used.values[r][c] as CellValue;
            const formula = used.formulas[r][c] as string;
            const hasFormula = typeof formula === "string" && formula.startsWith("=");
            const hay: string[] = [];
            if (value !== null && value !== "") hay.push(String(value));
            if (opts?.formulasToo && hasFormula) hay.push(formula);
            const hit = hay.some((h) => (opts?.matchCase ? h : h.toLowerCase()).includes(needle));
            if (hit) {
              matches.push({
                sheet: sheet.name,
                address: `${colName(base.startCol + c)}${base.startRow + r + 1}`,
                value: value === "" ? null : value,
                formula: hasFormula ? formula : null,
              });
            }
          }
        }
      }
      return matches;
    });
  }

  async captureCheckpoint(): Promise<CheckpointData> {
    return Excel.run(async (ctx: any) => {
      const sheets = ctx.workbook.worksheets;
      sheets.load("items/name,items/position");
      await ctx.sync();
      const out: SheetSnapshot[] = [];
      for (const sheet of sheets.items) out.push(await this.snapshotSheet(ctx, sheet));
      return { sheets: out };
    });
  }

  private async snapshotSheet(ctx: any, sheet: any): Promise<SheetSnapshot> {
    const used = sheet.getUsedRangeOrNullObject();
    used.load("isNullObject,address,rowCount,columnCount");
    const charts = sheet.charts;
    charts.load("items/name");
    await ctx.sync();

    const snap = emptySnapshot(sheet.name, sheet.position);
    snap.charts = charts.items.map((c: any) => c.name);
    if (used.isNullObject) return snap;

    const base = parseRange(stripSheet(used.address));
    snap.startRow = base.startRow;
    snap.startCol = base.startCol;
    const rows: number = used.rowCount;
    const cols: number = used.columnCount;
    const withFormats = this.hasApi("1.9") && rows * cols <= MAX_FORMAT_SNAPSHOT_CELLS;
    const formats: unknown[][] = [];
    const step = Math.max(1, Math.floor(SNAPSHOT_CHUNK_CELLS / cols));

    for (let r0 = 0; r0 < rows; r0 += step) {
      const take = Math.min(step, rows - r0);
      const range = sheet.getRangeByIndexes(base.startRow + r0, base.startCol, take, cols);
      range.load("formulas,numberFormat");
      const props = withFormats ? range.getCellProperties(CELL_FORMAT_PROPS) : null;
      await ctx.sync();
      for (let r = 0; r < take; r++) {
        snap.inputs.push(range.formulas[r].map((f: any) => (f === null || f === undefined ? "" : f)));
        if (props) {
          formats.push(
            props.value[r].map((p: any, c: number) => ({ format: p.format, numberFormat: String(range.numberFormat[r][c]) })),
          );
        }
      }
    }
    snap.formats = withFormats ? formats : null;
    return snap;
  }

  async restoreCheckpoint(data: CheckpointData): Promise<void> {
    await Excel.run(async (ctx: any) => {
      const sheets = ctx.workbook.worksheets;
      const wanted = new Set(data.sheets.map((s) => s.name));

      // Re-create deleted sheets first, so deleting extras never removes the last sheet.
      // getItemOrNullObject is required here: getItem on a missing sheet only fails at sync().
      for (const s of data.sheets) {
        const ws = sheets.getItemOrNullObject(s.name);
        await ctx.sync();
        if (ws.isNullObject) sheets.add(s.name);
      }
      await ctx.sync();

      sheets.load("items/name");
      await ctx.sync();
      for (const sheet of sheets.items) {
        if (!wanted.has(sheet.name)) sheet.delete();
      }
      await ctx.sync();

      for (const s of [...data.sheets].sort((a, b) => a.position - b.position)) {
        sheets.getItem(s.name).position = s.position;
        await ctx.sync();
      }

      for (const target of data.sheets) {
        const ws = sheets.getItem(target.name);
        ws.load("name,position");
        await ctx.sync();
        const current = await this.snapshotSheet(ctx, ws);
        const diff = diffSheet(target, current);

        for (const run of diff.contentRuns) {
          ws.getRangeByIndexes(run.row, run.startCol, 1, run.items.length).formulas = [run.items];
        }
        for (const run of diff.formatRuns) {
          const range = ws.getRangeByIndexes(run.row, run.startCol, 1, run.items.length);
          if (run.items[0] === null) {
            range.clear("Formats");
            continue;
          }
          const items = run.items as SnapshotFormat[];
          range.format.fill.clear();
          range.setCellProperties([items.map((f) => settableFormat(f.format))]);
          range.numberFormat = [items.map((f) => f.numberFormat)];
        }

        const keepCharts = new Set(target.charts);
        const charts = ws.charts;
        charts.load("items/name");
        await ctx.sync();
        for (const chart of charts.items) {
          if (!keepCharts.has(chart.name)) chart.delete();
        }
        await ctx.sync();
      }
    });
  }

  async listFormulas(): Promise<{ sheet: string; address: string; formula: string }[]> {
    return Excel.run(async (ctx: any) => {
      const sheets = ctx.workbook.worksheets;
      sheets.load("items/name");
      await ctx.sync();
      const out: { sheet: string; address: string; formula: string }[] = [];
      for (const sheet of sheets.items) {
        const used = sheet.getUsedRangeOrNullObject();
        used.load("isNullObject,formulas,address");
        await ctx.sync();
        if (used.isNullObject) continue;
        const base = parseRange(stripSheet(used.address));
        for (let r = 0; r < used.formulas.length; r++) {
          for (let c = 0; c < used.formulas[r].length; c++) {
            const f = used.formulas[r][c] as string;
            if (typeof f === "string" && f.startsWith("=")) {
              out.push({ sheet: sheet.name, address: `${colName(base.startCol + c)}${base.startRow + r + 1}`, formula: f });
            }
          }
        }
      }
      return out;
    });
  }
}

function stripSheet(address: string): string {
  return address.includes("!") ? address.split("!").pop()!.replace(/'/g, "") : address;
}

function colName(index: number): string {
  let s = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
