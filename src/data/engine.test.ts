import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run, constraints } from "./engine";
import { rulesOf } from "./alarmRules";
import { pages } from "./navigation";
import { ensureCalibration } from "./mapCalibration";
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
// 2026-09-30：下线「路线管理」目录（路线随地图带入）→ 39 → 38；
// 同日合并「能力与健康 / 地图与版本 / 机型专项」三页为「机器人能力」并新增「新增机器人」页 → 37
// 2026-10-06：新增「空间与区域目标」页（非装置类目标独立入口）→ 38
// 2026-10-07：空间与区域目标（points-space）暂未实现，从菜单注释掉 → 38 → 37
// 2026-10-08：新增「后台管理 › 工厂基础数据」页（区域 / 设备 / 仪表配置）→ 37 → 38
// 2026-10-09：新增「后台管理 › 机器人上装能力」页（上装主数据）→ 38 → 39
// 2026-10-09：下线「结果详情 / 复核」页（人工复核取消，异常即告警）→ 39 → 38
// 2026-10-09：新增「后台管理 › 告警模板管理」页（触发逻辑唯一维护入口）→ 38 → 39
// 2026-10-09：从「工厂基础数据」拆出「后台管理 › 算法模板管理」页（AI 能力清单）→ 39 → 40
// 2026-10-10：新增「后台管理 › 巡检要求管理」页（看什么、怎么判 的标准表达，台账按目标类型与采集方式匹配引用）→ 40 → 41
// 2026-10-10：新增「资源与地图 › 空间 › 空间管理」页（全局坐标系配准 / 跨图拓扑）→ 41 → 42
// 2026-10-14：空间管理菜单收起（页面与路由保留，`#/resources/space` 可直达）→ 42 → 41
// 2026-10-14：「告警管理」升为一级目录，新增「告警类别」「告警设置」「告警推送」三页 → 41 → 44
test("44 unique phase-one pages", () => {
  assert.equal(pages.length, 44);
  assert.equal(new Set(pages.map((p) => p.id)).size, 44);
});

test("巡检要求管理：管理员可维护，需填齐判定口径", () => {
  let s = seed();
  const base = {
    id: "",
    name: "看管道振动",
    kind: "声音判别" as const,
    description: "沿锚点声纹采样判别异常振动",
    targetKinds: ["区域"] as ("仪表" | "环境" | "区域")[],
    capture: "声音" as const,
    detectKind: "声纹" as const,
    algorithm: "管道振动识别 v1.0",
    judge: "等级评分" as const,
    cycle: "每班",
  };
  // 非管理员被拦截
  assert.throws(
    () => run({ ...s, roleId: "user" }, { type: "SAVE_REQUIREMENT", requirement: base }),
    /仅管理员/,
  );
  // 数值范围判定缺单位 / 上下限时拦截
  assert.throws(
    () =>
      run(s, {
        type: "SAVE_REQUIREMENT",
        requirement: { ...base, judge: "数值范围" },
      }),
    /单位|下限/,
  );
  // 管理员正常保存：自动生成 REQ- id 且版本为 1
  const next = run(s, { type: "SAVE_REQUIREMENT", requirement: base });
  const saved = (next.requirements || []).find((r) => r.name === "看管道振动")!;
  assert.ok(saved.id.startsWith("REQ-"));
  assert.equal(saved.version, 1);
  assert.equal(saved.updatedAt, String(saved.updatedAt));
  // 再次保存同一 id 版本自增
  const v2 = run(next, {
    type: "SAVE_REQUIREMENT",
    requirement: { ...saved, description: "改说明" },
  });
  assert.equal(
    (v2.requirements || []).find((r) => r.id === saved.id)!.version,
    2,
  );
});
test("map import → annotation → sync → validation → publication", () => {
  let s = seed();
  // 采集产出 ①：只导入纯点云地图文件（不含任何定位ID与巡检点）
  s = run(s, {
    type: "IMPORT",
    name: "测试地图",
    file: "sample.map",
    cloud: "cloud.pcd",
    video: "video.mp4",
    source: "手持仪器",
  });
  const m = s.maps[0];
  // 采集产出 ②：导入同批采集的巡检点标定文件（独立模块，与地图分开放），按定位ID绑定
  const cal = ensureCalibration(s, m.id);
  cal.targets.push(
    { id: "O901", externalId: "O901", source: "地图导入", kind: "可见光", x: 37, y: 34, state: "待确认" },
    { id: "O902", externalId: "O902", source: "地图导入", kind: "红外", x: 65, y: 60, state: "待确认" },
  );
  s = run(s, {
    type: "ANNOTATE",
    mapId: m.id,
    targetId: cal.targets[0].id,
    name: "测试压力点",
    // v3：设备与检测对象必须来自设备主数据（DEV-V001 / 出口压力表）
    device: "V001",
    objects: ["出口压力表"],
    item: "压力读数",
    requirement: "表盘清晰",
  });
  // 单级定版：只校验原始资料与点位齐备；状态按"当前版本是否已下发给机器"派生
  // 新图还没有机器持有、也从未下发 → 未发布
  s = run(s, { type: "PUBLISH", id: m.id });
  assert.equal(s.maps[0].state, "未发布");
  s = sync(s, m.id, "R02");
  // 下发给机器后即"下发到位"→ 已发布（不要求对方已完成激活）
  assert.equal(s.maps[0].state, "已发布");
  const p = s.points.at(-1)!;
  s = run(s, { type: "VALIDATE", id: p.id, robotId: "R02", fail: true });
  assert.match(s.points.find(x => x.id === p.id)!.validationFailure!, /目标身份未确认/);
  s = run(s, { type: "VALIDATE", id: p.id, robotId: "R02" });
  assert.equal(s.points.find(x => x.id === p.id)!.validationFailure, undefined);
  assert.equal(s.points.find(x => x.id === p.id)!.state, "已启用");
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
test("alarm handling records result and false positive without touching state", () => {
  let s = complete(seed(), "T009");
  const before = s.alarms.find((a) => a.id === "AL001")!.state;
  s = run(s, {
    type: "ALARM_LABEL",
    id: "AL001",
    reason: "现场确认表计读数与识别一致",
    result: "受理",
    falsePositive: false,
  });
  const al = s.alarms.find((a) => a.id === "AL001")!;
  assert.equal(al.handleResult, "受理");
  assert.equal(al.falsePositive, false);
  assert.equal(!!al.handledAt, true);
  assert.equal(al.state, before);
  assert.equal(al.notes.some((x) => x.includes("处理说明")), true);
  // 已处理告警不可二次编辑：重复处理会污染报警准确率口径
  assert.throws(() =>
    run(s, {
      type: "ALARM_LABEL",
      id: "AL001",
      reason: "再次处理",
      result: "忽略",
      falsePositive: true,
    }),
  );
});
test("takeover pause acknowledgment exclusive session exit resume", () => {
  let s = seed();
  s = run(s, { type: "TAKEOVER", robotId: "R01" });
  const id = s.sessions[0].id;
  assert.throws(() => run(s, { type: "CONTROL", id, command: "前进" }));
  assert.throws(() => run(s, { type: "TAKEOVER", robotId: "R01" }));
  s = run(s, { type: "CONTROL_ACK", id });
  // TKO-04：接管＝借调，原任务进入「已被接管」，释放后由 START 显式恢复
  assert.equal(s.tasks[0].state, "已被接管");
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
    constraints(s, s.tasks[1], s.robots[1]).includes("地图版本待同步"),
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
  // 采集结果保留原始证据与识别值，且不再产生复核记录（人工复核已下线）
  const r = s.results[0];
  assert.equal(r.raw, r.recognized);
  assert.equal("reviews" in (r as object), false);
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
test("AI state anomaly alarms at level 3, risk anomaly follows the risk level, normal records no alarm", () => {
  /** 每轮都把任务复位到"采集第一个检测项"，三种口径落在同一检测项上便于对比 */
  const tick = (base: State, a: Record<string, unknown>) => {
    const t = base.tasks.find((x) => x.id === "T009")!;
    t.stage = 6;
    t.index = 0;
    // 清空历史告警：只验证本次采集产生的告警（避免并入种子里的同点位旧告警）
    base.alarms = [];
    return run(base, { type: "TICK", id: "T009", ...a });
  };
  // ① AI 状态异常（识别结果为空）→ 三级告警，风险信息本身不异常
  const ai = tick(seed(), { value: "" });
  assert.equal(ai.results[0].aiAbnormal, true);
  assert.equal(ai.results[0].abnormal, false);
  assert.equal(ai.alarms.length, 1);
  assert.equal(ai.alarms[0].level, "三级");
  assert.ok(ai.alarms[0].notes.some((n) => n.includes("AI 状态异常")));
  // ② 风险信息异常 → 按该检测项的风险等级告警（P001 = 二级）
  const risk = tick(ai, { abnormal: true });
  assert.equal(risk.results[0].abnormal, true);
  assert.equal(risk.results[0].aiAbnormal, false);
  assert.equal(risk.alarms.length, 1);
  assert.equal(risk.alarms[0].level, "二级");
  assert.ok(risk.alarms[0].notes.some((n) => n.includes("规则")));
  // ③ 识别正常且风险正常 → 只有检测记录，没有告警
  const ok = tick(risk, {});
  assert.equal(ok.results[0].abnormal, false);
  assert.equal(ok.results[0].aiAbnormal, false);
  assert.equal(ok.alarms.length, 0);
});
test("queue reordering and reassignment preserve identity and require withdrawal confirmation", () => {
  let s = seed();
  s = run(s, { type: "REORDER", id: "T013", beforeId: "T012" });
  assert.ok(
    s.tasks.findIndex((t) => t.id === "T013") <
      s.tasks.findIndex((t) => t.id === "T012"),
  );
  assert.throws(() => run(s, { type: "REASSIGN", id: "T013", robotId: "R02" }));
  s = run(s, { type: "REASSIGN", id: "T013", robotId: "R02", confirmed: true });
  assert.equal(s.tasks.find((t) => t.id === "T013")!.robotId, "R02");
  assert.throws(() =>
    run(s, { type: "REORDER", id: "T013", beforeId: "T012" }),
  );
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
