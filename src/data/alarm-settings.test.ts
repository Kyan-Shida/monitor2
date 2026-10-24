/**
 * @file alarm-settings.test.ts
 * @description 告警管理（告警记录 / 告警类别 / 告警设置）的口径回归：
 *              告警设置与巡检目标台账同一份数据（第一条告警项 = 台账判定口径）、
 *              告警开关接入点位判定、告警类别的启停与删除约束
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run } from "./engine";
import { rulesOf } from "./alarmRules";
import {
  alarmClassesOf,
  derivedTargetNameOf,
  enabledAlarmClassesOf,
  settingOf,
  targetNameOf,
  withAlarmSetting,
} from "./alarmSettings";
import type { AlarmItem, Point } from "./types";

const admin = () => {
  const s = seed();
  s.roleId = "admin";
  return s;
};
/** 绑定了某台账的巡检点（台账判定口径经它进入点位规则） */
const pointOfTarget = (s: ReturnType<typeof seed>, targetId: string) =>
  s.points.find((p: Point) =>
    (p.inspectItems || []).some((it) => it.targetId === targetId),
  );

test("每个台账都有告警设置：台账名称 / 类型 / 开关 / 至少一条告警项", () => {
  const s = seed();
  assert.ok(alarmClassesOf(s).length >= 5, "告警类别种子缺失");
  for (const t of s.businessTargets!) {
    const set = settingOf(s, t);
    // 告警名称不在告警设置里：名称统一由台账名称派生（targetNameOf）
    assert.ok(targetNameOf(s, t), `${t.id} 缺台账名称`);
    assert.ok(set.category, `${t.id} 缺告警类型`);
    assert.equal(set.enabled, true, `${t.id} 默认应启用`);
    assert.ok(set.items.length >= 1, `${t.id} 缺告警项`);
    // 第一条告警项与台账判定口径同源
    assert.equal(set.items[0].judge, t.judge, `${t.id} 主告警项判断类型应与台账一致`);
    assert.equal(set.items[0].level, t.alarm!.level, `${t.id} 主告警项等级应与台账一致`);
  }
});

test("告警类别二级口径：机器人与业务各自的分类，且能自动带出默认类型", () => {
  const s = seed();
  assert.deepEqual(
    s.alarmClasses!.map((c) => `${c.main}/${c.name}`),
    [
      "机器人预警/下装",
      "机器人预警/上装",
      "机器人预警/识别故障",
      "业务预警/环境安全",
      "业务预警/生产运行",
      "业务预警/人员与作业",
    ],
  );
  // 默认告警类型：仪表类台账判读数 / 阀位 → 生产运行；环境 / 区域类 → 环境安全
  for (const t of s.businessTargets!) {
    assert.equal(
      t.alarm!.category,
      t.targetKind === "仪表" ? "生产运行" : "环境安全",
      `${t.id} 的默认告警类型应随目标类型`,
    );
  }
  // 机器人预警：本体故障（下装 / 上装）+ 识别失败（识别故障），各自带分类
  const robot = s.alarms.filter((a) => a.category === "机器人");
  assert.ok(robot.length > 0);
  assert.ok(
    robot.every((a) =>
      ["下装", "上装", "识别故障"].includes(a.alarmClass || ""),
    ),
  );
  assert.ok(robot.some((a) => a.alarmClass === "上装"), "上装应有演示数据");
  // 识别失败（照片模糊 / 算法调用失败 / 传感器无数据）归机器人预警 › 识别故障，但仍保留业务点位用于追溯
  const aiAbnormalAlarm = s.alarms.find((a) => a.id === "AL022");
  assert.ok(aiAbnormalAlarm);
  assert.equal(aiAbnormalAlarm!.category, "机器人");
  assert.equal(aiAbnormalAlarm!.alarmClass, "识别故障");
  assert.ok(aiAbnormalAlarm!.pointId, "识别故障仍要能定位到点位");
  assert.ok(aiAbnormalAlarm!.taskId, "识别故障仍要能回溯来源任务");
});

test("告警设置保存后与台账判定口径同步，并进入点位规则", () => {
  let s = admin();
  const t = s.businessTargets!.find(
    (b) => b.judge === "数值范围" && !!pointOfTarget(s, b.id),
  )!;
  const main: AlarmItem = {
    ...t.alarm!.items![0],
    judge: "数值范围",
    from: 0.3,
    to: 0.9,
    level: "一级",
    alarmSeconds: 20,
    abnormalName: "出口压力异常",
  };
  s = run(s, {
    type: "SAVE_ALARM_SETTING",
    targetId: t.id,
    setting: {
      category: t.alarm!.category,
      enabled: true,
      items: [
        main,
        {
          id: "AI-EXTRA",
          category: "普通预警",
          level: "三级",
          judge: "期望状态",
          value: "关闭",
          abnormalName: "阀门未关闭",
          alarmSeconds: 0,
        },
      ],
    },
  });
  const after = s.businessTargets!.find((b) => b.id === t.id)!;
  // 台账判定口径随主告警项同步（这就是「台账 ↔ 告警设置」同一份数据）
  assert.equal(after.judge, "数值范围");
  assert.equal(after.min, 0.3);
  assert.equal(after.max, 0.9);
  assert.equal(after.alarm!.level, "一级");
  // 告警名称已废弃：写回时清掉残留值，名称统一由台账名称派生
  assert.equal(after.alarm!.name, undefined);
  assert.equal(after.alarm!.items!.length, 2, "多条告警项应保留");
  const rule = rulesOf(s).find((r) => r.pointId === pointOfTarget(s, t.id)!.id)!;
  // 等级按台账走
  assert.equal(rule.level, "一级");
  // 触发条件：点位规则的上下限来自台账判定口径（同源，见 alarmRules.rulesOf）
  assert.equal(rule.min, 0.3);
});

test("告警开关：停用后该台账不做异常判定", () => {
  let s = admin();
  const t = s.businessTargets!.find((b) => !!pointOfTarget(s, b.id))!;
  const pid = pointOfTarget(s, t.id)!.id;
  assert.equal(rulesOf(s).find((r) => r.pointId === pid)!.enabled, true);
  s = run(s, {
    type: "SAVE_ALARM_SETTING",
    targetId: t.id,
    setting: { ...settingOf(s, t), enabled: false },
  });
  assert.equal(rulesOf(s).find((r) => r.pointId === pid)!.enabled, false);
});

test("告警开关是总闸：已存规则在台账停用后同样不判定", () => {
  let s = admin();
  const t = s.businessTargets!.find((b) => !!pointOfTarget(s, b.id))!;
  const pid = pointOfTarget(s, t.id)!.id;
  // 先存一条规则版本（历史口径优先于台账）
  s = run(s, { type: "SAVE_ALARM_RULE", rule: { ...rulesOf(s).find((r) => r.pointId === pid)!, max: 0.95 } });
  assert.equal(rulesOf(s).find((r) => r.pointId === pid)!.enabled, true);
  s = run(s, {
    type: "SAVE_ALARM_SETTING",
    targetId: t.id,
    setting: { ...settingOf(s, t), enabled: false },
  });
  assert.equal(
    rulesOf(s).find((r) => r.pointId === pid)!.enabled,
    false,
    "台账侧开关停用后，已存规则不应继续判定",
  );
});

test("告警设置校验：告警项必填", () => {
  const s = admin();
  const t = s.businessTargets![0];
  const base = settingOf(s, t);
  assert.throws(
    () => run(s, { type: "SAVE_ALARM_SETTING", targetId: t.id, setting: { ...base, items: [] } }),
    /至少添加一条/,
  );
  assert.throws(
    () =>
      run(s, {
        type: "SAVE_ALARM_SETTING",
        targetId: t.id,
        setting: { ...base, items: [{ ...base.items[0], from: 9, to: 1 }] },
      }),
    /起始值/,
  );
  assert.throws(
    () => run(s, { type: "SAVE_ALARM_SETTING", targetId: "BT-NOT-EXIST", setting: base }),
    /台账不存在/,
  );
});

test("告警类别：同名冲突、被引用不可删、未被引用可删且启停生效", () => {
  const s = admin();
  // 取一条**已被台账引用**的分类（删除应被拦截）：类别口径改为二级后不再按序号假定
  const used = s.alarmClasses!.find((c) =>
    s.businessTargets!.some((b) => b.alarm?.category === c.name),
  )!;
  assert.throws(
    () =>
      run(s, {
        type: "SAVE_ALARM_CLASS",
        category: { id: "", name: used.name, main: "业务预警", enabled: true },
      }),
    /同名/,
  );
  assert.throws(() => run(s, { type: "REMOVE_ALARM_CLASS", id: used.id }), /引用/);

  const added = run(s, {
    type: "SAVE_ALARM_CLASS",
    category: { id: "", name: "临时分类", main: "机器人预警", enabled: true },
  });
  const tmp = alarmClassesOf(added).find((c) => c.name === "临时分类")!;
  assert.equal(tmp.main, "机器人预警");
  const off = run(added, {
    type: "SAVE_ALARM_CLASS",
    category: { ...tmp, enabled: false },
  });
  assert.equal(enabledAlarmClassesOf(off).some((c) => c.name === "临时分类"), false);
  // 只允许管理员维护告警类别
  const user = seed();
  user.roleId = "user";
  assert.throws(
    () => run(user, { type: "SAVE_ALARM_CLASS", category: tmp }),
    /仅管理员/,
  );
  const removed = run(off, { type: "REMOVE_ALARM_CLASS", id: tmp.id });
  assert.equal(alarmClassesOf(removed).some((c) => c.name === "临时分类"), false);
});

test("告警分类：告警项自己的两档枚举，与告警类型 / 告警大类互不干扰", () => {
  const s = admin();
  // 种子：仪表类目标 = 普通预警；环境 / 区域类目标 = 环境预警
  for (const t of s.businessTargets!) {
    const set = settingOf(s, t);
    for (const it of set.items)
      assert.equal(
        it.category,
        t.targetKind === "仪表" ? "普通预警" : "环境预警",
        `${t.id} 的告警分类应随目标类型`,
      );
  }
  // 老口径（存的是告警类别名称）打开时自动归一化
  const t = s.businessTargets![0];
  const legacy = {
    ...t,
    alarm: { ...t.alarm!, items: [{ ...t.alarm!.items![0], category: "生产运行" as never }] },
  };
  assert.equal(settingOf(s, legacy).items[0].category, "普通预警");
  assert.notEqual(withAlarmSetting(s, legacy), legacy, "老口径应被重写");
  // 非法分类被拦截（告警类别名称不能当告警分类用）
  assert.throws(
    () =>
      run(s, {
        type: "SAVE_ALARM_SETTING",
        targetId: t.id,
        setting: {
          ...settingOf(s, t),
          items: [{ ...t.alarm!.items![0], category: "生产运行" }],
        },
      }),
    /告警分类/,
  );
});

test("台账名称：自定义名优先、留空回派生，新增与修改都可落库", () => {
  const s = admin();
  const t = s.businessTargets!.find((b) => b.instrumentId)!;
  const insName = s.instruments!.find((x) => x.id === t.instrumentId)!.name!;
  // 留空 = 派生为「仪表名 · 算法」：同一台仪表的多条台账（不同算法）自然区分
  assert.equal(t.name, undefined);
  assert.equal(targetNameOf(s, t), `${insName} · ${t.algorithm}`);
  // 自定义名称优先生效：同一台仪表的多条台账据此区分
  assert.equal(targetNameOf(s, { ...t, name: "V001 出口压力表 · 读数" }), "V001 出口压力表 · 读数");

  // 新增：名称去空格后落库，ID 由系统生成
  const added = run(s, {
    type: "ADD_BUSINESS_TARGET",
    instrumentId: t.instrumentId,
    name: "  备用读数台账  ",
    requirementId: t.requirementId,
    algorithm: t.algorithm,
    judge: "数值范围",
    min: 0,
    max: 1,
  });
  const rec = added.businessTargets!.find((b) => b.name === "备用读数台账")!;
  assert.ok(rec, "新增时台账名称应去空格落库");
  assert.ok(rec.id.startsWith("BT"), "台账 ID 由系统生成");

  // 修改：置空 = 回到派生口径
  const renamed = run(added, {
    type: "UPDATE_BUSINESS_TARGET",
    id: rec.id,
    name: "",
  });
  const after = renamed.businessTargets!.find((b) => b.id === rec.id)!;
  assert.equal(after.name, undefined);
  assert.equal(targetNameOf(renamed, after), `${insName} · ${after.algorithm}`);
});

test("withAlarmSetting 幂等：已齐备的台账原样返回", () => {
  const s = seed();
  const t = s.businessTargets![0];
  assert.equal(withAlarmSetting(s, t), t);
  // 缺告警项的台账按现有判定口径补齐，且不改判定
  const legacy = { ...t, alarm: { level: "二级" as const } };
  const filled = withAlarmSetting(s, legacy);
  assert.equal(filled.alarm!.items!.length, 1);
  assert.equal(filled.alarm!.items![0].judge, legacy.judge);
  assert.equal(filled.judge, legacy.judge);
});

test("台账派生名：区域类没有仪表也没有锚点时用巡检要求名兜底（不再空着）", () => {
  const s = seed();
  const req = s.requirements![0];
  const name = derivedTargetNameOf(s, {
    instrumentId: undefined,
    anchor: "",
    algorithm: "实时气体",
    requirementId: req.id,
  });
  assert.ok(
    name.includes(req.name),
    `无仪表 / 锚点时应含巡检要求名，实际：${name}`,
  );
});
