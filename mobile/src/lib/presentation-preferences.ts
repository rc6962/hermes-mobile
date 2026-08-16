export type AppTheme = "soft-haven" | "gentle-command";

export interface PresentationPreferences {
  theme: AppTheme;
  showActivityConsoleOnChat: boolean;
}

const storageKey = "balls.presentation-preferences.v1";

export const defaultPresentationPreferences: PresentationPreferences = {
  theme: "soft-haven",
  showActivityConsoleOnChat: false,
};

function isPresentationPreferences(value: unknown): value is PresentationPreferences {
  if (!value || typeof value !== "object") return false;
  const preferences = value as Record<string, unknown>;
  return (
    (preferences.theme === "soft-haven" || preferences.theme === "gentle-command") &&
    typeof preferences.showActivityConsoleOnChat === "boolean"
  );
}

export function loadPresentationPreferences(): PresentationPreferences {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaultPresentationPreferences;
    const parsed: unknown = JSON.parse(raw);
    return isPresentationPreferences(parsed) ? parsed : defaultPresentationPreferences;
  } catch {
    return defaultPresentationPreferences;
  }
}

export function savePresentationPreferences(preferences: PresentationPreferences): void {
  window.localStorage.setItem(storageKey, JSON.stringify(preferences));
}
