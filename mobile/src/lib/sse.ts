export type SseEvent = unknown;

export interface SseParserOptions {
  onEvent: (event: SseEvent) => void;
  onError?: (error: Error) => void;
}

/**
 * Incremental parser for a UTF-8 decoded Server-Sent Events stream.
 * Network chunk boundaries are independent from SSE line/event boundaries.
 */
export function createSseParser(options: SseParserOptions) {
  let buffer = "";
  let dataLines: string[] = [];
  let eventName: string | undefined;
  let ended = false;

  const resetEvent = () => {
    dataLines = [];
    eventName = undefined;
  };

  const dispatch = () => {
    if (dataLines.length === 0) {
      resetEvent();
      return;
    }

    const payload = dataLines.join("\n");
    try {
      const parsed: unknown = JSON.parse(payload);
      if (
        eventName &&
        parsed !== null &&
        typeof parsed === "object" &&
        !("type" in parsed)
      ) {
        options.onEvent({ type: eventName, data: parsed });
      } else {
        options.onEvent(parsed);
      }
    } catch {
      options.onError?.(new Error("Invalid JSON in SSE data event"));
    } finally {
      resetEvent();
    }
  };

  const processLine = (rawLine: string) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

    if (line === "") {
      dispatch();
      return;
    }

    if (line.startsWith(":")) {
      return;
    }

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "data") {
      dataLines.push(value);
    } else if (field === "event") {
      eventName = value;
    }
  };

  return {
    push(chunk: string) {
      if (ended) {
        throw new Error("Cannot push data after SSE parser has ended");
      }

      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        processLine(buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
      }
    },

    end() {
      if (ended) {
        return;
      }
      ended = true;

      if (buffer.length > 0) {
        processLine(buffer);
        buffer = "";
      }
      dispatch();
    },
  };
}
