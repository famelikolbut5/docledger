import test from "node:test";
import assert from "node:assert/strict";
const base = process.env.API_BASE_URL || "http://127.0.0.1:8000";
async function request(path, method = "GET", body) {
  const res = await fetch(base + "/api" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test("create, search and transactional status history", async () => {
  const title = "Integration check " + crypto.randomUUID();
  const created = await request("/documents", "POST", {
    title,
    type: "contract",
    section: "client",
    counterparty: "Example team",
    date: "2026-10-06",
    amount_minor: 125075,
    responsible: "Test manager",
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.amount_minor, 125075);
  const id = created.body.id;
  const found = await request("/documents?search=" + encodeURIComponent(title));
  assert.equal(found.body.length, 1);
  assert.equal(found.body[0].id, id);
  await request("/documents/" + id, "PATCH", { status: "review" });
  const repeated = await request("/documents/" + id, "PATCH", {
    status: "review",
  });
  assert.equal(repeated.status, 200);
  const events = await request("/documents/" + id + "/events");
  assert.equal(events.body.length, 2, "same status must not duplicate history");
  assert.match(events.body[0].description, /На согласовании/);
  const reread = await request(
    "/documents?search=" + encodeURIComponent(title),
  );
  assert.equal(reread.body[0].status, "review");
  await request("/documents/" + id, "PATCH", { status: "archived" });
  assert.equal(
    (await request("/documents?search=" + encodeURIComponent(title))).body[0]
      .status,
    "archived",
  );
});
test("validation rejects impossible dates, malformed ids and invalid amounts", async () => {
  const payload = {
    title: "Invalid document",
    type: "contract",
    section: "client",
    counterparty: "Example team",
    date: "2026-02-30",
    amount_minor: 100,
    responsible: "Test manager",
  };
  assert.equal((await request("/documents", "POST", payload)).status, 400);
  assert.equal(
    (
      await request("/documents", "POST", {
        ...payload,
        date: "2026-10-06",
        amount_minor: -1,
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/documents/not-a-uuid", "PATCH", { status: "signed" }))
      .status,
    400,
  );
  assert.equal(
    (
      await request(
        "/documents/99999999-0000-4000-8000-000000000001",
        "PATCH",
        { status: "signed" },
      )
    ).status,
    404,
  );
});
test("CSV contains saved values and protects spreadsheet formula cells", async () => {
  const title = "=SUM(1;2)";
  const created = await request("/documents", "POST", {
    title,
    type: "invoice",
    section: "internal",
    counterparty: "Example team",
    date: "2026-10-06",
    amount_minor: 125075,
    responsible: "Test manager",
  });
  assert.equal(created.status, 201);
  const res = await fetch(base + "/api/documents/export");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/csv/);
  const csv = await res.text();
  assert.match(csv, /Номер.*Название/);
  assert.ok(csv.includes(`"'=SUM(1;2)"`));
  assert.ok(csv.includes('"1250.75"'));
});
