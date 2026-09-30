import assert from "node:assert/strict";
import { test } from "node:test";
import { brand } from "../src/lib/brand";

test("public homepage presents the new identity and keeps existing citizen routes", { skip: !process.env.AUTH_TEST_BASE_URL }, async () => {
  const base = process.env.AUTH_TEST_BASE_URL!;
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes(brand.name));
  assert.ok(html.includes(brand.activeCityName));
  assert.ok(html.includes(brand.tagline));
  for (const route of ["/report", "/track", "/map", "/projects", "/funds", "/help", "/login"]) {
    assert.ok(html.includes(`href="${route}"`), `Missing existing route ${route}`);
  }
  assert.ok(html.includes("Our first active city"));
  assert.ok(!html.includes("Karachi Fix"));
});
