/**
 * Podule Registry — entitlement + status + resolver (serving-privacy decision
 * doc, "Podule Registry" + "Resolver order" sections).
 *
 * Podules: balls-cloud-core (free, default), balls-cloud-premium (Whole
 * Balls), balls-phone (Whole Balls). Local Podule (on-device model) is a
 * separate installation concern resolved before any egress.
 */

export type PoduleId = "balls-cloud-core" | "balls-cloud-premium" | "balls-phone";
export type PoduleKind = "cloud" | "phone";
export type PoduleStatus = "locked" | "available" | "installed" | "downloading";
export type Entitlement = "balls-deep" | "whole-balls";

export interface Podule {
  id: PoduleId;
  kind: PoduleKind;
  status: PoduleStatus;
  entitlement: Entitlement;
  /** Model ID sent to the Epic endpoint (server routes on this). */
  modelId: string;
}

export interface PoduleRegistryState {
  entitlement: Entitlement;
  localPoduleInstalled: boolean;
  cloudUnreachable: boolean;
  freeQuota: { used: number; limit: number; resetsUtc: string };
}

export const DEFAULT_PODULES: Podule[] = [
  {
    id: "balls-cloud-core",
    kind: "cloud",
    status: "available",
    entitlement: "balls-deep",
    modelId: "deepseek-v4-flash",
  },
  {
    id: "balls-cloud-premium",
    kind: "cloud",
    status: "locked",
    entitlement: "whole-balls",
    modelId: "qwen3-8b-q8",
  },
  {
    id: "balls-phone",
    kind: "phone",
    status: "locked",
    entitlement: "whole-balls",
    modelId: "balls-phone-voice",
  },
];

export type ResolvedRoute =
  | { kind: "local"; modelId: string }
  | { kind: "cloud"; poduleId: PoduleId; modelId: string; endpoint: string }
  | { kind: "blocked"; reason: "quota" | "unreachable" | "not-entitled" };

export const CLOUD_ENDPOINT = "https://balls.epictechs.net/v1";

export function resolveRoute(
  pods: Podule[],
  state: PoduleRegistryState,
): ResolvedRoute {
  // 1. Local Podule wins: entitled AND installed → zero egress.
  if (state.localPoduleInstalled) {
    return { kind: "local", modelId: "gemma-4-e2b-4b" };
  }
  // 2. Default: cloud core (or premium when entitled — entitlement unlocks it).
  const core = pods.find((p) => p.id === "balls-cloud-core");
  const premium = pods.find((p) => p.id === "balls-cloud-premium");
  const entitledCloud =
    state.entitlement === "whole-balls" && premium ? premium : core;
  if (!entitledCloud) {
    return { kind: "blocked", reason: "not-entitled" };
  }
  // Entitlement unlocks premium; locked status only gates below Whole Balls.
  if (state.entitlement !== "whole-balls" && entitledCloud.status === "locked") {
    return { kind: "blocked", reason: "not-entitled" };
  }
  if (state.cloudUnreachable) {
    return { kind: "blocked", reason: "unreachable" };
  }
  if (state.entitlement === "balls-deep" && state.freeQuota.used >= state.freeQuota.limit) {
    return { kind: "blocked", reason: "quota" };
  }
  return {
    kind: "cloud",
    poduleId: entitledCloud.id,
    modelId: entitledCloud.modelId,
    endpoint: CLOUD_ENDPOINT,
  };
}

/** Friendly error copy per the decision doc — Balls voice: low-key adult
 * humor, funny, never raunchy. */
export function blockedCopy(reason: "quota" | "unreachable" | "not-entitled"): string {
  switch (reason) {
    case "quota":
      return "That's your daily Balls allowance, spent. Whole Balls = unlimited rounds.";
    case "unreachable":
      return "Balls is out of range. Install the Local Podule (Whole Balls) and keep talking anywhere.";
    case "not-entitled":
      return "That one's Whole Balls territory.";
    default:
      return "Balls is having a moment.";
  }
}
