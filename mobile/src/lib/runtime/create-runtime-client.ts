import type { HermesApiOptions } from "../hermes-api";
import type { RuntimeClient } from "./RuntimeClient";
import { createTermuxRuntimeClient } from "./termux-runtime-client";
import { createManagedRuntimeClient } from "./managed-runtime-client";

/**
 * Runtime selection dispatcher (composition root helper).
 *
 * `createRuntimeClient` returns the active RuntimeClient for the chosen
 * runtime kind: "termux" (existing Hermes gateway in Termux) or "managed"
 * (embedded Hermes via Chaquopy, spike M3).
 */
export type RuntimeKind = "termux" | "managed";

export interface ManagedRuntimeOptions {
  kind: "managed";
  apiKey: string;
  baseUrl?: string;
}

export type CreateRuntimeClientOptions =
  | ({ kind: "termux" } & HermesApiOptions)
  | ManagedRuntimeOptions;

export function createRuntimeClient(options: CreateRuntimeClientOptions): RuntimeClient {
  if (options.kind === "termux") {
    return createTermuxRuntimeClient(options);
  }
  return createManagedRuntimeClient({ apiKey: options.apiKey, baseUrl: options.baseUrl });
}
