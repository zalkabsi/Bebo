import { ToolRegistry } from "../registry.js";
import { execJs } from "../exec_js.js";
import { createCommunityActionBoard } from "../community/action_board.js";
import { addChart } from "./chart.js";
import { askUser, explainFormula, traceDependencies } from "./dependencies.js";
import { fillFormula } from "./fill_formula.js";
import { formatCells } from "./format.js";
import { getWorkbookOverview } from "./overview.js";
import { readRange } from "./read_range.js";
import { searchWorkbook } from "./search.js";
import { modifyStructure } from "./structure.js";
import { rollbackToCheckpoint, undoLast } from "./undo.js";
import { writeCells } from "./write_cells.js";

export const excelTools = [
  createCommunityActionBoard,
  getWorkbookOverview,
  readRange,
  writeCells,
  fillFormula,
  searchWorkbook,
  modifyStructure,
  formatCells,
  addChart,
  traceDependencies,
  explainFormula,
  askUser,
  undoLast,
  rollbackToCheckpoint,
  execJs,
];

export function createExcelToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerAll(excelTools);
  return registry;
}
