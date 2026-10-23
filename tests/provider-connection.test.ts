import { describe, expect, it } from "vitest";
import { checkProviderConnection } from "../src/providers/checkConnection.js";
import { FakeProvider } from "./helpers.js";

describe("provider connection check", () => {
  it("sends only a generic prompt and accepts a text response", async () => {
    const provider = new FakeProvider();
    provider.scripts = [{ text: "OK" }];

    await expect(checkProviderConnection(provider, {
      model: "test-model",
      apiKey: "test-key",
      baseURL: "https://provider.example/v1",
    })).resolves.toBeUndefined();

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0].messages).toEqual([
      { role: "user", content: "Reply with OK only to confirm this connection." },
    ]);
    expect(provider.requests[0].tools).toBeUndefined();
  });

  it("reports an empty response as a failed connection", async () => {
    const provider = new FakeProvider();
    provider.scripts = [{ text: "" }];

    await expect(checkProviderConnection(provider, {
      model: "test-model",
      apiKey: "",
    })).rejects.toThrow("The provider returned an empty response.");
  });
});
