import { describe, expect, it } from "vitest";

import {
  DISCOVER_CATEGORIES,
  DISCOVER_TEMPLATES,
  filterDiscoverTemplates,
} from "./discover-fixtures";

describe("discover fixtures", () => {
  it("keeps every template inside a known category with non-empty copy", () => {
    expect(DISCOVER_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    for (const template of DISCOVER_TEMPLATES) {
      expect(DISCOVER_CATEGORIES.slice(1)).toContain(template.category);
      expect(template.title.trim().length).toBeGreaterThan(0);
      expect(template.description.trim().length).toBeGreaterThan(0);
      expect(template.requestText.trim().length).toBeGreaterThan(0);
    }
    const ids = DISCOVER_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shows every template under Recommended and only matching ones per category", () => {
    expect(filterDiscoverTemplates("Recommended", "")).toHaveLength(DISCOVER_TEMPLATES.length);

    const engineering = filterDiscoverTemplates("Engineering", "");
    expect(engineering.length).toBeGreaterThan(0);
    for (const template of engineering) {
      expect(template.category).toBe("Engineering");
    }
  });

  it("filters by case-insensitive title and description search", () => {
    const byTitle = filterDiscoverTemplates("Recommended", "CHANGELOG");
    expect(byTitle.map((template) => template.id)).toContain("write-changelog");

    const byDescription = filterDiscoverTemplates("Recommended", "release notes");
    expect(byDescription.map((template) => template.id)).toContain("write-changelog");

    expect(filterDiscoverTemplates("Recommended", "zzz-no-match")).toHaveLength(0);
  });

  it("combines the category and query filters", () => {
    // "launch" matches both a Product and a Marketing template.
    expect(filterDiscoverTemplates("Recommended", "launch").length).toBeGreaterThanOrEqual(2);
    const onlyProduct = filterDiscoverTemplates("Product", "launch");
    expect(onlyProduct).toHaveLength(1);
    expect(onlyProduct[0]?.id).toBe("launch-plan");
  });
});
