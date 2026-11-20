import { describe, expect, it, vi } from "vitest";
import { RpcBridge, SidecarClient } from "./client";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: Record<string, unknown>;
}

class FakeBridge implements RpcBridge {
  public readonly requests: JsonRpcRequest[] = [];
  public listenCalls = 0;
  private onMessage: ((message: string) => void) | null = null;

  public async listen(onMessage: (message: string) => void): Promise<void> {
    this.listenCalls += 1;
    this.onMessage = onMessage;
  }

  public async send(message: string): Promise<void> {
    const request = JSON.parse(message) as JsonRpcRequest;
    this.requests.push(request);
    this.respond(request.id, { status: "ok" });
  }

  public notify(method: string, params: Record<string, unknown>): void {
    this.onMessage?.(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  public respond(id: number, result: unknown): void {
    this.onMessage?.(JSON.stringify({ jsonrpc: "2.0", id, result }));
  }
}

describe("SidecarClient IPC contract", () => {
  it("sends the canonical transcription parameters without the legacy device alias", async () => {
    const bridge = new FakeBridge();
    const client = new SidecarClient(bridge);

    await client.startTranscription("C:\\audio\\лекция.wav", "small", "cpu", "medical-ru");

    expect(bridge.requests).toHaveLength(1);
    expect(bridge.requests[0]).toMatchObject({
      method: "start_transcription",
      params: {
        file_path: "C:\\audio\\лекция.wav",
        model_id: "small",
        device_preference: "cpu",
        dictionary_id: "medical-ru",
      },
    });
    expect(bridge.requests[0].params).not.toHaveProperty("device");
  });

  it("removes undefined optional values from outgoing messages", async () => {
    const bridge = new FakeBridge();
    const client = new SidecarClient(bridge);

    await client.updateHistoryEntry("entry-1", undefined, "Новый текст");

    expect(bridge.requests[0].params).toEqual({
      entry_id: "entry-1",
      edited_text: "Новый текст",
    });
  });

  it("delivers declared streaming notifications to subscribers", async () => {
    const bridge = new FakeBridge();
    const client = new SidecarClient(bridge);
    const listener = vi.fn();
    client.on("transcription_progress", listener);
    await Promise.resolve();

    bridge.notify("transcription_progress", { percent: 42 });

    expect(listener).toHaveBeenCalledWith({ percent: 42 });
  });

  it("ignores notifications absent from the shared contract", async () => {
    const bridge = new FakeBridge();
    const client = new SidecarClient(bridge);
    const listener = vi.fn();
    client.on("unknown_event", listener);
    await Promise.resolve();

    bridge.notify("unknown_event", { value: true });

    expect(listener).not.toHaveBeenCalled();
  });

  it("registers exactly one bridge listener for concurrent startup calls", async () => {
    const bridge = new FakeBridge();
    const client = new SidecarClient(bridge);

    await Promise.all([client.getHistory(), client.getModels(), client.getDictionaries()]);

    expect(bridge.listenCalls).toBe(1);
  });
});
