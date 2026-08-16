import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBallsApi } from "../balls-api";
import {
  createFakeBallsServer,
  type FakeBallsServer,
} from "../../../tests/fixtures/fake-balls-server";

describe("fake Balls server fixture", () => {
  let server: FakeBallsServer;

  beforeEach(async () => {
    server = createFakeBallsServer({ apiKey: "fixture-key" });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it("serves authenticated health, capabilities, run creation, and chunked SSE", async () => {
    const api = createBallsApi({ baseUrl: server.url, apiKey: "fixture-key" });
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

  it("advertises and accepts an attachment-capable run contract", async () => {
    const api = createBallsApi({ baseUrl: server.url, apiKey: "fixture-key" });

    await expect(api.capabilities()).resolves.toMatchObject({
      features: {
        inline_image_input: true,
        local_document_ingestion: true,
      },
    });

    await expect(
      api.startRun({
        input: [
          { type: "text", text: "Review the selected items" },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64,AA==" } },
        ],
        attachmentIds: ["att_fixture_pdf_1"],
      }),
    ).resolves.toMatchObject({ status: "started" });
  });

  it("exercises approval and stop responses", async () => {
    const api = createBallsApi({ baseUrl: server.url, apiKey: "fixture-key" });
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
