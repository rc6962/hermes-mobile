import type { HermesApiOptions } from "../hermes-api";
import type { RuntimeClient } from "./RuntimeClient";
import { createTermuxRuntimeClient } from "./termux-runtime-client";

/**
 * Runtime selection dispatcher (composition root helper).
 *
 * `createRuntimeClient` returns the active RuntimeClient for the chosen
 * runtime kind. Phase 0 supports only "termux"; "managed" fails closed
 * with a typed error until the embedded runtime exists.
 */
export type RuntimeKind = "termux" | "managed";

export interface ManagedRuntimeOptions {
  kind: "managed";
}

export type CreateRuntimeClientOptions =
  | ({ kind: "termux" } & HermesApiOptions)
  | ManagedRuntimeOptions;

export function createRuntimeClient(options: CreateRuntimeClientOptions): RuntimeClient {
  if (options.kind === "termux") {
    return createTermuxRuntimeClient(options);
  }
  throw new Error("Managed runtime is not available in this build (Phase 0)");
}
