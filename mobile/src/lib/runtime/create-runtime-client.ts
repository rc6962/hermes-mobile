import type { BallsApiOptions } from "../balls-api";
import type { RuntimeClient } from "./RuntimeClient";
import { createTermuxRuntimeClient } from "./termux-runtime-client";
import { createManagedRuntimeClient } from "./managed-runtime-client";

/**
 * Runtime selection dispatcher (composition root helper).
 *
 * `createRuntimeClient` returns the active RuntimeClient for the chosen
 * runtime kind: "termux" (existing Balls gateway in Termux) or "managed"
 * (embedded Balls via Chaquopy, spike M3).
 */
export type RuntimeKind = "termux" | "managed";

export interface ManagedRuntimeOptions {
  kind: "managed";
  apiKey: string;
  baseUrl?: string;
}

export type CreateRuntimeClientOptions =
  | ({ kind: "termux" } & BallsApiOptions)
  | ManagedRuntimeOptions;

export function createRuntimeClient(options: CreateRuntimeClientOptions): RuntimeClient {
  if (options.kind === "termux") {
    return createTermuxRuntimeClient(options);
  }
  return createManagedRuntimeClient({ apiKey: options.apiKey, baseUrl: options.baseUrl });
}
