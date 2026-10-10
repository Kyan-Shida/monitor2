import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run } from "./engine";
import { rulesOf } from "./alarmRules";
import { templateRefCountOf, templatesOf } from "./alarmTemplates";
import { verifyStateOf, parseTime } from "./selectors";
import type { State } from "./types";

/** 把任务复位到"采集第一个检测项"：连续确认需要在同一点位上累积多次读数 */
function tick(base: State, a: Record<string, unknown>) {
  const t = base.tasks.find((x) => x.id === "T009")!;
  t.stage = 6;
  t.index = 0;
  return run(base, { type: "TICK", id: "T009", ...a });
}

test("台账关联告警模板：点位规则按关联模板判定（可换模板）", () => {
  const s = seed();
  // 台账按检测类型带出默认关联（P001 压力仪表 → 压力超限告警 TPL-01）
  assert.equal(
    s.businessTargets!.find((b) => b.id === "BT-II-V001-P")!.alarm!.templateId,
    "TPL-01",
  );
  assert.equal(rulesOf(s).find((r) => r.pointId === "P001")!.templateId, "TPL-01");
  // 关联改到「压力波动确认告警（连续 2 次）」：规则触发逻辑跟着变（先启用该模板）
  const tpl5 = templatesOf(s).find((t) => t.id === "TPL-05")!;
  let next = run(s, {
    type: "SAVE_ALARM_TEMPLATE",
    template: { ...tpl5, enabled: true },
  });
  const bt = next.businessTargets!.find((b) => b.id === "BT-II-V001-P")!;
  next = run(next, {
    type: "UPDATE_BUSINESS_TARGET",
    id: bt.id,
    alarm: { ...bt.alarm!, templateId: "TPL-05" },
  });
  const switched = rulesOf(next).find((r) => r.pointId === "P001")!;
  assert.equal(switched.templateId, "TPL-05");
  assert.equal(switched.triggerMode, "连续确认");
});

test("后台管理的告警模板随种子下发，点位规则引用启用模板", () => {
  const s = seed();
  assert.ok(templatesOf(s).length >= 4);
  // 未绑巡检目标台账的点位 / 已配置台账的点位都带上模板引用（触发逻辑由模板统一下发）
  const rule = rulesOf(s).find((r) => r.pointId === "P001")!;
  assert.equal(rule.templateId, "TPL-01");
  assert.equal(rule.triggerMode, "单次即触发");
  // 模板影响面：按「台账 + 点位规则」统计引用处数（页面据此提示"改了会影响哪"）
  assert.ok(templateRefCountOf(s, "TPL-01") >= 1);
  assert.ok(
    templateRefCountOf(s, "TPL-02") + rulesOf(s).filter((r) => r.templateId === "TPL-02").length >
      0,
  );
});

test("模板保存为版本、仅管理员可改，且不新增重复条目", () => {
  const s = seed();
  const tpl = templatesOf(s)[0];
  assert.throws(
    () =>
      run(
        { ...s, roleId: "user" },
        { type: "SAVE_ALARM_TEMPLATE", template: tpl },
      ),
    /仅管理员/,
  );
  const next = run(s, {
    type: "SAVE_ALARM_TEMPLATE",
    template: { ...tpl, flow: ["现场确认", "记录处理结果"] },
  });
  const saved = templatesOf(next).find((t) => t.id === tpl.id)!;
  assert.equal(saved.version, tpl.version + 1);
  assert.deepEqual(saved.flow, ["现场确认", "记录处理结果"]);
  assert.equal(templatesOf(next).length, templatesOf(s).length);
});

test("连续确认：连续 N 次超限才触发告警，未达次数只留结果", () => {
  let s = seed();
  const tpl = templatesOf(s).find((t) => t.id === "TPL-01")!;
  s = run(s, {
    type: "SAVE_ALARM_TEMPLATE",
    template: {
      ...tpl,
      trigger: { ...tpl.trigger, mode: "连续确认", consecutive: 2 },
    },
  });
  assert.equal(
    rulesOf(s).find((r) => r.pointId === "P001")!.triggerMode,
    "连续确认",
  );
  s.alarms = [];
  // 先采一条正常读数：断开种子里的历史超限记录，得到确定的连续链
  s = tick(s, { abnormal: false });
  assert.equal(s.results[0].abnormal, false);
  // 第 1 次超限：记录结果，不生成告警
  s = tick(s, { abnormal: true });
  assert.equal(s.results[0].abnormal, true);
  assert.equal(s.alarms.length, 0);
  // 中间采到正常读数 → 连续链断开，下一次超限重新计数
  s = tick(s, { abnormal: false });
  s = tick(s, { abnormal: true });
  assert.equal(s.alarms.length, 0);
  // 连续第 2 次仍超限：达门槛才生成告警，并留痕引用的模板
  s = tick(s, { abnormal: true });
  assert.equal(s.alarms.length, 1);
  assert.equal(s.alarms[0].pointId, "P001");
  assert.ok(s.alarms[0].notes.some((n) => n.includes("引用模板 TPL-01")));
  // 模板里的声光报警时长随告警下发（TPL-01 = 10 秒）
  assert.ok(s.alarms[0].notes.some((n) => n.includes("声光报警 10 秒")));
});

test("受理后进入反馈（复检）流程：保存即由系统判定是否有效闭环", () => {
  let s = seed();
  // AL012 未处理（业务告警，点位 P001 引用模板 TPL-01）
  s = run(s, {
    type: "ALARM_LABEL",
    id: "AL012",
    reason: "现场确认压力表读数与识别一致",
    result: "受理",
    falsePositive: false,
  });
  const al = s.alarms.find((a) => a.id === "AL012")!;
  assert.ok(al.verify, "受理后应自动进入复检流程");
  assert.equal(al.verify!.state, "待反馈");
  const total = al.verify!.steps.length;
  assert.ok(total >= 2, "复检清单应来自处置流程（不少于 2 步）");
  assert.ok(al.verify!.steps.every((x) => !x.done));
  // 只勾部分步骤保存：完成情况落库（带完成时间），仍为「待反馈」——系统不判有效
  const partial = run(s, {
    type: "ALARM_VERIFY",
    id: "AL012",
    done: [0, 1],
    reason: "已完成前两步",
  });
  const mid = partial.alarms.find((a) => a.id === "AL012")!.verify!;
  assert.equal(mid.state, "待反馈");
  assert.deepEqual(
    mid.steps.map((x) => x.done),
    [true, true, ...Array(total - 2).fill(false)],
  );
  assert.ok(mid.steps[0].at);
  assert.equal(mid.steps.at(-1)!.at, undefined);
  // 处置流程全部勾选完成保存 → 系统判定「有效闭环」（复检说明可选）
  const all = Array.from({ length: total }, (_, i) => i);
  const closed = run(partial, { type: "ALARM_VERIFY", id: "AL012", done: all });
  const done = closed.alarms.find((a) => a.id === "AL012")!.verify!;
  assert.equal(done.state, "有效闭环");
  assert.ok(done.closedAt);
  assert.ok(done.note);
  // 已闭环不可重复提交
  assert.throws(
    () => run(closed, { type: "ALARM_VERIFY", id: "AL012", done: all }),
    /已闭环/,
  );
});

test("无效闭环：没反馈 / 超 30 天由系统判定，且不可再提交", () => {
  const s = run(seed(), {
    type: "ALARM_LABEL",
    id: "AL012",
    reason: "现场确认中，等待复检",
    result: "受理",
    falsePositive: false,
  });
  const al = s.alarms.find((a) => a.id === "AL012")!;
  const start = parseTime(al.verify!.startedAt);
  // 第 1 天：仍在时限内 → 待反馈（并给出剩余天数）
  const day1 = verifyStateOf(al, start + 86400000);
  assert.equal(day1.state, "待反馈");
  assert.equal(day1.leftDays, 29);
  // 第 31 天仍未反馈 → 自动判定无效闭环
  const late = start + 31 * 86400000;
  const over = verifyStateOf(al, late);
  assert.equal(over.state, "无效闭环");
  assert.equal(over.overdue, true);
  // 超期后不再接受反馈
  assert.throws(
    () => run(s, { type: "ALARM_VERIFY", id: "AL012", done: [0], now: late }),
    /无效闭环/,
  );
});

test("忽略不进复检；种子里的复检口径（待反馈 / 有效闭环 / 超期无效）", () => {
  const ignored = run(seed(), {
    type: "ALARM_LABEL",
    id: "AL012",
    reason: "波动在工艺允许区间内",
    result: "忽略",
    falsePositive: false,
  });
  assert.equal(ignored.alarms.find((a) => a.id === "AL012")!.verify, undefined);

  const s = seed();
  // AL017：受理于 33 天前且未闭环 → 派生出「无效闭环」
  const over = verifyStateOf(s.alarms.find((a) => a.id === "AL017")!);
  assert.equal(over.state, "无效闭环");
  assert.equal(over.overdue, true);
  // AL016：处置流程全部完成 → 按记录值展示「有效闭环」
  const ok = verifyStateOf(s.alarms.find((a) => a.id === "AL016")!);
  assert.equal(ok.state, "有效闭环");
  assert.equal(ok.overdue, false);
  // AL007：受理后待反馈 → 给出剩余天数（30 天时限内）
  const open = verifyStateOf(s.alarms.find((a) => a.id === "AL007")!);
  assert.equal(open.state, "待反馈");
  assert.ok(open.leftDays > 0 && open.leftDays <= 30);
});
