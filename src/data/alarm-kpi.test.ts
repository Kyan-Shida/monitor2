/**
 * @file alarm-kpi.test.ts
 * @description 告警记录 KPI 的维度口径回归：区域 / 属地 / 设备三个维度可切分、
 *              合计与总览卡一致、百分比与指标中心（报警准确率 / 告警处理率）同源；
 *              以及属地单位的设备主数据口径与告警推送名单的业务约束
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run } from "./engine";
import { ALARM_KPI_DIMS, alarmKpiRows, dimValueOfAlarm } from "./alarmKpi";
import { alarmClassOfAlarm } from "./alarmSettings";
import { pushStaffOfAlarm, territoryScopeOptionsOf } from "./alarmPush";
import { territoryOfDevice } from "./deviceMaster";
import type { Alarm } from "./types";

const admin = () => {
  const s = seed();
  s.roleId = "admin";
  return s;
};

test("属地单位：罐区归储运部，装置区按 A / B 段分属装置一部 / 二部", () => {
  const s = seed();
  for (const d of s.devices!) assert.ok(d.territory, `${d.name} 缺属地单位`);
  const units = [...new Set(s.devices!.map((d) => d.territory))].sort();
  assert.deepEqual(units, ["储运部", "装置一部", "装置二部"]);
  // 显式维护值优先：设备台账里改成别的单位后，派生口径不再覆盖
  assert.equal(territoryOfDevice({ ...s.devices![0], territory: "安全环保部" }), "安全环保部");
});

test("属地主数据：后台可增改删，被设备 / 推送范围引用时不可删", () => {
  let s = admin();
  assert.deepEqual(s.territories, ["储运部", "装置一部", "装置二部", "安全环保部"]);
  // 推送绑定的属地候选与主数据同源（不再从设备台账派生）
  assert.deepEqual(territoryScopeOptionsOf(s), s.territories);

  // 新增：去空格后落库，同名拦截
  s = run(s, { type: "ADD_TERRITORY", name: " 运维中心 " });
  assert.ok(s.territories!.includes("运维中心"));
  assert.throws(() => run(s, { type: "ADD_TERRITORY", name: "运维中心" }), /已存在/);

  // 改名：设备归属与推送范围都按名称引用，一并同步
  const device = s.devices!.find((d) => territoryOfDevice(d) === "储运部")!;
  const staff = s.alarmPushStaff!.find((p) => p.territories?.includes("装置一部"))!;
  s = run(s, { type: "RENAME_TERRITORY", from: "储运部", to: "储运一部" });
  s = run(s, { type: "RENAME_TERRITORY", from: "装置一部", to: "装置一部A" });
  assert.equal(
    territoryOfDevice(s.devices!.find((d) => d.id === device.id)!),
    "储运一部",
  );
  assert.deepEqual(
    s.alarmPushStaff!.find((p) => p.id === staff.id)!.territories,
    ["装置一部A", "装置二部"],
  );

  // 删除：被设备 / 推送范围引用时拦截，未被引用的可删
  assert.throws(() => run(s, { type: "DELETE_TERRITORY", name: "储运一部" }), /引用/);
  s = run(s, { type: "DELETE_TERRITORY", name: "运维中心" });
  assert.ok(!s.territories!.includes("运维中心"));
});

test("告警 KPI 三个维度都能切分，合计与总览卡一致", () => {
  const s = seed();
  const total = alarmKpiRows(s, "区域").reduce((n, r) => n + r.total, 0);
  assert.equal(total, s.alarms.filter((a) => a.taskId).length);
  for (const dim of ALARM_KPI_DIMS) {
    const rows = alarmKpiRows(s, dim);
    assert.ok(rows.length, `${dim} 维度没有统计行`);
    assert.equal(
      rows.reduce((n, r) => n + r.total, 0),
      total,
      `${dim} 维度合计应等于告警总数`,
    );
    // 每个维度值都能反查（同一函数，保证筛选与统计不出现两套口径）
    for (const a of s.alarms.filter((x) => x.taskId))
      assert.ok(dimValueOfAlarm(s, a, dim));
  }
  // 区域维度只落到区域主数据口径里
  const regions = alarmKpiRows(s, "区域").map((r) => r.key);
  assert.ok(regions.every((x) => ["一期罐区", "装置区", "未分区", "未标注设备"].includes(x)));
  // 属地维度来自设备主数据的属地单位
  const territories = alarmKpiRows(s, "属地").map((r) => r.key);
  assert.ok(territories.some((x) => ["储运部", "装置一部", "装置二部"].includes(x)));
});

test("KPI 百分比口径：准确率 = 已处理中非误报占比，处理率 = 已处理 / 总数", () => {
  const s = seed();
  const p = s.points.find(
    (x) => x.device && s.alarms.some((a) => a.pointId === x.id),
  )!;
  const sample = s.alarms.find((a) => a.pointId === p.id)!;
  const mk = (i: number, handled: boolean, fp: boolean): Alarm => ({
    ...sample,
    id: `TST-${i}`,
    pointId: p.id,
    taskId: "T001",
    handledAt: handled ? "2026-10-14 10:00" : undefined,
    falsePositive: fp,
  });
  const rows = alarmKpiRows(s, "设备", [
    mk(1, true, true),
    mk(2, true, false),
    mk(3, false, false),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 3);
  assert.equal(rows[0].open, 1);
  assert.equal(rows[0].accuracy, 50, "2 条已处理中 1 条误报 → 50%");
  assert.equal(rows[0].rate, 66.7, "2 / 3 → 66.7%");
  // 全量口径与指标中心同源：告警总数一致、未处理合计一致
  const base = s.alarms.filter((a) => a.taskId);
  const all = alarmKpiRows(s, "设备");
  assert.equal(all.reduce((n, r) => n + r.total, 0), base.length);
  assert.equal(
    all.reduce((n, r) => n + r.open, 0),
    base.filter((a) => !a.handledAt).length,
  );
});

test("告警类别口径：随所属台账的告警类型，台账缺失时按大类兜底", () => {
  const s = admin();
  const withTarget = s.alarms.find((a) => {
    const p = s.points.find((x) => x.id === a.pointId);
    return (p?.inspectItems || []).some((it) =>
      s.businessTargets?.some((b) => b.id === it.targetId && b.alarm?.category),
    );
  })!;
  const t = s.businessTargets!.find((b) =>
    s.points
      .find((x) => x.id === withTarget.pointId)!
      .inspectItems!.some((it) => it.targetId === b.id),
  )!;
  assert.equal(alarmClassOfAlarm(s, withTarget), t.alarm!.category);
  // 改台账的告警类型后，同一告警的类别随之变化（单一数据源）
  // 换一个与当前不同的分类：避免新口径下默认类型与目标类型相同而测不出变化
  const other = s
    .alarmClasses!.map((c) => c.name)
    .find((n) => n !== t.alarm!.category)!;
  const moved = run(s, {
    type: "SAVE_ALARM_SETTING",
    targetId: t.id,
    setting: { ...t.alarm!, category: other, enabled: true, items: t.alarm!.items! },
  });
  assert.equal(alarmClassOfAlarm(moved, withTarget), other);
});

test("告警推送人员：登录名唯一、仅管理员可维护、等级留空 = 全部等级", () => {
  const s = admin();
  assert.ok(s.alarmPushStaff!.length);
  assert.throws(
    () =>
      run(s, {
        type: "SAVE_ALARM_PUSH",
        staff: { id: "", name: "张三", phone: "13900000000", login: s.alarmPushStaff![0].login, dept: "", levels: [], sms: true },
      }),
    /已存在/,
  );
  const added = run(s, {
    type: "SAVE_ALARM_PUSH",
    staff: { id: "", name: "张三", phone: "13900000000", login: "zhangsan", dept: "储运部", levels: [], sms: false },
  });
  const got = added.alarmPushStaff!.find((x) => x.login === "zhangsan")!;
  assert.equal(got.levels.length, 0);
  assert.equal(got.updatedBy, "王姐");
  assert.ok(got.updatedAt);
  const user = seed();
  user.roleId = "user";
  assert.throws(() => run(user, { type: "SAVE_ALARM_PUSH", staff: got }), /仅管理员/);
  const removed = run(added, { type: "REMOVE_ALARM_PUSH", id: got.id });
  assert.equal(removed.alarmPushStaff!.some((x) => x.login === "zhangsan"), false);
});

test("告警推送范围：区域 / 属地 / 设备三维绑定，留空 = 不限，维度之间同时成立", () => {
  const s = admin();
  // 演示数据一人绑定一个维度，覆盖三种绑定方式
  assert.deepEqual(s.alarmPushStaff![0].areas, ["一期罐区"]);
  assert.deepEqual(s.alarmPushStaff![1].territories, ["装置一部", "装置二部"]);
  assert.deepEqual(s.alarmPushStaff![2].devices, ["V001 原料储罐", "V002 缓冲罐"]);

  /** 只给对象与等级，其余字段与本用例无关 */
  const alarm = (patch: Partial<Alarm>): Alarm => ({
    id: "X",
    category: "业务",
    name: "x",
    level: "一级",
    state: "待确认",
    notes: [],
    time: "",
    ...patch,
  });
  const pushed = (a: Alarm) => pushStaffOfAlarm(s, a).map((p) => p.name);

  // 一期罐区 / 储运部 / V001 原料储罐 的一级告警：按区域绑定与按设备绑定都命中
  const v001 = s.points.find((p) => p.device === "V001 原料储罐")!;
  assert.deepEqual(pushed(alarm({ pointId: v001.id })), ["王海峰", "李建国"]);
  // 同一台设备的二级告警：只收一级的王海峰落选，全部等级的李建国仍命中
  assert.deepEqual(pushed(alarm({ pointId: v001.id, level: "二级" })), ["李建国"]);
  // 装置区 A 段管廊（属地 = 装置一部）的一级告警：只有按属地绑定的周敏命中
  assert.deepEqual(pushed(alarm({ pointId: "P007" })), ["周敏"]);
  // 机器人本体告警没有设备，只按所属区域匹配：R01（一期罐区）命中按区域绑定的王海峰
  assert.deepEqual(
    pushed(alarm({ category: "机器人", robotId: "R01" })),
    ["王海峰"],
  );
  // R03 属装置区，无人绑定该区域 → 无接收人
  assert.deepEqual(pushed(alarm({ category: "机器人", robotId: "R03" })), []);

  // 保存时归一化：去空、去重
  const saved = run(s, {
    type: "SAVE_ALARM_PUSH",
    staff: { ...s.alarmPushStaff![0], areas: ["一期罐区", "一期罐区", " "] },
  });
  assert.deepEqual(
    saved.alarmPushStaff!.find((p) => p.id === "AP-01")!.areas,
    ["一期罐区"],
  );
});

test("设备属地可在设备主数据里维护（UPDATE_DEVICE 写回）", () => {
  const s = admin();
  const d = s.devices![0];
  const after = run(s, {
    type: "UPDATE_DEVICE",
    id: d.id,
    name: d.name,
    deviceType: d.type,
    deviceKind: d.deviceKind,
    region: d.region,
    locationDesc: d.locationDesc,
    territory: "安全环保部",
  });
  assert.equal(after.devices!.find((x) => x.id === d.id)!.territory, "安全环保部");
});
