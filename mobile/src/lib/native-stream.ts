import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";

export type NativeStreamImplementation = (
  input: RequestInfo | URL,
  init: RequestInit,
  onChunk: (chunk: string) => void,
) => Promise<void>;

interface NativeStreamEvent {
  streamId: string;
  chunk?: string;
  message?: string;
  status?: number;
}

interface HermesStreamPlugin {
  start(options: {
    streamId: string;
    url: string;
    headers: Record<string, string>;
  }): Promise<{ streamId: string }>;
  stop(options: { streamId: string }): Promise<void>;
  addListener(
    eventName: "streamChunk" | "streamComplete" | "streamError",
    listener: (event: NativeStreamEvent) => void,
  ): Promise<PluginListenerHandle>;
}

const HermesStream = registerPlugin<HermesStreamPlugin>("HermesStream");

function abortError(): DOMException {
  return new DOMException("The Hermes stream was cancelled", "AbortError");
}

function createStreamId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `stream-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getNativeStreamImplementation(): NativeStreamImplementation | undefined {
  if (!Capacitor.isNativePlatform()) {
    return undefined;
  }

  return async (input, init, onChunk) => {
    if (init.signal?.aborted) {
      throw abortError();
    }

    const streamId = createStreamId();
    let settleResolve: (() => void) | undefined;
    let settleReject: ((error: Error) => void) | undefined;
    const settled = new Promise<void>((resolve, reject) => {
      settleResolve = resolve;
      settleReject = reject;
    });

    const handles = await Promise.all([
      HermesStream.addListener("streamChunk", (event) => {
        if (event.streamId === streamId && typeof event.chunk === "string") {
          onChunk(event.chunk);
        }
      }),
      HermesStream.addListener("streamComplete", (event) => {
        if (event.streamId === streamId) {
          settleResolve?.();
        }
      }),
      HermesStream.addListener("streamError", (event) => {
        if (event.streamId !== streamId) return;
        const status = typeof event.status === "number" ? ` (HTTP ${event.status})` : "";
        settleReject?.(new Error(`${event.message || "Hermes event stream failed"}${status}`));
      }),
    ]);

    const onAbort = () => {
      void HermesStream.stop({ streamId });
      settleReject?.(abortError());
    };
    init.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      await HermesStream.start({
        streamId,
        url: String(input),
        headers: Object.fromEntries(new Headers(init.headers).entries()),
      });
      await settled;
    } finally {
      init.signal?.removeEventListener("abort", onAbort);
      await Promise.all(handles.map((handle) => handle.remove()));
    }
  };
}
