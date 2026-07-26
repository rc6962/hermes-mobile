import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createHermesApi } from "../hermes-api";
import {
  createFakeHermesServer,
  type FakeHermesServer,
} from "../../../tests/fixtures/fake-hermes-server";

describe("fake Hermes server fixture", () => {
  let server: FakeHermesServer;

  beforeEach(async () => {
    server = createFakeHermesServer({ apiKey: "fixture-key" });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it("serves authenticated health, capabilities, run creation, and chunked SSE", async () => {
    const api = createHermesApi({ baseUrl: server.url, apiKey: "fixture-key" });
    await expect(api.health()).resolves.toMatchObject({ status: "ok" });
    await expect(api.capabilities()).resolves.toMatchObject({
      features: { run_submission: true, run_events_sse: true },
    });

    const started = await api.startRun({ input: "hello", sessionId: "fixture-session" });
    const events: unknown[] = [];
    await api.subscribeToRun(started.runId, (event) => events.push(event));

    expect(started).toMatchObject({ status: "started" });
    expect(events).toEqual([
      { event: "tool.started", run_id: started.runId, tool: "fixture", preview: "simulated" },
      { event: "message.delta", run_id: started.runId, delta: "Hello from fixture" },
      { event: "tool.completed", run_id: started.runId, tool: "fixture", duration: 0.01, error: false },
      { event: "run.completed", run_id: started.runId, output: "Hello from fixture" },
    ]);
  });

  it("exercises approval and stop responses", async () => {
    const api = createHermesApi({ baseUrl: server.url, apiKey: "fixture-key" });
    const approvalRun = await api.startRun({ input: "approval" });
    const approvalEvents: unknown[] = [];
    await api.subscribeToRun(approvalRun.runId, (event) => approvalEvents.push(event));
    expect(approvalEvents[0]).toMatchObject({ event: "approval.request" });

    await expect(
      api.respondToApproval(approvalRun.runId, { choice: "deny", resolveAll: true }),
    ).resolves.toMatchObject({ choice: "deny" });

    const stoppable = await api.startRun({ input: "cancel" });
    await expect(api.stopRun(stoppable.runId)).resolves.toMatchObject({
      run_id: stoppable.runId,
      status: "stopping",
    });
  });
});
