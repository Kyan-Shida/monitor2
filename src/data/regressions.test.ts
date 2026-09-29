import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run } from "./engine";
import { persist, migrate } from "./store";

test("state survives persistence and old schema migration", () => {
  let saved = "";
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { setItem: (_k: string, v: string) => { saved = v; } } });
  const s = seed(); s.roleId = "user";
  persist(s);
  assert.equal(migrate(JSON.parse(saved))!.roleId, "user");
  for (const schema of [1, 2, 3, 4, 5]) {
    assert.equal(migrate({ ...s, schema })!.schema, 6);
    assert.equal(migrate({ ...s, schema })!.roleId, "user");
  }
});
test("busy robot rejects outdated-map formal dispatch", () => {
  const s = seed(); s.robots.find(r => r.id === "R01")!.mapVersion = 2;
  for (const type of ["ENQUEUE", "DISPATCH_NOW"]) assert.throws(() => run(s, { type, id: "T010", robotId: "R01" }), /版本待同步/);
});
test("finish starts next accepted task, but respects head constraints", () => {
  let s = run(seed(), { type: "ENQUEUE", id: "T010", robotId: "R01" });
  const blocked = structuredClone(s); blocked.robots.find(r => r.id === "R01")!.mapVersion = 2;
  s = run(s, { type: "TASK_FINISHED", id: "T009" });
  assert.equal(s.robots.find(r => r.id === "R01")!.current, "T010");
  assert.equal(s.tasks.find(t => t.id === "T010")!.state, "执行中");
  const b = run(blocked, { type: "TASK_FINISHED", id: "T009" });
  assert.equal(b.tasks.find(t => t.id === "T010")!.state, "待执行");
});
test("accepted task can reorder and reassigned task can dispatch again", () => {
  let s = run(seed(), { type: "ENQUEUE", id: "T010", robotId: "R01" });
  s = run(s, { type: "REORDER", id: "T010" });
  assert.equal(s.tasks[0].id, "T010");
  s = run(s, { type: "REASSIGN", id: "T010", robotId: "R01", confirmed: true });
  s = run(s, { type: "ENQUEUE", id: "T010", robotId: "R01" });
  assert.equal(s.tasks.find(t => t.id === "T010")!.state, "待执行");
});
test("return home releases takeover and waits for arrival", () => {
  let s = run(seed(), { type: "TAKEOVER", robotId: "R01" });
  s = run(s, { type: "CONTROL_ACK", id: s.sessions[0].id });
  s = run(s, { type: "RETURN_HOME", robotId: "R01" });
  assert.equal(s.sessions[0].state, "已释放");
  assert.equal(s.robots.find(r => r.id === "R01")!.state, "返航中");
  s = run(s, { type: "RETURN_ARRIVED", robotId: "R01" });
  assert.equal(s.robots.find(r => r.id === "R01")!.state, "充电");
});

test("autonomous point completion also continues the queue", () => {
  let s = run(seed(), { type: "ENQUEUE", id: "T010", robotId: "R01" });
  for (let i = 0; i < 50 && s.tasks.find(t => t.id === "T009")!.state === "执行中"; i++) s = run(s, { type: "TICK", id: "T009" });
  assert.equal(s.tasks.find(t => t.id === "T009")!.state, "完成");
  assert.equal(s.robots.find(r => r.id === "R01")!.current, "T010");
});
