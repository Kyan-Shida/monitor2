import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run } from "./engine";
import { parse, parentOf, menuIdOf, pages } from "./navigation";
import { defaultRequirementOfInstrument } from "./deviceMaster";
import { rulesOf } from "./alarmRules";

/** 便捷取巡检目标台账 */
const bt = (s: ReturnType<typeof seed>, id: string) =>
  s.businessTargets!.find((b) => b.id === id)!;

test("工厂树三层齐全：区域 → 设备 → 仪表，且仪表归属可回溯", () => {
  const s = seed();
  assert.ok((s.areas || []).length > 0);
  assert.ok((s.requirements || []).length >= 4);
  // 仪表来自「已通过审核」设备的检测目标（待审核 / 已驳回清单不进工厂树）
  assert.equal(s.instruments!.length, 13);
  const passed = (s.devices || []).filter((d) => d.reviewState === "已通过");
  const passedItems = passed.reduce((n, d) => n + d.items.length, 0);
  assert.equal(s.instruments!.length, passedItems);
  for (const ins of s.instruments!) {
    const dev = s.devices!.find((d) => d.id === ins.deviceId);
    assert.ok(dev, `仪表 ${ins.id} 必须挂在设备上`);
    assert.ok(
      (s.areas || []).some((a) => a.name === dev!.region),
      `设备 ${dev!.id} 必须归属到某个区域`,
    );
    assert.ok(
      dev!.items.some((it) => it.id === ins.id),
      "仪表 id 必须能回溯到设备清单的检测目标",
    );
  }
});

test("巡检目标台账 = 仪表 + 巡检要求 + 算法 + 阈值 + 判断标准；阈值与点位规则同源", () => {
  const s = seed();
  assert.equal(s.businessTargets!.length, s.instruments!.length);
  // 压力表（可见光 + MPa）→ 看仪表读数，量程与点位判定规则一致（0.2–0.8 MPa）
  const p = bt(s, "BT-II-V001-P");
  assert.equal(p.requirementId, "REQ-READ");
  assert.equal(p.judge, "数值范围");
  assert.equal(p.min, 0.2);
  assert.equal(p.max, 0.8);
  assert.equal(p.unit, "MPa");
  assert.ok(p.algorithm);
  // 罐壁（红外 + ℃）→ 看高温 0–60
  const hot = bt(s, "BT-II-V002-T");
  assert.equal(hot.requirementId, "REQ-HOT");
  assert.equal(hot.max, 60);
  // 可燃气体探头（气体 + %LEL）→ 看气体浓度 0–20
  const gas = bt(s, "BT-II-PLA-G");
  assert.equal(gas.requirementId, "REQ-GAS");
  assert.equal(gas.max, 20);
  // 阀门（无量纲）→ 看阀位状态，期望"开启"
  const valve = bt(s, "BT-II-V001-V");
  assert.equal(valve.judge, "期望状态");
  assert.equal(valve.expected, "开启");
  // 每台仪表都有默认巡检要求（口径唯一：deviceMaster.defaultRequirementOfInstrument）
  for (const ins of s.instruments!)
    assert.equal(
      bt(s, "BT-" + ins.id).requirementId,
      defaultRequirementOfInstrument(ins),
    );
});

test("仪表只是资产：新增巡检目标台账需要巡检要求 + 算法 + 合法判定参数", () => {
  const s = seed();
  // 仪表不存在（未通过审核的清单不进工厂树）
  assert.throws(
    () =>
      run(s, {
        type: "ADD_BUSINESS_TARGET",
        instrumentId: "II-V005-L",
        requirementId: "REQ-READ",
        algorithm: "x",
      }),
    /仪表不存在/,
  );
  // 仪表所属设备已停用
  assert.throws(
    () =>
      run(s, {
        type: "ADD_BUSINESS_TARGET",
        instrumentId: "II-V009-P",
        requirementId: "REQ-READ",
        algorithm: "x",
      }),
    /已停用/,
  );
  // 巡检要求必须存在
  assert.throws(
    () =>
      run(s, {
        type: "ADD_BUSINESS_TARGET",
        instrumentId: "II-V001-P",
        requirementId: "REQ-UNKNOWN",
        algorithm: "x",
      }),
    /巡检要求不存在/,
  );
  // 算法（AI 表达方式）必填
  assert.throws(
    () =>
      run(s, {
        type: "ADD_BUSINESS_TARGET",
        instrumentId: "II-V001-P",
        requirementId: "REQ-READ",
        algorithm: "   ",
      }),
    /指定算法/,
  );
  // 数值范围判定要有效上下限
  assert.throws(
    () =>
      run(s, {
        type: "ADD_BUSINESS_TARGET",
        instrumentId: "II-V001-P",
        requirementId: "REQ-READ",
        algorithm: "表计读数识别 v1.2",
        judge: "数值范围",
        min: 0.9,
        max: 0.2,
      }),
    /上下限/,
  );
  // 期望状态判定要填期望值
  assert.throws(
    () =>
      run(s, {
        type: "ADD_BUSINESS_TARGET",
        instrumentId: "II-V001-P",
        requirementId: "REQ-STATE",
        algorithm: "阀位判别 v1.4",
        judge: "期望状态",
        expected: "",
      }),
    /期望状态/,
  );
});

test("同一台仪表可叠加多条业务目标（看滴漏 + 看仪表读数）", () => {
  let s = seed();
  const before = s.businessTargets!.filter((b) => b.instrumentId === "II-V001-P")
    .length;
  s = run(s, {
    type: "ADD_BUSINESS_TARGET",
    instrumentId: "II-V001-P",
    requirementId: "REQ-LEAK",
    algorithm: "液滴 / 油渍分割 v2",
    judge: "有无目标",
    needPhoto: true,
    needReview: true,
    cycle: "每日",
    priority: "高",
  });
  const list = s.businessTargets!.filter((b) => b.instrumentId === "II-V001-P");
  assert.equal(list.length, before + 1);
  const added = list[0];
  assert.equal(added.requirementId, "REQ-LEAK");
  assert.equal(added.judge, "有无目标");
  assert.equal(added.needReview, true);
  assert.equal(added.inspect, true);
  assert.equal(added.min, undefined, "非数值范围判定不应带阈值");
});

test("「是否巡检」双向一致：业务目标 ↔ 设备巡检项，并作用于任务指令集", () => {
  let s = seed();
  // 关掉 P001 对应的业务目标 → 设备清单巡检项同步关闭 → 任务拒绝生成
  s = run(s, { type: "UPDATE_BUSINESS_TARGET", id: "BT-II-V001-P", inspect: false });
  assert.equal(bt(s, "BT-II-V001-P").inspect, false);
  assert.equal(
    s.devices!.flatMap((d) => d.items).find((i) => i.id === "II-V001-P")!.inspect,
    false,
  );
  assert.throws(
    () =>
      run(s, {
        type: "QUICK_DISPATCH",
        name: "关闭巡检的目标",
        points: ["P001"],
        priority: "普通",
        robotId: "R01",
        taskType: "光学任务",
        atomicActions: ["拍照"],
      }),
    /关闭「是否巡检」/,
  );
  // 反向：设备主数据里打开 → 业务目标同步打开
  s = run(s, {
    type: "SET_INSPECT_FLAG",
    deviceId: "DEV-V001",
    itemId: "II-V001-P",
    inspect: true,
  });
  assert.equal(bt(s, "BT-II-V001-P").inspect, true);
});

test("导航调整：路线管理目录下线；原「点位标注与验证工作台」槽位改为「巡检点管理」", () => {
  // 路线管理目录已删除：菜单项与目录层级都不再存在（旧 URL 落到兜底视图，不报错）
  assert.ok(!pages.some((p) => p.id === "routes"));
  assert.equal(parentOf("routes"), undefined);
  // 巡检目标台账仍在 points 槽位；「巡检点管理」占用原「点位标注与验证工作台」槽位（annotation）
  const btSlot = pages.find((p) => p.id === "points")!;
  assert.equal(btSlot.name, "巡检目标台账");
  assert.equal(btSlot.path, "resources/points");
  assert.equal(pages.find((p) => p.id === "annotation")!.name, "巡检点管理");
  // 内置页不占菜单项：添加/编辑巡检点、地图标注工作台、巡检点详情
  assert.ok(
    !pages.some((p) =>
      ["point-list", "point-edit", "point-annotate"].includes(p.id),
    ),
    "内置页不占菜单项",
  );
  assert.equal(parse("#/resources/points/edit").page, "point-edit");
  assert.equal(parse("#/resources/points/annotate").page, "point-annotate");
  // 三个内置页都归属「巡检点管理」，侧边栏高亮回到巡检点管理
  assert.equal(parentOf("point-edit"), "annotation");
  assert.equal(parentOf("point-annotate"), "annotation");
  assert.equal(parentOf("point"), "annotation");
  assert.equal(menuIdOf("point"), "annotation");
  assert.equal(menuIdOf("point-edit"), "annotation");
});

test("告警设置只在巡检目标台账上：点位规则按目标的阈值 / 等级 / 开关生效", () => {
  let s = seed();
  // P001 的巡检项绑定 BT-II-V001-P：等级与开关来自业务目标（而不是点位自己）
  assert.equal(rulesOf(s).find((r) => r.pointId === "P001")!.level, "重要");
  // 业务目标与业务要求随种子落地（留空时也由引擎兜底生成）
  assert.ok(bt(s, "BT-II-V001-P").goal?.includes("出口压力表"));
  assert.ok(bt(s, "BT-II-V001-P").require);
  // 改成「紧急 + 通知值班长」：规则与产生的告警都跟着变
  s = run(s, {
    type: "UPDATE_BUSINESS_TARGET",
    id: "BT-II-V001-P",
    alarm: { on: true, level: "紧急", notify: ["设备岗", "值班长"] },
  });
  assert.equal(rulesOf(s).find((r) => r.pointId === "P001")!.level, "紧急");
  // 清掉种子里的历史告警：确保本次超限会**新建**一条告警（而不是并入未闭环的旧告警）
  s.alarms = [];
  s.tasks.find((t) => t.id === "T009")!.stage = 6;
  s = run(s, { type: "TICK", id: "T009", abnormal: true });
  const al = s.alarms[0];
  assert.ok(al, "超限读数应产生告警");
  assert.equal(al.level, "紧急");
  assert.ok(
    al.notes.some((n) => n.includes("值班长")),
    "通知对象应随告警记录带出",
  );
  // 关掉告警：只记录结果与证据，不再产生告警
  s = run(s, {
    type: "UPDATE_BUSINESS_TARGET",
    id: "BT-II-V001-P",
    alarm: { on: false },
  });
  const before = s.alarms.length;
  const task = s.tasks.find((t) => t.id === "T009")!;
  task.stage = 6;
  // 回退到同一个巡检点（items[0] = P001）再采一次
  task.index = 0;
  const off = run(s, { type: "TICK", id: "T009", abnormal: true });
  assert.equal(off.alarms.length, before);
  assert.equal(off.results[0].status, "待复核");
});
