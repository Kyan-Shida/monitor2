import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run, constraints } from "./engine";
import { advanceAutomation } from "./automation";
import { rulesOf } from "./alarmRules";
import { planKindOf, planOccurrences } from "./planSchedule";
const at = (time: string) => Date.parse("2026-09-28T" + time + ":00+08:00");
function available() {
  const s = seed();
  s.plans[0].robotId = "R02";
  s.plans[0].time = "17:00";
  const r = s.robots.find((r) => r.id === "R02")!;
  r.mapVersion = 3;
  return s;
}
test("plan auto-generates once, receives before time, cannot start early, completes autonomously", () => {
  let s = available();
  s = advanceAutomation(s, at("16:50"));
  const t = s.tasks.find((t) => t.planId === "PL01")!;
  assert.equal(t.robotId, "R02");
  assert.equal(t.state, "下发中");
  s = advanceAutomation(s, at("16:50") + 1000);
  assert.equal(s.tasks.find((x) => x.id === t.id)!.state, "待执行");
  assert.throws(
    () => run(s, { type: "START", id: t.id, now: at("16:59") }),
    /尚未到/,
  );
  s = advanceAutomation(s, at("16:59"));
  assert.equal(s.robots.find((r) => r.id === "R02")!.current, undefined);
  s = advanceAutomation(s, at("17:00"));
  assert.equal(s.robots.find((r) => r.id === "R02")!.current, t.id);
  for (let n = 1; n < 30; n++) s = advanceAutomation(s, at("17:00") + n * 4000);
  assert.equal(s.tasks.find((x) => x.id === t.id)!.state, "完成");
  assert.equal(s.tasks.filter((t) => t.planId === "PL01").length, 1);
  assert.equal(s.results.filter((r) => r.taskId === t.id).length, 3);
});
test("bound version conflict remains assigned with reason; fixes retry, wait expiration is visible", () => {
  let s = available();
  s.robots.find((r) => r.id === "R02")!.mapVersion = 2;
  s = advanceAutomation(s, at("17:00"));
  let t = s.tasks.find((t) => t.planId === "PL01")!;
  assert.equal(t.state, "已分配");
  assert.match(t.blockedReason!, /版本/);
  s.robots.find((r) => r.id === "R02")!.mapVersion = 3;
  s = advanceAutomation(s, at("17:01"));
  assert.equal(s.tasks.find((x) => x.id === t.id)!.state, "下发中");
  s = advanceAutomation(s, at("17:02"));
  s.robots.find((r) => r.id === "R02")!.battery = 1;
  s = advanceAutomation(s, at("17:31"));
  assert.equal(s.tasks.find((x) => x.id === t.id)!.state, "超期");
});
test("monthly and hourly slots use business timezone, missing binding does not silently choose robot", () => {
  const s = available();
  delete s.plans[0].robotId;
  assert.equal(advanceAutomation(s, at("17:00")), s);
  assert.throws(() => run(s, { type: "GENERATE", id: "PL01" }), /绑定/);
  // 每月：只在与有效期首日同一个「日号」的那天展开（9-28 → 每月 28 号）
  const p = { ...s.plans[0], cycle: "每月" as const, start: "2026-09-28" };
  const occ = planOccurrences(p, at("17:00"));
  assert.equal(occ.length, 1);
  assert.equal(
    new Date(occ[0] + 8 * 3600000).toISOString().slice(0, 10),
    "2026-09-28",
  );
  // 日号对不上的那天不展开
  assert.deepEqual(planOccurrences({ ...p, start: "2026-09-22" }, at("17:00")), []);
  // 每小时：当日整点每小时一次（00:00 ~ 23:00 共 24 次），与执行时间无关
  const hourly = {
    ...s.plans[0],
    cycle: "每小时" as const,
    start: "2026-09-28",
    end: "2026-09-28",
    time: "10:00",
  };
  assert.equal(planOccurrences(hourly, at("10:00")).length, 24);
});
test("one-off plan fires once on its date; never repeats, never backfills", () => {
  const on = (time: string, date = "2026-10-16") =>
    Date.parse(date + "T" + time + ":00+08:00");
  let s = seed();
  const plan = s.plans.find((p) => p.id === "PL02")!;
  assert.equal(planKindOf(plan), "定时任务");
  // 与周期任务的多点展开不同：只产生「执行日期 + 执行时间」这一个时刻
  assert.deepEqual(planOccurrences(plan, on("08:00")), [on("09:30")]);
  // 提前生成窗口内自动生成一次，并按该时刻锁定 scheduleKey
  s = advanceAutomation(s, on("09:20"));
  const made = s.tasks.filter((t) => t.planId === "PL02");
  assert.equal(made.length, 1);
  assert.equal(made[0].scheduleKey, String(on("09:30")));
  // 时钟继续走到次日，也不会再生成第二个
  s = advanceAutomation(s, on("09:30"));
  s = advanceAutomation(s, on("09:30", "2026-10-17"));
  assert.equal(s.tasks.filter((t) => t.planId === "PL02").length, 1);
  // 错过不补：次日才打开浏览器，不回补前一天的一次性任务
  assert.equal(
    advanceAutomation(seed(), on("09:30", "2026-10-17")).tasks.filter(
      (t) => t.planId === "PL02",
    ).length,
    0,
  );
  // 老数据没有 kind，一律按「周期任务」收口
  assert.equal(planKindOf({ ...plan, kind: undefined }), "周期任务");
});
test("field commands require capabilities and session, failed reply preserves state, exit stops output", () => {
  let s = seed();
  assert.throws(
    () =>
      run(s, {
        type: "FIELD_COMMAND",
        robotId: "R01",
        command: "talk",
        value: true,
      }),
    /会话/,
  );
  s = run(s, { type: "TAKEOVER", robotId: "R01" });
  s = run(s, { type: "CONTROL_ACK", id: s.sessions[0].id });
  s = run(s, {
    type: "FIELD_COMMAND",
    robotId: "R01",
    command: "zoom",
    value: 9,
    fail: true,
  });
  assert.equal(s.fieldDevices!.R01.zoom, 1);
  s = run(s, {
    type: "FIELD_COMMAND",
    robotId: "R01",
    command: "broadcast",
    value: "前方危险，请勿靠近",
  });
  assert.throws(
    () =>
      run(s, {
        type: "FIELD_COMMAND",
        robotId: "R01",
        command: "talk",
        value: true,
      }),
    /占用/,
  );
  s = run(s, { type: "CONTROL_EXIT", id: s.sessions[0].id });
  assert.equal(s.fieldDevices!.R01.broadcast, "");
  assert.throws(
    () =>
      run(s, {
        type: "FIELD_COMMAND",
        robotId: "R03",
        command: "talk",
        value: true,
      }),
    /不支持/,
  );
});
test("configured rule controls live result and preserves original rule snapshot after editing", () => {
  let s = seed();
  let rule = { ...rulesOf(s)[0], max: 0.5 };
  s = run(s, { type: "SAVE_ALARM_RULE", rule });
  s.tasks.find((t) => t.id === "T009")!.stage = 6;
  // 注入"异常读数"：模拟读数由该点位自己的规则生成（上限已改为 0.5 → 读数严格超限），
  // 这样"规则决定判定结果"验证的是规则本身，而不是按 Point.kind 硬编码的读数
  s = run(s, { type: "TICK", id: "T009", abnormal: true });
  const result = s.results[0];
  assert.equal(result.abnormal, true);
  assert.ok(Number(result.raw) > 0.5, "异常读数应严格超出配置上限");
  assert.equal(result.ruleSnapshot!.max, 0.5);
  s = run(s, { type: "SAVE_ALARM_RULE", rule: { ...rule, max: 1 } });
  assert.equal(
    s.results.find((r) => r.id === result.id)!.ruleSnapshot!.max,
    0.5,
  );
});

test("point rules treat inclusive bounds as normal; empty/disabled rules record without judgement; new points remain unconfigured", () => {
  let s = seed();
  const task = s.tasks.find((t) => t.id === "T009")!;
  task.stage = 6;
  let normal = run(s, { type: "TICK", id: task.id, value: "0.8" });
  assert.equal(normal.results[0].abnormal, false);
  let high = run(s, { type: "TICK", id: task.id, value: "0.81" });
  assert.equal(high.results[0].abnormal, true);
  assert.ok(high.alarms.some((a) => a.notes.some((n) => n.includes("0.81"))));
  let empty = run(s, { type: "TICK", id: task.id, value: "" });
  assert.equal(empty.results[0].status, "已识别");
  assert.equal(empty.alarms.length, s.alarms.length);
  s = run(s, {
    type: "SAVE_ALARM_RULE",
    rule: { ...rulesOf(s)[0], enabled: false },
  });
  const disabled = run(s, { type: "TICK", id: task.id, value: "0.92" });
  assert.equal(disabled.results[0].status, "已识别");
  // 未绑定业务目标的巡检点 = 未配置告警：不判定（只记录结果）
  s.points.push({ ...s.points[0], id: "P-new", inspectItems: [] });
  assert.equal(rulesOf(s).find((r) => r.pointId === "P-new")?.enabled, false);
  // 告警设置来自巡检目标台账：绑定了"已开启告警"的目标即视为已配置
  s.points.push({ ...s.points[0], id: "P-bind" });
  const bound = rulesOf(s).find((r) => r.pointId === "P-bind")!;
  assert.equal(bound.enabled, true);
  assert.equal(bound.level, "二级");
  assert.equal(bound.max, 0.8);
});

test("customer history additions retain task snapshots and original active task scope", () => {
  const s = seed();
  assert.equal(s.schema, 12);
  assert.equal(s.tasks.find(t=>t.id==="T009")!.items.length,3);
  const history=s.tasks.find(t=>t.id==="T040")!;
  assert.equal(history.index,history.items.length);
  for(const pid of history.done) assert.ok(history.items.some(p=>p.id===pid));
  for(const r of s.results.filter(r=>r.taskId==="T040")) assert.ok(history.items.some(p=>p.id===r.pointId));
});
