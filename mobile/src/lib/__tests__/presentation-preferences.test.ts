import { afterEach, describe, expect, it } from "vitest";

import {
  defaultPresentationPreferences,
  loadPresentationPreferences,
  savePresentationPreferences,
} from "../presentation-preferences";

const storageKey = "balls.presentation-preferences.v1";

describe("presentation preferences", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns the first-run defaults when nothing has been saved", () => {
    expect(loadPresentationPreferences()).toEqual(defaultPresentationPreferences);
  });

  it("persists a selected theme and activity-console preference", () => {
    savePresentationPreferences({
      theme: "gentle-command",
      showActivityConsoleOnChat: true,
    });

    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? "null")).toEqual({
      theme: "gentle-command",
      showActivityConsoleOnChat: true,
    });
    expect(loadPresentationPreferences()).toEqual({
      theme: "gentle-command",
      showActivityConsoleOnChat: true,
    });
  });

  it("falls back safely when stored data is malformed or unsupported", () => {
    window.localStorage.setItem(storageKey, JSON.stringify({ theme: "neon", showActivityConsoleOnChat: "yes" }));

    expect(loadPresentationPreferences()).toEqual(defaultPresentationPreferences);
  });
});
