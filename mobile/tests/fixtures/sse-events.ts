export type FixtureEvent = Record<string, unknown>;

export const defaultFixtureEvents = (runId: string): FixtureEvent[] => [
  {
    event: "tool.started",
    run_id: runId,
    tool: "fixture",
    preview: "simulated",
  },
  {
    event: "message.delta",
    run_id: runId,
    delta: "Hello from fixture",
  },
  {
    event: "tool.completed",
    run_id: runId,
    tool: "fixture",
    duration: 0.01,
    error: false,
  },
  {
    event: "run.completed",
    run_id: runId,
    output: "Hello from fixture",
  },
];

export const approvalFixtureEvents = (runId: string): FixtureEvent[] => [
  {
    event: "approval.request",
    run_id: runId,
    command: "[redacted fixture command]",
    choices: ["once", "session", "deny"],
  },
];

export const failureFixtureEvents = (runId: string): FixtureEvent[] => [
  {
    event: "run.failed",
    run_id: runId,
    error: "fixture failure",
  },
];

export const cancelledFixtureEvents = (runId: string): FixtureEvent[] => [
  {
    event: "run.cancelled",
    run_id: runId,
  },
];

export function encodeSseEvents(events: FixtureEvent[]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}

/** Split a payload at non-event boundaries to exercise incremental parsers. */
export function splitSsePayload(payload: string): string[] {
  if (payload.length < 12) {
    return [payload];
  }
  const firstCut = Math.min(11, payload.length - 1);
  const secondCut = Math.min(firstCut + 23, payload.length);
  return [payload.slice(0, firstCut), payload.slice(firstCut, secondCut), payload.slice(secondCut)].filter(
    (chunk) => chunk.length > 0,
  );
}
