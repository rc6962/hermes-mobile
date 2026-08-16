import { describe, expect, it } from "vitest";

import {
  ANDROID_BRIDGE_CAPABILITIES,
  ANDROID_BRIDGE_LIMITS,
  isAndroidBridgeActionResponse,
  isAndroidBridgeErrorResponse,
  isAndroidBridgeNodeFindRequest,
  isAndroidBridgeNodeTapRequest,
  isAndroidBridgeScreenResponse,
  isAndroidBridgeStatusResponse,
  isAndroidBridgeTypeRequest,
} from "../android-bridge-protocol";

const requestId = "req_protocol_test";

function statusResponse(overrides: Record<string, unknown> = {}) {
  return {
    protocol_version: "0.1",
    request_id: requestId,
    data: {
      bridge: "ready",
      service_connected: true,
      android_api_level: 36,
      capabilities: ["bridge.status", "accessibility.status", "screen.read"],
      disabled_capabilities: ["screen.capture"],
      ...overrides,
    },
  };
}

function screenResponse(nodes: unknown[]) {
  return {
    protocol_version: "0.1",
    request_id: requestId,
    data: {
      snapshot_id: "snap_protocol_test",
      generated_at_ms: 1_730_000_000_000,
      truncated: false,
      nodes,
    },
  };
}

const normalNode = {
  node_id: "node_continue",
  parent_id: null,
  depth: 0,
  class_name: "android.widget.Button",
  bounds: { left: 0, top: 120, right: 480, bottom: 200 },
  clickable: true,
  editable: false,
  enabled: true,
  visible: true,
  password: false,
  text: "Continue",
  text_truncated: false,
};

describe("Android bridge protocol", () => {
  it("accepts a versioned status response with known capabilities", () => {
    expect(isAndroidBridgeStatusResponse(statusResponse())).toBe(true);
    expect(ANDROID_BRIDGE_CAPABILITIES).toContain("screen.read");
    expect(ANDROID_BRIDGE_LIMITS.maxNodes).toBe(256);
  });

  it("rejects unsupported versions, unknown capabilities, and duplicate capabilities", () => {
    expect(
      isAndroidBridgeStatusResponse({
        ...statusResponse(),
        protocol_version: "0.2",
      }),
    ).toBe(false);
    expect(
      isAndroidBridgeStatusResponse(
        statusResponse({ capabilities: ["bridge.status", "unknown.capability"] }),
      ),
    ).toBe(false);
    expect(
      isAndroidBridgeStatusResponse(
        statusResponse({ capabilities: ["bridge.status", "bridge.status"] }),
      ),
    ).toBe(false);
    expect(
      isAndroidBridgeStatusResponse(
        statusResponse({
          capabilities: ["screen.capture"],
          disabled_capabilities: ["screen.capture"],
        }),
      ),
    ).toBe(false);
  });

  it("accepts bounded snapshots and requires password text to be omitted", () => {
    expect(
      isAndroidBridgeScreenResponse(
        screenResponse([
          normalNode,
          {
            ...normalNode,
            node_id: "node_password",
            class_name: "android.widget.EditText",
            editable: true,
            password: true,
            text: undefined,
            text_truncated: undefined,
          },
        ]),
      ),
    ).toBe(true);
  });

  it("rejects password text, oversized text, invalid bounds, and excessive depth", () => {
    expect(
      isAndroidBridgeScreenResponse(
        screenResponse([{ ...normalNode, password: true, text: "must not cross the bridge" }]),
      ),
    ).toBe(false);
    expect(
      isAndroidBridgeScreenResponse(
        screenResponse([{ ...normalNode, text: "x".repeat(ANDROID_BRIDGE_LIMITS.maxNodeTextLength + 1) }]),
      ),
    ).toBe(false);
    expect(
      isAndroidBridgeScreenResponse(
        screenResponse([{ ...normalNode, bounds: { left: 20, top: 0, right: 10, bottom: 20 } }]),
      ),
    ).toBe(false);
    expect(
      isAndroidBridgeScreenResponse(
        screenResponse([{ ...normalNode, depth: ANDROID_BRIDGE_LIMITS.maxDepth + 1 }]),
      ),
    ).toBe(false);
    expect(
      isAndroidBridgeScreenResponse(
        screenResponse(Array.from({ length: ANDROID_BRIDGE_LIMITS.maxNodes + 1 }, (_, index) => ({
          ...normalNode,
          node_id: `node_${index}`,
        }))),
      ),
    ).toBe(false);
    expect(
      isAndroidBridgeScreenResponse(
        screenResponse([
          normalNode,
          { ...normalNode, node_id: "node_continue", parent_id: "missing_node" },
        ]),
      ),
    ).toBe(false);
    expect(
      isAndroidBridgeScreenResponse(
        screenResponse([
          normalNode,
          { ...normalNode, node_id: "node_child", parent_id: "missing_node" },
        ]),
      ),
    ).toBe(false);
    expect(
      isAndroidBridgeScreenResponse(
        screenResponse([{ ...normalNode, text: undefined, text_truncated: true }]),
      ),
    ).toBe(false);
    expect(
      isAndroidBridgeScreenResponse(
        screenResponse([{ ...normalNode, text: "", text_truncated: false }]),
      ),
    ).toBe(false);
    expect(
      isAndroidBridgeScreenResponse(
        screenResponse([
          normalNode,
          { ...normalNode, node_id: "node_child", parent_id: normalNode.node_id, depth: 3 },
        ]),
      ),
    ).toBe(false);
    expect(
      isAndroidBridgeScreenResponse(
        screenResponse([
          { ...normalNode, node_id: "node_a", parent_id: "node_b", depth: 1 },
          { ...normalNode, node_id: "node_b", parent_id: "node_a", depth: 1 },
        ]),
      ),
    ).toBe(false);
  });

  it("validates node search, tap, and focused text requests", () => {
    expect(
      isAndroidBridgeNodeFindRequest({
        snapshot_id: "snap_protocol_test",
        text: "Continue",
        clickable: true,
        limit: 8,
      }),
    ).toBe(true);
    expect(isAndroidBridgeNodeFindRequest({ snapshot_id: "snap_protocol_test", limit: 0 })).toBe(false);
    expect(
      isAndroidBridgeNodeFindRequest({
        snapshot_id: "snap_protocol_test",
        text: "x".repeat(ANDROID_BRIDGE_LIMITS.maxNodeTextLength + 1),
      }),
    ).toBe(false);
    expect(
      isAndroidBridgeNodeTapRequest({ snapshot_id: "snap_protocol_test", node_id: "node_continue" }),
    ).toBe(true);
    expect(isAndroidBridgeNodeTapRequest({ snapshot_id: "snap_protocol_test" })).toBe(false);
    expect(isAndroidBridgeTypeRequest({ text: "hello" })).toBe(true);
    expect(
      isAndroidBridgeTypeRequest({ text: "x".repeat(ANDROID_BRIDGE_LIMITS.maxInputTextLength + 1) }),
    ).toBe(false);
  });

  it("accepts safe known errors and action envelopes only", () => {
    expect(
      isAndroidBridgeErrorResponse({
        protocol_version: "0.1",
        request_id: requestId,
        error: { code: "permission_denied", message: "Accessibility service is disabled" },
      }),
    ).toBe(true);
    expect(
      isAndroidBridgeErrorResponse({
        protocol_version: "0.1",
        request_id: requestId,
        error: { code: "secret_internal_code", message: "not a stable protocol error" },
      }),
    ).toBe(false);
    expect(
      isAndroidBridgeActionResponse({
        protocol_version: "0.1",
        request_id: requestId,
        data: { accepted: true },
      }),
    ).toBe(true);
    expect(
      isAndroidBridgeActionResponse({
        protocol_version: "0.1",
        request_id: requestId,
        data: { accepted: "yes" },
      }),
    ).toBe(false);
  });
});
