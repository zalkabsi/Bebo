import type { CheckpointData, WorkbookHost } from "../host/types.js";
import type { CheckpointInfo } from "./types.js";

interface CheckpointEntry extends CheckpointInfo {
  data: CheckpointData;
}

export class CheckpointStore {
  private entries: CheckpointEntry[] = [];
  private seq = 0;

  constructor(private host: WorkbookHost) {}

  async create(label: string): Promise<CheckpointInfo> {
    const data = await this.host.captureCheckpoint();
    const entry: CheckpointEntry = {
      id: `cp_${Date.now().toString(36)}_${this.seq++}`,
      label,
      createdAt: Date.now(),
      data,
    };
    this.entries.push(entry);
    return { id: entry.id, label: entry.label, createdAt: entry.createdAt };
  }

  async rollback(id: string): Promise<CheckpointInfo> {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx < 0) throw new Error(`Checkpoint not found: ${id}`);
    const entry = this.entries[idx];
    await this.host.restoreCheckpoint(entry.data);
    this.entries = this.entries.slice(0, idx + 1);
    return { id: entry.id, label: entry.label, createdAt: entry.createdAt };
  }

  list(): CheckpointInfo[] {
    return this.entries.map(({ id, label, createdAt }) => ({ id, label, createdAt }));
  }

  latest(): CheckpointInfo | undefined {
    const e = this.entries[this.entries.length - 1];
    return e ? { id: e.id, label: e.label, createdAt: e.createdAt } : undefined;
  }

  clear(): void {
    this.entries = [];
  }
}
