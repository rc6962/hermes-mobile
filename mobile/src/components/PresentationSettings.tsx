import { useState } from "react";

import { RuntimeSettings } from "./RuntimeSettings";
import type { RuntimeKind } from "../lib/runtime/create-runtime-client";

import type { PresentationPreferences } from "../lib/presentation-preferences";

export interface PresentationSettingsProps {
  preferences: PresentationPreferences;
  onChange: (preferences: PresentationPreferences) => void;
  runtimeKind: RuntimeKind;
  onRuntimeKindChange: (kind: RuntimeKind) => void;
}

export function PresentationSettings({
  preferences,
  onChange,
  runtimeKind,
  onRuntimeKindChange,
}: PresentationSettingsProps) {
  const [open, setOpen] = useState(false);

  const selectTheme = (theme: PresentationPreferences["theme"]) => {
    onChange({ ...preferences, theme });
  };

  const toggleActivityConsole = () => {
    onChange({
      ...preferences,
      showActivityConsoleOnChat: !preferences.showActivityConsoleOnChat,
    });
  };

  return (
    <>
      <button
        type="button"
        className="app-header__settings"
        aria-label="Open settings"
        onClick={() => setOpen(true)}
      >
        Settings
      </button>
      {open ? (
        <div className="presentation-settings__backdrop" onMouseDown={() => setOpen(false)}>
          <section
            className="presentation-settings"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="presentation-settings__header">
              <div>
                <p className="eyebrow">WORKSPACE</p>
                <h2>Settings</h2>
              </div>
              <button type="button" className="presentation-settings__close" onClick={() => setOpen(false)}>
                Close
              </button>
            </header>

            <section className="presentation-settings__section" aria-labelledby="appearance-settings-heading">
              <h3 id="appearance-settings-heading">Appearance</h3>
              <p>Choose the workspace feel. This only changes how Hermes Mobile looks.</p>
              <div className="presentation-settings__themes" role="group" aria-label="Theme">
                <button
                  type="button"
                  aria-pressed={preferences.theme === "soft-haven"}
                  className={preferences.theme === "soft-haven" ? "is-selected" : undefined}
                  onClick={() => selectTheme("soft-haven")}
                >
                  Soft Haven
                </button>
                <button
                  type="button"
                  aria-pressed={preferences.theme === "gentle-command"}
                  className={preferences.theme === "gentle-command" ? "is-selected" : undefined}
                  onClick={() => selectTheme("gentle-command")}
                >
                  Gentle Command
                </button>
              </div>
            </section>

            <section className="presentation-settings__section">
              <div className="presentation-settings__row">
                <div>
                  <h3>Activity console</h3>
                  <p>Show a collapsible, safe activity panel in chat.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="Show activity console in chat"
                  aria-checked={preferences.showActivityConsoleOnChat}
                  className={preferences.showActivityConsoleOnChat ? "presentation-settings__switch is-on" : "presentation-settings__switch"}
                  onClick={toggleActivityConsole}
                >
                  <span aria-hidden="true" />
                </button>
              </div>
            </section>

            <section className="presentation-settings__section presentation-settings__coming-soon">
              <h3>More controls are next</h3>
              <p>Model, provider, runtime, privacy, and Advanced Hermes settings will appear here in subsequent slices.</p>
            </section>
            <section className="presentation-settings__section">
              <RuntimeSettings kind={runtimeKind} onKindChange={onRuntimeKindChange} />
            </section>
          </section>
        </div>
      ) : null}
    </>
  );
}
