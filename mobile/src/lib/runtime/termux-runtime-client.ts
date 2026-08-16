import { createHermesApi, type HermesApiOptions } from "../hermes-api";
import type { RuntimeClient } from "./RuntimeClient";

/**
 * TermuxRuntimeClient is the Termux-backed implementation of RuntimeClient.
 *
 * Phase 0: HermesApi is already structurally compatible with RuntimeClient,
 * so the wrapper is a factory that returns the authenticated HermesApi
 * instance typed as RuntimeClient — no behavioral change, no double layer.
 * A managed-runtime implementation (embedded Hermes) will be added in a
 * later phase behind the same interface.
 *
 * Credential policy: the client holds no credential state of its own; it
 * receives an already-configured HermesApiOptions (baseUrl + apiKey) from
 * the composition root. This keeps credentials out of the runtime layer.
 */
export function createTermuxRuntimeClient(options: HermesApiOptions): RuntimeClient {
  return createHermesApi(options) as RuntimeClient;
}
