import { MockHost } from "../host/mock.js";
import { OfficeJsHost } from "../host/officejs.js";
import type { WorkbookHost } from "../host/types.js";
import "./app.js";
import type { BeboApp } from "./app.js";

function createMockHost(): WorkbookHost {
  return new MockHost({
    Sheet1: {
      A1: "Region",
      B1: "Sales",
      C1: "Cost",
      A2: "North",
      B2: 1200,
      C2: 800,
      A3: "South",
      B3: 950,
      C3: 610,
      A4: "East",
      B4: 1430,
      C4: 900,
    },
  });
}

async function main(): Promise<void> {
  const app = document.querySelector<BeboApp>("bebo-app")!;

  if (OfficeJsHost.isAvailable()) {
    try {
      const office = (globalThis as { Office?: { onReady: (cb: () => void) => Promise<unknown> } }).Office;
      await office?.onReady(() => {});
      app.init(new OfficeJsHost());
      return;
    } catch {
      // fall through to mock dev mode
    }
  }
  app.init(createMockHost());
}

void main();
