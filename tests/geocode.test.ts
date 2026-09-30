import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../src/app/api/geocode/route";

test("geocoding separates catalog fallback, no matches, provider success and unavailable states", { skip: !process.env.DATABASE_URL?.includes("auth-test.db") }, async () => {
  const originalFetch = globalThis.fetch;
  const originalEnabled = process.env.GEOCODER_ENABLED;
  const request = (q: string) => new Request(`http://127.0.0.1:3100/api/geocode?q=${encodeURIComponent(q)}`);
  try {
    process.env.GEOCODER_ENABLED = "0";
    let response = await GET(request("Gulshan-e-Iqbal"));
    let data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.status, "catalog_only");
    assert.ok(data.items.some((item: { district?: string; latitude: number | null }) => item.district === "East" && item.latitude === null));
    response = await GET(request("unknown-public-place-r3"));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "not_configured");

    process.env.GEOCODER_ENABLED = "1";
    globalThis.fetch = async () => Response.json([]);
    response = await GET(request("unknown-public-place-r3-no-match"));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "no_matches");

    await new Promise(resolve => setTimeout(resolve, 1150));
    globalThis.fetch = async () => Response.json([{ display_name: "Public QA landmark, Karachi", lat: "24.9000", lon: "67.1000" }]);
    response = await GET(request("public-qa-landmark-r3"));
    data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.status, "ok");
    assert.equal(data.items[0].latitude, 24.9);

    await new Promise(resolve => setTimeout(resolve, 1150));
    globalThis.fetch = async () => { throw new Error("Outbound access denied"); };
    response = await GET(request("unknown-public-place-r3-unavailable"));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "unavailable");
    response = await GET(request("plot 42 private home"));
    assert.equal(response.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnabled === undefined) delete process.env.GEOCODER_ENABLED;
    else process.env.GEOCODER_ENABLED = originalEnabled;
  }
});
