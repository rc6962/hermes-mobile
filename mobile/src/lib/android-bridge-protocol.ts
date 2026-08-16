export const ANDROID_BRIDGE_PROTOCOL_VERSION = "0.1" as const;
export const ANDROID_BRIDGE_BASE_URL = "http://127.0.0.1:7070" as const;

export const ANDROID_BRIDGE_LIMITS = {
  maxHeaderLineBytes: 8 * 1024,
  maxHeaderCount: 64,
  maxRequestBodyBytes: 64 * 1024,
  maxResponseBytes: 512 * 1024,
  requestTimeoutMs: 5_000,
  maxNodes: 256,
  maxDepth: 16,
  maxNodeTextLength: 512,
  maxInputTextLength: 4_096,
  snapshotTtlMs: 60_000,
} as const;

export const ANDROID_BRIDGE_CAPABILITIES = [
  "bridge.status",
  "accessibility.status",
  "screen.read",
  "node.find",
  "node.tap",
  "input.type",
  "system.back",
  "system.home",
  "screen.capture",
] as const;

export type AndroidBridgeCapability = (typeof ANDROID_BRIDGE_CAPABILITIES)[number];

export type AndroidBridgeState = "ready" | "disabled" | "disconnected" | "stopping";

export const ANDROID_BRIDGE_ERROR_CODES = [
  "unauthorized",
  "unsupported_protocol",
  "malformed_request",
  "invalid_json",
  "field_required",
  "invalid_field",
  "headers_too_large",
  "request_body_too_large",
  "response_too_large",
  "request_timeout",
  "capability_disabled",
  "permission_denied",
  "service_disconnected",
  "snapshot_not_found",
  "node_stale",
  "node_not_found",
  "action_rejected",
  "text_too_long",
  "bridge_stopping",
  "bridge_error",
] as const;

export type AndroidBridgeErrorCode = (typeof ANDROID_BRIDGE_ERROR_CODES)[number];

export interface AndroidBridgeEnvelope<T> {
  protocol_version: typeof ANDROID_BRIDGE_PROTOCOL_VERSION;
  request_id: string;
  data: T;
}

export interface AndroidBridgeError {
  code: AndroidBridgeErrorCode;
  message: string;
}

export interface AndroidBridgeErrorEnvelope {
  protocol_version: typeof ANDROID_BRIDGE_PROTOCOL_VERSION;
  request_id: string;
  error: AndroidBridgeError;
}

export interface AndroidBridgeStatusData {
  bridge: AndroidBridgeState;
  service_connected: boolean;
  android_api_level: number;
  capabilities: AndroidBridgeCapability[];
  disabled_capabilities: AndroidBridgeCapability[];
}

export interface AndroidBridgeBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AndroidBridgeNode {
  node_id: string;
  parent_id: string | null;
  depth: number;
  class_name: string;
  bounds?: AndroidBridgeBounds;
  clickable: boolean;
  editable: boolean;
  enabled: boolean;
  visible: boolean;
  password: boolean;
  text?: string;
  text_truncated?: boolean;
}

export interface AndroidBridgeScreenData {
  snapshot_id: string;
  generated_at_ms: number;
  truncated: boolean;
  nodes: AndroidBridgeNode[];
}

export interface AndroidBridgeNodeFindRequest {
  snapshot_id: string;
  text?: string;
  class_name?: string;
  clickable?: boolean;
  editable?: boolean;
  limit?: number;
}

export interface AndroidBridgeNodeTapRequest {
  snapshot_id: string;
  node_id: string;
}

export interface AndroidBridgeTypeRequest {
  text: string;
}

export interface AndroidBridgeActionData {
  accepted: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function isCapability(value: unknown): value is AndroidBridgeCapability {
  return typeof value === "string" && (ANDROID_BRIDGE_CAPABILITIES as readonly string[]).includes(value);
}

function hasUniqueCapabilities(values: AndroidBridgeCapability[]): boolean {
  return new Set(values).size === values.length;
}

function isEnvelope<T>(
  value: unknown,
  dataGuard: (data: unknown) => data is T,
): value is AndroidBridgeEnvelope<T> {
  return (
    isRecord(value) &&
    value.protocol_version === ANDROID_BRIDGE_PROTOCOL_VERSION &&
    isRequestId(value.request_id) &&
    dataGuard(value.data)
  );
}

function isBounds(value: unknown): value is AndroidBridgeBounds {
  if (!isRecord(value)) {
    return false;
  }
  const { left, top, right, bottom } = value;
  return (
    isIntegerInRange(left, 0, Number.MAX_SAFE_INTEGER) &&
    isIntegerInRange(top, 0, Number.MAX_SAFE_INTEGER) &&
    isIntegerInRange(right, left, Number.MAX_SAFE_INTEGER) &&
    isIntegerInRange(bottom, top, Number.MAX_SAFE_INTEGER)
  );
}

function isNode(value: unknown): value is AndroidBridgeNode {
  if (!isRecord(value)) {
    return false;
  }
  if (
    !isBoundedString(value.node_id, 128) ||
    (value.parent_id !== null && !isBoundedString(value.parent_id, 128)) ||
    !isIntegerInRange(value.depth, 0, ANDROID_BRIDGE_LIMITS.maxDepth) ||
    !isBoundedString(value.class_name, 256) ||
    (value.bounds !== undefined && !isBounds(value.bounds)) ||
    typeof value.clickable !== "boolean" ||
    typeof value.editable !== "boolean" ||
    typeof value.enabled !== "boolean" ||
    typeof value.visible !== "boolean" ||
    typeof value.password !== "boolean"
  ) {
    return false;
  }

  if (value.password) {
    return value.text === undefined && value.text_truncated === undefined;
  }

  const hasText = value.text !== undefined;
  const hasValidText = !hasText || isBoundedString(value.text, ANDROID_BRIDGE_LIMITS.maxNodeTextLength);
  const truncated = value.text_truncated;
  return (
    hasValidText &&
    (truncated === undefined || typeof truncated === "boolean") &&
    (truncated !== true || (hasText && typeof value.text === "string" && value.text.length > 0))
  );
}

function isStatusData(value: unknown): value is AndroidBridgeStatusData {
  if (!isRecord(value)) {
    return false;
  }
  const capabilities = value.capabilities;
  const disabledCapabilities = value.disabled_capabilities;
  return (
    ["ready", "disabled", "disconnected", "stopping"].includes(String(value.bridge)) &&
    typeof value.service_connected === "boolean" &&
    isIntegerInRange(value.android_api_level, 1, 1_000) &&
    Array.isArray(capabilities) &&
    capabilities.every(isCapability) &&
    hasUniqueCapabilities(capabilities) &&
    Array.isArray(disabledCapabilities) &&
    disabledCapabilities.every(isCapability) &&
    hasUniqueCapabilities(disabledCapabilities) &&
    disabledCapabilities.every((capability) => !capabilities.includes(capability))
  );
}

function isScreenData(value: unknown): value is AndroidBridgeScreenData {
  if (
    !isRecord(value) ||
    !isBoundedString(value.snapshot_id, 128) ||
    !isIntegerInRange(value.generated_at_ms, 0, Number.MAX_SAFE_INTEGER) ||
    typeof value.truncated !== "boolean" ||
    !Array.isArray(value.nodes)
  ) {
    return false;
  }

  const nodes = value.nodes;
  if (
    nodes.length > ANDROID_BRIDGE_LIMITS.maxNodes ||
    !nodes.every(isNode)
  ) {
    return false;
  }

  const nodeIds = new Set(nodes.map((node) => node.node_id));
  if (
    nodeIds.size !== nodes.length ||
    !nodes.every((node) => node.parent_id === null || nodeIds.has(node.parent_id))
  ) {
    return false;
  }

  const byId = new Map(nodes.map((node) => [node.node_id, node]));
  for (const node of nodes) {
    if (node.parent_id !== null) {
      const parent = byId.get(node.parent_id);
      if (!parent || node.depth !== parent.depth + 1) {
        return false;
      }
    }
    const seen = new Set<string>();
    let current: AndroidBridgeNode | undefined = node;
    while (current?.parent_id !== null && current?.parent_id !== undefined) {
      if (seen.has(current.node_id)) {
        return false;
      }
      seen.add(current.node_id);
      current = byId.get(current.parent_id);
    }
  }
  return true;
}

export function isAndroidBridgeStatusResponse(
  value: unknown,
): value is AndroidBridgeEnvelope<AndroidBridgeStatusData> {
  return isEnvelope(value, isStatusData);
}

export function isAndroidBridgeScreenResponse(
  value: unknown,
): value is AndroidBridgeEnvelope<AndroidBridgeScreenData> {
  return isEnvelope(value, isScreenData);
}

export function isAndroidBridgeCapability(value: unknown): value is AndroidBridgeCapability {
  return isCapability(value);
}

export function isAndroidBridgeErrorCode(value: unknown): value is AndroidBridgeErrorCode {
  return typeof value === "string" && (ANDROID_BRIDGE_ERROR_CODES as readonly string[]).includes(value);
}

export function isAndroidBridgeErrorResponse(value: unknown): value is AndroidBridgeErrorEnvelope {
  if (!isRecord(value) || value.protocol_version !== ANDROID_BRIDGE_PROTOCOL_VERSION || !isRequestId(value.request_id)) {
    return false;
  }
  const error = value.error;
  return (
    isRecord(error) &&
    isAndroidBridgeErrorCode(error.code) &&
    isBoundedString(error.message, 512)
  );
}

export function isAndroidBridgeNodeFindRequest(value: unknown): value is AndroidBridgeNodeFindRequest {
  if (!isRecord(value) || !isBoundedString(value.snapshot_id, 128)) {
    return false;
  }
  return (
    (value.text === undefined || isBoundedString(value.text, ANDROID_BRIDGE_LIMITS.maxNodeTextLength)) &&
    (value.class_name === undefined || isBoundedString(value.class_name, 256)) &&
    (value.clickable === undefined || typeof value.clickable === "boolean") &&
    (value.editable === undefined || typeof value.editable === "boolean") &&
    (value.limit === undefined || isIntegerInRange(value.limit, 1, 64))
  );
}

export function isAndroidBridgeNodeTapRequest(value: unknown): value is AndroidBridgeNodeTapRequest {
  return (
    isRecord(value) &&
    isBoundedString(value.snapshot_id, 128) &&
    isBoundedString(value.node_id, 128)
  );
}

export function isAndroidBridgeTypeRequest(value: unknown): value is AndroidBridgeTypeRequest {
  return (
    isRecord(value) &&
    typeof value.text === "string" &&
    value.text.length > 0 &&
    value.text.length <= ANDROID_BRIDGE_LIMITS.maxInputTextLength
  );
}

export function isAndroidBridgeActionResponse(
  value: unknown,
): value is AndroidBridgeEnvelope<AndroidBridgeActionData> {
  return isEnvelope(
    value,
    (data): data is AndroidBridgeActionData =>
      isRecord(data) && typeof data.accepted === "boolean",
  );
}
