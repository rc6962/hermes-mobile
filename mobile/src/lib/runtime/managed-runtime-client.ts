import { createHermesApi, type HermesApiOptions } from "../hermes-api";
import type { RuntimeClient } from "./RuntimeClient";
import { startManagedRuntime } from "./managed-runtime";

/**
 * ManagedRuntimeClient is the embedded-runtime implementation of
 * RuntimeClient. The embedded Hermes API server binds the same loopback
 * URL/port as Termux mode (127.0.0.1:8642), so the HTTP contract is
 * identical; the difference is lifecycle: the native service owns the
 * process instead of Termux.
 *
 * Lifecycle policy for the spike: start() is called lazily by the UI
 * before first use (runtime switcher); health() reports the server state.
 */
export function createManagedRuntimeClient(
  options: Omit<HermesApiOptions, "baseUrl"> & { baseUrl?: string },
): RuntimeClient {
  const api = createHermesApi({
    baseUrl: options.baseUrl ?? "http://127.0.0.1:8642",
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
    nativeHttpImpl: options.nativeHttpImpl,
    nativeStreamImpl: options.nativeStreamImpl,
  });

  return {
    ...api,
    async health() {
      const status = await api.health();
      return status;
    },
    async startRuntime() {
      const result = await startManagedRuntime();
      if (!result.started) {
        throw new Error(result.error ?? "Managed runtime failed to start");
      }
      return { started: true };
    },
  };
}
