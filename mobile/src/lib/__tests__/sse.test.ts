import { describe, expect, it } from "vitest";

import { createSseParser } from "../sse";

describe("createSseParser", () => {
  it("reassembles a JSON event split across fetch chunks", () => {
    const events: unknown[] = [];
    const parser = createSseParser({ onEvent: (event) => events.push(event) });

    parser.push('data: {"type":"message.delta","data":{"text":"Hel');
    parser.push('lo"}}\n\n');
    parser.end();

    expect(events).toEqual([
      { type: "message.delta", data: { text: "Hello" } },
    ]);
  });

  it("ignores keepalive comments and parses multiple events in one chunk", () => {
    const events: unknown[] = [];
    const parser = createSseParser({ onEvent: (event) => events.push(event) });

    parser.push(
      ': keepalive\n\n' +
        'event: message.delta\n' +
        'data: {"type":"message.delta","data":{"text":"A"}}\n\n' +
        'data: {"type":"run.completed"}\n\n',
    );
    parser.end();

    expect(events).toEqual([
      { type: "message.delta", data: { text: "A" } },
      { type: "run.completed" },
    ]);
  });

  it("reports malformed JSON without stopping later events", () => {
    const events: unknown[] = [];
    const errors: Error[] = [];
    const parser = createSseParser({
      onEvent: (event) => events.push(event),
      onError: (error) => errors.push(error),
    });

    parser.push("data: {not-json}\n\n");
    parser.push('data: {"type":"run.completed"}\n\n');
    parser.end();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect(events).toEqual([{ type: "run.completed" }]);
  });
});
