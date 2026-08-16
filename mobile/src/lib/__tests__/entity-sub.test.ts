import { describe, expect, it } from "vitest";

import {
  restoreEntities,
  substituteEntities,
  type EntitySubstitutionOptions,
} from "../entity-sub";

function scrub(text: string, options?: EntitySubstitutionOptions) {
  return substituteEntities(text, { seed: 42, ...options });
}

describe("entity-sub", () => {
  it("scrambles emails, phones, SSNs and cards, and restores them", () => {
    const input =
      "Call me at 555-123-4567 or alice@example.com. SSN 123-45-6789, card 4111 1111 1111 1111.";
    const { scrubbed, map } = scrub(input);
    expect(scrubbed).not.toContain("555-123-4567");
    expect(scrubbed).not.toContain("alice@example.com");
    expect(scrubbed).not.toContain("123-45-6789");
    expect(scrubbed).not.toContain("4111 1111 1111 1111");
    expect(map.size).toBeGreaterThanOrEqual(4);
    const restored = restoreEntities(scrubbed, map);
    expect(restored).toContain("alice@example.com");
    expect(restored).toContain("555-123-4567");
  });

  it("scrambles blocklist terms and identity names", () => {
    const { scrubbed, map } = scrub(
      "Gary Redic called about the invoice.",
      { blocklist: ["Gary Redic"], identityNames: [] },
    );
    expect(scrubbed).not.toContain("Gary Redic");
    expect(scrubbed).toContain("called about the invoice");
    expect(map.size).toBe(1);
    expect(restoreEntities(scrubbed, map)).toContain("Gary Redic");
  });

  it("leaves plain text intact when nothing matches", () => {
    const { scrubbed, map } = scrub("The weather is nice today.");
    expect(scrubbed).toBe("The weather is nice today.");
    expect(map.size).toBe(0);
  });

  it("produces opaque 5-char tokens from the safe alphabet", () => {
    const { scrubbed } = scrub("me@example.com");
    const token = scrubbed.trim();
    expect(token).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
  });

  it("can disable the pattern pass", () => {
    const { scrubbed } = scrub("mail me@example.com", { patterns: false });
    expect(scrubbed).toContain("me@example.com");
  });
});
