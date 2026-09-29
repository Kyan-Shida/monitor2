import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run, constraints } from "./engine";
import { metricValue, scopedState } from "./metrics";
import { requiredKinds, bindingReasons } from "./planSchedule";
import { rulesOf } from "./alarmRules";
import { captureKindsOfPoint, robotCoversPoint } from "./deviceMaster";

const CAPTURES = ["可见光", "红外", "气体", "声音"];

test("机器人能力只表达采集方式：业务类型（仪表 / 阀门）不再参与调度校验（J′1）", () => {
  const s = seed();
  const r2 = s.robots.find((r) => r.id === "R02")!; // 可见光 + 红外
  assert.deepEqual(r2.capabilities, ["可见光", "红外"]);
  // P002 = V001 出口阀门：业务类型是"阀门"，采集方式是"可见光" → 应判定具备
  const valve = s.points.find((p) => p.id === "P002")!;
  assert.equal(valve.kind, "阀门");
  assert.deepEqual(captureKindsOfPoint(s, valve), ["可见光"]);
  assert.equal(robotCoversPoint(s, valve, r2), true);
  // P007 = 装置区管廊气体浓度：采集方式是"气体" → R02 不具备
  const gas = s.points.find((p) => p.id === "P007")!;
  assert.deepEqual(captureKindsOfPoint(s, gas), ["气体"]);
  assert.equal(robotCoversPoint(s, gas, r2), false);
  // 引擎约束与"调度校验清单"同源
  const t = { ...s.tasks[0], items: [{ ...gas, mapVersion: 3, pointSet: 7 }] };
  assert.ok(constraints(s, t, r2).includes("检测能力不足"));
});

test("计划绑定的所需能力也收敛为采集方式，且与调度校验同结论（J′1）", () => {
  const s = seed();
  const kinds = requiredKinds(s, s.templates[0].id);
  assert.deepEqual(kinds.sort(), ["可见光", "红外"]);
  for (const k of kinds) assert.ok(CAPTURES.includes(k), `不应出现业务类型：${k}`);
  const r2 = s.robots.find((r) => r.id === "R02")!;
  assert.ok(
    !bindingReasons(s, s.templates[0].id, r2).includes("检测能力不足"),
    "R02 具备模板所需采集方式（可见光 / 红外）",
  );
  // 人为去掉红外采集能力 → 模板需要红外，应判定能力不足
  const r3 = s.robots.find((r) => r.id === "R03")!;
  r3.capabilities = ["气体"];
  assert.ok(
    bindingReasons(s, s.templates[0].id, r3).includes("检测能力不足"),
    "缺红外采集方式应判定能力不足",
  );
});

test("覆盖率按设备清单口径：清单要求但未落位的检测目标构成缺口（J′2）", () => {
  let s = seed();
  // 清单口径：6 台在用设备共 12 个「是否巡检=开」的检测目标，其中 V001「罐顶呼吸阀」尚未落位
  const listed = (s.devices || [])
    .filter((d) => d.reviewState === "已通过" && d.state !== "停用")
    .flatMap((d) => d.items.filter((it) => it.inspect));
  assert.equal(listed.length, 12);
  assert.equal(metricValue(s, "coverage"), 91.7);
  // 厂区筛选后分母与分子同范围（设备清单也按厂区裁剪）
  assert.equal(metricValue(scopedState(s, "一期罐区"), "coverage"), 91.7);
  // 把清单里"尚未落位且不打算巡检"的目标关闭 → 它退出分母，覆盖率回到 100%
  s = run(s, {
    type: "SET_INSPECT_FLAG",
    deviceId: "DEV-V001",
    itemId: "II-V001-B",
    inspect: false,
  });
  assert.equal(metricValue(s, "coverage"), 100);
  // 停用设备的选择性不计入分母（11 − 3 = 8 个目标，仍有 8 个已落位）
  s = run(s, {
    type: "SET_DEVICE_STATE",
    deviceId: "DEV-V004",
    state: "停用",
    confirmed: true,
  });
  assert.equal(metricValue(s, "coverage"), 100);
  // 兼容回退：无设备清单时回到"点位启用率"
  const plain = seed();
  plain.devices = [];
  assert.equal(metricValue(plain, "coverage"), 100);
});

test("模拟读数与默认阈值由「检测项 + 单位」决定，与业务类型解耦（J′3）", () => {
  const s = seed();
  // 默认阈值按单位给量程，不再按 Point.kind 猜
  const gasRule = rulesOf(s).find((r) => r.pointId === "P007")!;
  assert.equal(gasRule.unit, "%LEL");
  assert.equal(gasRule.max, 20);
  const tempRule = rulesOf(s).find((r) => r.pointId === "P003")!;
  assert.equal(tempRule.unit, "℃");
  assert.equal(tempRule.max, 60);
  const pressureRule = rulesOf(s).find((r) => r.pointId === "P001")!;
  assert.equal(pressureRule.min, 0.2);
  assert.equal(pressureRule.max, 0.8);
  // 无单位（阀位 / 状态类）按"期望状态"判定
  const valveRule = rulesOf(s).find((r) => r.pointId === "P002")!;
  assert.equal(valveRule.type, "期望状态");
  assert.equal(valveRule.expected, "开启");
  // 模拟读数落在该点位自己的量程内；要求异常时严格超上限
  const t = s.tasks.find((x) => x.id === "T009")!;
  t.stage = 6;
  const ok = run(s, { type: "TICK", id: "T009" });
  assert.equal(ok.results[0].raw, "0.5");
  assert.equal(ok.results[0].unit, "MPa");
  assert.equal(ok.results[0].abnormal, false);
  const bad = run(s, { type: "TICK", id: "T009", abnormal: true });
  assert.equal(bad.results[0].abnormal, true);
  assert.ok(Number(bad.results[0].raw) > 0.8);
});
