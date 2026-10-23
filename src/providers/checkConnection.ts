import type { Provider } from "./types.js";

export async function checkProviderConnection(
  provider: Provider,
  options: { model: string; apiKey: string; baseURL?: string; signal?: AbortSignal },
): Promise<void> {
  let response = "";
  for await (const delta of provider.streamChat({
    messages: [{ role: "user", content: "Reply with OK only to confirm this connection." }],
    model: options.model,
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    signal: options.signal,
  })) {
    if (delta.type === "text") response += delta.text;
  }
  if (!response.trim()) throw new Error("The provider returned an empty response.");
}
