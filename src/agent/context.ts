import type { WorkbookHost } from "../host/types.js";
import { estimateTokens } from "./types.js";

export class ChangeLog {
  private entries: string[] = [];

  constructor(private maxEntries = 20) {}

  record(entry: string): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.shift();
  }

  recent(): string[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

export interface BlueprintOptions {
  maxTokens?: number;
  maxHeadersPerSheet?: number;
}

export async function buildBlueprint(
  host: WorkbookHost,
  changeLog?: ChangeLog,
  opts: BlueprintOptions = {},
): Promise<string> {
  const maxTokens = opts.maxTokens ?? 1500;
  const maxHeaders = opts.maxHeadersPerSheet ?? 24;
  const overview = await host.getOverview();

  const lines: string[] = ["# Workbook", ""];
  lines.push(`Active sheet: ${overview.activeSheet}`);
  if (overview.selection) {
    lines.push(`Selection: ${overview.selection.sheet}!${overview.selection.address}`);
  }
  lines.push("");

  for (const sheet of overview.sheets) {
    const dims = sheet.usedRange ? `used ${sheet.usedRange} (${sheet.rowCount}x${sheet.colCount})` : "empty";
    lines.push(`## ${sheet.name} — ${dims}`);
    if (sheet.headers.length > 0) {
      const shown = sheet.headers.slice(0, maxHeaders);
      const more = sheet.headers.length > maxHeaders ? ` … +${sheet.headers.length - maxHeaders} cols` : "";
      lines.push(`headers: ${shown.map((h) => h || "·").join(" | ")}${more}`);
    }
    for (const table of sheet.tables) {
      lines.push(`table ${table.name} @ ${table.range}: ${table.columns.join(" | ")}`);
    }
    lines.push("");
  }

  if (overview.namedRanges.length > 0) {
    lines.push("## Named ranges");
    for (const nr of overview.namedRanges) lines.push(`- ${nr.name} = ${nr.refersTo}`);
    lines.push("");
  }

  const changes = changeLog?.recent() ?? [];
  if (changes.length > 0) {
    lines.push("## Recent changes");
    for (const c of changes) lines.push(`- ${c}`);
    lines.push("");
  }

  let text = lines.join("\n");
  while (estimateTokens(text) > maxTokens && lines.length > 4) {
    lines.splice(lines.length - 4, 1);
    text = lines.join("\n");
  }
  return text;
}
