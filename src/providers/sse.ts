export async function* sseJsonStream(response: Response): AsyncGenerator<unknown> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Provider HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
  if (!response.body) throw new Error("Provider response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          yield JSON.parse(data);
        } catch {
          // partial or non-JSON SSE line; skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
