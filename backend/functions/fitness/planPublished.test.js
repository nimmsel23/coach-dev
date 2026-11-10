const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldNotifyPlanPublished, planPushContent } = require("./planPublished.js");

test("push only for a newly published coach plan", () => {
  const pub = { status: "published", publishedAt: "t1", coachUid: "coach" };
  assert.equal(shouldNotifyPlanPublished("client", undefined, pub), true);
  assert.equal(shouldNotifyPlanPublished("client", { ...pub, status: "draft", publishedAt: undefined }, pub), true);
  assert.equal(shouldNotifyPlanPublished("client", pub, { ...pub, description: "neu" }), false);
  assert.equal(shouldNotifyPlanPublished("client", pub, { ...pub, publishedAt: "t2" }), true);
  assert.equal(shouldNotifyPlanPublished("client", undefined, { ...pub, status: "draft" }), false);
  assert.equal(shouldNotifyPlanPublished("coach", undefined, pub), false);
  assert.equal(shouldNotifyPlanPublished("client", pub, undefined), false);
  assert.equal(shouldNotifyPlanPublished("client", undefined, { ...pub, coachUid: undefined }), false);
});

test("push only for a newer publishedAt", () => {
  const pub = { status: "published", publishedAt: "2026-10-22T10:00:00.000Z", coachUid: "coach" };
  assert.equal(shouldNotifyPlanPublished("client", pub, { ...pub, publishedAt: "2026-10-22T09:00:00.000Z" }), false);
  assert.equal(shouldNotifyPlanPublished("client", pub, { ...pub, publishedAt: "2026-10-22T11:00:00.000Z" }), true);
});

test("push text uses published name and version", () => {
  assert.deepEqual(planPushContent({ name: "Arbeitsname", published: { name: "PPL" }, headVersion: 1 }), {
    type: "planPublished",
    vars: { plan: "PPL" },
  });
  assert.deepEqual(planPushContent({ name: "PPL" }), { type: "planPublished", vars: { plan: "PPL" } });
  assert.deepEqual(
    planPushContent({ name: "X", published: { name: "PPL" }, headVersion: 3, headMessage: "Beine ergänzt" }),
    { type: "planUpdated", vars: { plan: "PPL", detail: "v3: Beine ergänzt" } },
  );
  assert.deepEqual(planPushContent({ name: "PPL", headVersion: 2 }).vars.detail, "v2");
});
