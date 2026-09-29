import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run, constraints } from "./engine";
import { pages } from "./navigation";
import type { State } from "./types";
function complete(s: State, id: string, abnormal = false) {
  while (s.tasks.find((t) => t.id === id)!.state === "执行中")
    s = run(s, { type: "TICK", id, abnormal });
  return s;
}
function sync(s: State, mapId: string, robotId: string) {
  s = run(s, { type: "SYNC", mapId, robotId });
  const id = s.syncs[0].id;
  for (let i = 0; i < 3; i++) s = run(s, { type: "SYNC_STEP", id });
  return s;
}
function dispatch(s: State, id: string) {
  s = run(s, { type: "ASSIGN", id, robotId: "R01" });
  s = run(s, { type: "DISPATCH", id });
  s = run(s, { type: "RECEIPT", id });
  return run(s, { type: "START", id });
}
// 2026-09-30：下线「路线管理」目录（路线随地图带入）→ 39 → 38
test("38 unique phase-one pages", () => {
  assert.equal(pages.length, 38);
  assert.equal(new Set(pages.map((p) => p.id)).size, 38);
});
test("map import → annotation → sync → validation → publication", () => {
  let s = seed();
  s = run(s, {
    type: "IMPORT",
    name: "测试地图",
    file: "sample.map",
    cloud: "cloud.pcd",
    video: "video.mp4",
    source: "手持仪器",
    // 定位ID与轨迹随文件带入（简化后的导入就是"上传地图 + 自带定位ID/轨迹"）
    targets: [
      { id: "O901", x: 37, y: 34, kind: "可见光" },
      { id: "O902", x: 65, y: 60, kind: "红外" },
    ],
    track: [{ x: 16, y: 82, kind: "停靠点", seq: 1 }],
  });
  const m = s.maps[0];
  s = run(s, {
    type: "ANNOTATE",
    mapId: m.id,
    targetId: m.targets[0].id,
    name: "测试压力点",
    // v3：设备与检测对象必须来自设备主数据（DEV-V001 / 出口压力表）
    device: "V001",
    objects: ["出口压力表"],
    item: "压力读数",
    requirement: "表盘清晰",
  });
  // 单级定版：原始资料与点位齐备即可发布（平台不区分试验版 / 正式版）
  s = run(s, { type: "PUBLISH", id: m.id });
  assert.equal(s.maps[0].state, "已发布");
  s = sync(s, m.id, "R02");
  const p = s.points.at(-1)!;
  s = run(s, { type: "VALIDATE", id: p.id, robotId: "R02", fail: true });
  assert.match(s.points.find(x => x.id === p.id)!.validationFailure!, /目标身份未确认/);
  s = run(s, { type: "VALIDATE", id: p.id, robotId: "R02" });
  assert.equal(s.points.find(x => x.id === p.id)!.validationFailure, undefined);
  assert.equal(s.points.find(x => x.id === p.id)!.state, "已启用");
  assert.equal(s.robots[1].pointSet, s.maps[0].pointSet);
});
test("missing archive blocks publishing", () => {
  let s = seed();
  s = run(s, {
    type: "IMPORT",
    name: "缺资料",
    file: "m.map",
    source: "机器人",
  });
  assert.throws(
    () => run(s, { type: "PUBLISH", id: s.maps[0].id }),
    /原始点云/,
  );
});
test("template → plan → immutable task → schedule → autonomous results", () => {
  let s = complete(seed(), "T009");
  s = run(s, { type: "GENERATE", id: "PL01" });
  const id = s.tasks[0].id;
  assert.throws(() => run(s, { type: "GENERATE", id: "PL01" }), /已生成/);
  s = dispatch(s, id);
  const snap = JSON.stringify(s.tasks[0].items);
  s = complete(s, id);
  assert.equal(s.tasks[0].state, "完成");
  assert.equal(JSON.stringify(s.tasks[0].items), snap);
  assert.equal(s.results.filter((r) => r.taskId === id).length, 3);
});
test("alarm → recheck → normal result → restored → closed", () => {
  let s = complete(seed(), "T009");
  s = run(s, { type: "ALARM_ACK", id: "AL001" });
  s = run(s, { type: "RECHECK", id: "AL001" });
  const id = s.tasks[0].id;
  s = dispatch(s, id);
  s = complete(s, id);
  assert.equal(s.alarms.find((a) => a.id === "AL001")!.state, "已恢复");
  s = run(s, { type: "ALARM_CLOSE", id: "AL001", reason: "复查正常" });
  assert.equal(s.alarms.find((a) => a.id === "AL001")!.state, "已关闭");
});
test("takeover pause acknowledgment exclusive session exit resume", () => {
  let s = seed();
  s = run(s, { type: "TAKEOVER", robotId: "R01" });
  const id = s.sessions[0].id;
  assert.throws(() => run(s, { type: "CONTROL", id, command: "前进" }));
  assert.throws(() => run(s, { type: "TAKEOVER", robotId: "R01" }));
  s = run(s, { type: "CONTROL_ACK", id });
  assert.equal(s.tasks[0].state, "暂停");
  s = run(s, { type: "CONTROL", id, command: "前进" });
  assert.equal(s.robots[0].y, 52);
  s = run(s, { type: "CONTROL_EXIT", id });
  assert.throws(() => run(s, { type: "CONTROL_RELEASE", id, checked: false }));
  s = run(s, { type: "CONTROL_RELEASE", id, checked: true });
  s = run(s, { type: "START", id: "T009" });
  assert.equal(s.tasks[0].state, "执行中");
  assert.ok(s.sessions[0].startedAt);
  assert.ok(s.sessions[0].releasedAt);
  assert.ok(s.sessions[0].resumedAt);
});
test("failed sync retains actual version; stale receipt rejected; busy activation blocked", () => {
  let s = seed();
  s = run(s, { type: "SYNC", mapId: "MAP-A03", robotId: "R02" });
  const old = s.syncs[0].id;
  s = run(s, { type: "SYNC_STEP", id: old, fail: true });
  assert.equal(s.robots[1].mapVersion, 2);
  s = run(s, { type: "SYNC", mapId: "MAP-A03", robotId: "R02" });
  assert.throws(() => run(s, { type: "SYNC_STEP", id: old }), /旧同步/);
  s = run(s, { type: "SYNC", mapId: "MAP-A03", robotId: "R01" });
  const id = s.syncs[0].id;
  s = run(s, { type: "SYNC_STEP", id });
  s = run(s, { type: "SYNC_STEP", id });
  assert.throws(() => run(s, { type: "SYNC_STEP", id }), /任务或维护窗口/);
});
test("mismatched map may queue but may not dispatch", () => {
  let s = seed();
  assert.ok(
    constraints(s, s.tasks[1], s.robots[1]).includes("地图/点位版本待同步"),
  );
  s = run(s, { type: "ASSIGN", id: "T010", robotId: "R02" });
  assert.throws(() => run(s, { type: "DISPATCH", id: "T010" }), /版本待同步/);
});
test("bounded retry and mandatory skipped item do not count as success", () => {
  let s = seed();
  for (let i = 0; i < 2; i++) {
    s = run(s, { type: "FAIL", id: "T009" });
    s = run(s, { type: "RETRY", id: "T009" });
  }
  s = run(s, { type: "FAIL", id: "T009" });
  assert.throws(() => run(s, { type: "RETRY", id: "T009" }));
  s = run(s, { type: "SKIP", id: "T009" });
  s = complete(s, "T009");
  assert.equal(s.tasks[0].state, "部分完成");
  assert.equal(s.tasks[0].done.length, 2);
});
test("external task idempotency and result audit preserve raw evidence", () => {
  let s = seed();
  s = run(s, { type: "EXTERNAL", businessId: "B1" });
  const count = s.tasks.length;
  s = run(s, { type: "EXTERNAL", businessId: "B1" });
  assert.equal(s.tasks.length, count);
  s = run(s, {
    type: "REVIEW",
    id: "RES001",
    value: "0.91",
    reason: "复核证据",
  });
  assert.equal(s.results[0].raw, "0.92");
  assert.equal(s.results[0].final, "0.91");
  assert.equal(s.results[0].reviews.length, 1);
});

test("TASK_FINISHED without business evidence is failure, partial evidence is partial completion", () => {
  let s = seed();
  s = run(s, { type: "TASK_FINISHED", id: "T009" });
  assert.equal(s.tasks[0].state, "失败");
  assert.equal(s.tasks[0].done.length, 0);
  s = seed();
  for (let i = 0; i < 7; i++) s = run(s, { type: "TICK", id: "T009" });
  s = run(s, { type: "TASK_FINISHED", id: "T009" });
  assert.equal(s.tasks[0].state, "部分完成");
  assert.equal(s.tasks[0].done.length, 1);
});
test("queue reordering and reassignment preserve identity and require withdrawal confirmation", () => {
  let s = seed();
  s = run(s, { type: "REORDER", id: "T013", beforeId: "T012" });
  assert.ok(
    s.tasks.findIndex((t) => t.id === "T013") <
      s.tasks.findIndex((t) => t.id === "T012"),
  );
  assert.throws(() => run(s, { type: "REASSIGN", id: "T013", robotId: "R02" }));
  assert.throws(() => run(s, { type: "REASSIGN", id: "T013", robotId: "R02", confirmed: true }), /移动能力不足/);
  s.tasks.find((t) => t.id === "T013")!.requiredMobility = [];
  s = run(s, { type: "REASSIGN", id: "T013", robotId: "R02", confirmed: true });
  assert.equal(s.tasks.find((t) => t.id === "T013")!.robotId, "R02");
  assert.throws(() =>
    run(s, { type: "REORDER", id: "T013", beforeId: "T012" }),
  );
});
test("invalidating evidence preserves raw values and recalculates task business completion", () => {
  let s = seed();
  s = run(s, {
    type: "REVIEW",
    id: "RES001",
    value: "0.92",
    reason: "证据无法对应目标",
    conclusion: "标记无效",
  });
  assert.equal(s.results[0].raw, "0.92");
  assert.equal(s.results[0].recognized, "0.92");
  assert.equal(s.results[0].status, "无效");
  assert.equal(s.tasks.find((t) => t.id === "T008")!.state, "失败");
});

test("execution workbench quick dispatch creates an accepted queued task without interrupting current task", () => {
  let s = seed();
  s = run(s, {
    type: "QUICK_DISPATCH",
    name: "V001 临时复核",
    points: ["P001"],
    priority: "高",
    robotId: "R01",
    taskType: "光学任务",
    atomicActions: ["拍照", "录像片段"],
  });
  const quick = s.tasks.find((t) => t.name === "V001 临时复核")!;
  assert.equal(quick.state, "待执行");
  assert.equal(quick.robotId, "R01");
  assert.ok(quick.dispatchId);
  assert.equal(quick.source, "执行监控临时下发");
  assert.equal(quick.taskType, "光学任务");
  assert.deepEqual(quick.atomicActions, ["拍照", "录像片段"]);
  assert.equal(s.tasks.find((t) => t.id === "T009")!.state, "执行中");
  assert.equal(s.robots.find((r) => r.id === "R01")!.current, "T009");
});

test("quick dispatch rejects an atomic action unsupported by the target robot atomically", () => {
  const s = seed();
  const count = s.tasks.length;
  assert.throws(
    () =>
      run(s, {
        type: "QUICK_DISPATCH",
        name: "声音临时采集",
        points: ["P001"],
        priority: "普通",
        robotId: "R01",
        taskType: "声音采集任务",
        atomicActions: ["录制声音"],
      }),
    /原子动作能力不足/,
  );
  assert.equal(s.tasks.length, count);
});
