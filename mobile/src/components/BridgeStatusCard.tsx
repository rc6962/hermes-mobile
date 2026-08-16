import type { AndroidBridgeStatus } from "../lib/android-bridge";

interface BridgeStatusCardProps {
  status?: AndroidBridgeStatus;
  loading: boolean;
  error?: string;
  onRefresh: () => Promise<void>;
  onOpenSettings: () => Promise<void>;
}

function headingFor(status: AndroidBridgeStatus | undefined, loading: boolean): string {
  if (loading || !status) {
    return "Checking phone bridge";
  }
  if (!status.platformAvailable) {
    return "Android bridge unavailable";
  }
  if (status.bridge === "ready") {
    return "Phone bridge ready";
  }
  if (status.accessibilityEnabled) {
    return "Accessibility reconnecting";
  }
  return "Phone bridge disabled";
}

function detailFor(status: AndroidBridgeStatus | undefined, loading: boolean): string {
  if (loading || !status) {
    return "Reading local Android capability state.";
  }
  if (!status.platformAvailable) {
    return "Phone-control capabilities are available in the installed Android app.";
  }
  if (!status.accessibilityEnabled) {
    return "Accessibility service is disabled. Enable it explicitly before using phone controls.";
  }
  if (!status.serviceConnected) {
    return "Accessibility is enabled, but the service is not connected yet. Refresh after returning from Android settings.";
  }
  return `Connected on Android API ${status.androidApiLevel}. Only explicitly enabled capabilities are available.`;
}

export function BridgeStatusCard({
  status,
  loading,
  error,
  onRefresh,
  onOpenSettings,
}: BridgeStatusCardProps) {
  return (
    <section className="bridge-status-card" aria-label="Phone bridge status">
      <div className="bridge-status-card__header">
        <div>
          <p className="eyebrow">ANDROID CAPABILITY BRIDGE</p>
          <h2>{headingFor(status, loading)}</h2>
        </div>
        <span className="bridge-status-card__state">{status?.bridge ?? "checking"}</span>
      </div>
      <p>{detailFor(status, loading)}</p>
      {error ? <p className="bridge-status-card__error" role="alert">{error}</p> : null}
      <div className="bridge-status-card__actions">
        {status?.platformAvailable && !status.accessibilityEnabled ? (
          <button type="button" onClick={() => void onOpenSettings()}>
            Open Accessibility settings
          </button>
        ) : null}
        <button type="button" className="bridge-status-card__refresh" onClick={() => void onRefresh()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh bridge status"}
        </button>
      </div>
    </section>
  );
}
