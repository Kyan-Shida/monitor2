import type { State, Task, Robot, Result, Alarm } from "./types";
import { stages, atomicActionCapability } from "./types";
import { captureKindsOfPoint, robotCoversPoint } from "./deviceMaster";
export const terminal = ["完成", "部分完成", "失败", "取消", "超期"];
export const queueStates = ["已分配", "下发中", "待执行"];
export const robotColors: Record<string, string> = {
  空闲: "#31957f",
  执行中: "#3276c7",
  人工接管: "#8964b1",
  充电: "#c58e32",
  故障: "#bf5b53",
  离线: "#8794a3",
  暂停: "#c58e32",
  维护: "#a08a61",
};
export const logNames: Record<string, string> = {
  ASSIGN: "加入队列",
  DISPATCH: "任务下发",
  RECEIPT: "机器人接收",
  START: "开始 / 恢复任务",
  TICK: "自主阶段回报",
  PAUSE: "任务暂停",
  STOP: "任务终止",
  DELETE_TASK: "删除任务",
  FAIL: "执行失败",
  RETRY: "目标重试",
  SKIP: "跳过检测项",
  PREEMPT: "人工抢占",
  WITHDRAW: "撤回确认",
  REORDER: "队列调序",
  TAKEOVER: "申请人工接管",
  CONTROL_ACK: "暂停确认 / 接管",
  CONTROL: "人工操作回执",
  CONTROL_EXIT: "退出接管核对",
  CONTROL_RELEASE: "控制权释放",
  REVIEW: "结果复核",
  ALARM_LABEL: "告警处理",
  SAVE_ALARM_TEMPLATE: "告警模板配置",
  TASK_FINISHED: "机器人结束回报",
  QUICK_DISPATCH: "临时任务快速下发",
  EMERGENCY_STOP: "紧急停止",
  RECHARGE: "自动回充",
  POSTURE: "姿态动作",
  // ── 「地图 → 巡检任务」链路（阶段①~⑧）新增动作中文名 ──
  SURVEY_CAPTURE: "现场踩点",
  SURVEY_SYNC: "踩点离线同步",
  TRACK_RECORD: "轨迹录制",
  SET_MAP_IMAGE: "上传地图底图",
  CALIBRATE_FRAMES: "坐标标定",
  SET_MAP_LAYERS: "地图图层更新",
  IMPORT_DEVICES: "设备清单导入",
  SET_INSPECT_FLAG: "是否巡检开关",
  SET_DEVICE_STATE: "设备启停",
  ADD_BUSINESS_TARGET: "新增巡检目标台账",
  UPDATE_BUSINESS_TARGET: "巡检目标台账更新",
  SAVE_POINT: "保存巡检点",
  GEN_LOGICAL_POINTS: "生成逻辑点",
  BIND_LOGICAL_POINT: "逻辑点绑定",
  GEN_CANDIDATE_BY_SURVEY: "候选点·现场踩点",
  GEN_CANDIDATE_BY_COORD: "候选点·坐标反推",
  GEN_CANDIDATE_BY_AI: "候选点·AI 推荐",
  CLUSTER_CANDIDATES: "候选点聚类",
  TRIAL_RUN: "下发试采",
  TRIAL_RECEIPT: "试采回执",
  CONFIRM_POINT: "确认物理点",
  SAVE_ACTION_PLAN: "保存动作编排",
  SAVE_ROUTE: "保存路线",
  CALIBRATE: "点位重校准",
  MAP_SWITCH_ADD: "新增跨图切换点",
  MAP_SWITCH_REMOVE: "删除跨图切换点",
  MAP_SWITCH_STATE: "跨图切换点启停",
};
/**
 * 解析平台时间字符串
 * @description 兼容 "2026/9/24 20:53"（zh-CN locale）、"2026-09-24 20:53" 与 ISO 三种写法；
 *              结果查询的时间范围筛选与工作台「最近告警」排序共用它，避免各处自己写正则
 * @param x 时间字符串
 * @returns 时间戳；无法解析时返回 NaN
 */
export const parseTime = (x: string): number => {
  const m = x?.match(
    /(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/,
  );
  return m
    ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime()
    : Date.parse(x || "");
};

/**
 * 复检闭环时限（天）
 * @description 受理后超过该天数仍未闭环的告警，自动按「无效闭环」对待（口径见 verifyStateOf）
 */
export const VERIFY_DAYS = 30;
/**
 * 复检状态（派生值，随当前时间变化）
 * @description 「超过 30 天自动无效闭环」由这里派生，不写回告警数据：
 *              已闭环的按记录值展示；待反馈且已过时限的显示为「无效闭环」并标记超期；
 *              超期判定以**受理时间**（verify.startedAt）为起点，与处理时间同源
 * @param a 告警
 * @param now 当前时间戳（默认系统时间，测试可注入）
 * @returns 复检状态、剩余天数、是否超期自动判定
 */
export function verifyStateOf(a: Alarm, now = Date.now()) {
  const v = a.verify;
  if (!v)
    return { state: "未进入复检" as const, leftDays: 0, overdue: false };
  if (v.state !== "待反馈")
    return { state: v.state, leftDays: 0, overdue: false };
  const leftDays = Math.ceil(
    (parseTime(v.startedAt) + VERIFY_DAYS * 86400000 - now) / 86400000,
  );
  return leftDays > 0
    ? { state: "待反馈" as const, leftDays, overdue: false }
    : { state: "无效闭环" as const, leftDays: 0, overdue: true };
}
export const stageOf = (t?: Task) =>
  !t
    ? "—"
    : t.failure ||
      (["执行中", "暂停"].includes(t.state)
        ? stages[t.stage] || "待回报"
        : t.state);
export const queueFor = (s: State, rid: string) =>
  s.tasks.filter((t) => t.robotId === rid && queueStates.includes(t.state));
export const currentTask = (s: State, r: Robot) =>
  s.tasks.find((t) => t.id === r.current);
/**
 * 机器人执行队列
 * @description 平台无法估算机器人执行一次巡检需要多久（只掌握电量这类可实测信息），
 *              因此队列只表达「当前任务 → 后续任务的先后顺序」，不携带任何时间窗口：
 *              执行中 / 暂停的当前任务固定在最前，其余按队列顺序排列
 * @param s 状态
 * @param r 机器人
 * @returns 队列任务（第一项为当前任务；无任务时为空数组）
 */
export function robotQueue(s: State, r: Robot): Task[] {
  const cur = currentTask(s, r);
  const q = queueFor(s, r.id).filter((t) => t.id !== cur?.id);
  return cur ? [cur, ...q] : q;
}
export const pointOf = (s: State, r: Result) =>
  s.tasks
    .find((t) => t.id === r.taskId)
    ?.items.find((p) => p.id === r.pointId) ||
  s.points.find((p) => p.id === r.pointId);
/**
 * 单条巡检结果的业务判定（全局唯一口径）
 * @description 判定顺序固定为：无效 → 无效；其余按规则判定的 abnormal 定 异常 / 正常。
 *              异常即告警：判为异常的结果都会有一条对应的告警事件，不再有人工复核环节。
 * @param r 巡检结果
 * @returns 无效 / 异常 / 正常
 */
export const judgeOf = (r: Result): "无效" | "异常" | "正常" =>
  r.status === "无效" ? "无效" : r.abnormal ? "异常" : "正常";
/**
 * AI 状态：识别是否给出可用结论
 * @description AI 状态异常（识别结果为空 / 无有效读数 / 规则未配置）固定触发三级告警
 * @param r 巡检结果
 * @returns 正常 / 异常
 */
export const aiStateOf = (r: Result): "正常" | "异常" =>
  r.aiAbnormal ? "异常" : "正常";
/**
 * 风险信息：按检测项规则判定的风险
 * @description 风险异常按该检测项的风险等级触发一 / 二 / 三级告警
 * @param r 巡检结果
 * @returns 正常 / 异常
 */
export const riskStateOf = (r: Result): "正常" | "异常" =>
  r.abnormal ? "异常" : "正常";
/** 该检测项是否应有告警：AI 状态异常 或 风险信息异常（两者都正常只有检测记录） */
export const hasAlarm = (r: Result) => !!r.abnormal || !!r.aiAbnormal;
/**
 * 风险信息文案：正常 / 异常（原因）
 * @description 原因取自该结果采集时保存的规则快照（阈值 / 期望状态），
 *              避免用当前规则倒推历史判定；AI 状态异常时回落到未识别原因
 * @param r 巡检结果
 * @returns 「正常」或「异常（原因）」；无结果时返回「—」
 */
export const riskReasonOf = (r?: Result) => {
  if (!r) return "—";
  if (r.abnormal) {
    const rule = r.ruleSnapshot;
    if (rule?.type === "期望状态")
      return `异常（状态「${r.final}」不等于期望「${rule.expected}」）`;
    if (rule)
      return Number(r.final) > rule.max
        ? `异常（读数 ${r.final}${r.unit} 超出上限 ${rule.max}${rule.unit}）`
        : `异常（读数 ${r.final}${r.unit} 低于下限 ${rule.min}${rule.unit}）`;
    return `异常（读数 ${r.final}${r.unit} 超出阈值）`;
  }
  if (r.aiAbnormal) return `异常（${r.triggerReason || "AI 未识别出有效读数"}）`;
  return "正常";
};
/**
 * 告警阈值文案（取自结果保存的规则快照）
 * @param r 巡检结果
 * @returns 数值范围「min ~ max 单位」/ 期望状态「期望「开启」」；无快照时返回「—」
 */
export const thresholdOf = (r?: Result) => {
  const rule = r?.ruleSnapshot;
  if (!rule) return "—";
  return rule.type === "期望状态"
    ? `期望「${rule.expected}」`
    : `${rule.min} ~ ${rule.max} ${rule.unit || ""}`.trim();
};
/**
 * 识别结果文案：机器读取到的原始数据（不做判定表述，判定归「风险信息」）
 * @param r 巡检结果
 * @returns 如「压力读数 0.83 MPa」；无有效读数时给出占位说明
 */
export const readingOf = (r: Result) =>
  r.aiAbnormal
    ? r.triggerReason || "未识别出有效读数"
    : `${r.item} ${r.raw}${r.unit}`.trim();
/** 已判定为异常的结果（供各页统计"异常数"使用） */
export const isAbnormal = (r: Result) => judgeOf(r) === "异常";
export const deviceCode = (name: string) => name.split(" ")[0];
/**
 * 把任务 / 结果的时间统一显示为「MM-DD HH:mm」
 * 兼容两种来源：引擎写入的 `toLocaleString("zh-CN")` 与种子数据的 `2026-09-22 09:00`
 * @param value 时间字符串，空值或无法解析时返回占位符
 * @returns 格式化后的时间；无值时返回 "—"
 */
export const fmtTime = (value?: string) => {
  if (!value) return "—";
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return value;
  const d = new Date(ts),
    p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export function taskEvents(s: State, id?: string) {
  return s.logs
    .filter(
      (l) =>
        !id ||
        l.object === id ||
        s.sessions.some(
          (x) =>
            x.taskId === id && (x.id === l.object || l.detail.includes(x.id)),
        ),
    )
    .slice()
    .reverse();
}
export function checks(s: State, t: Task, r: Robot) {
  const m = s.maps.find((m) => m.id === t.mapId);
  const cur = currentTask(s, r);
  const q = queueFor(s, r.id).filter((x) => x.id !== t.id);
  return [
    {
      name: "区域匹配",
      pass: r.region === m?.region,
      detail: r.region + " / " + m?.region,
    },
    {
      // 采集方式口径（J′）：与引擎 constraints、计划绑定 bindingReasons 共用同一判定
      name: "检测能力",
      pass: t.items.every((p) => robotCoversPoint(s, p, r)),
      detail:
        [...new Set(t.items.flatMap((p) => captureKindsOfPoint(s, p)))].join(
          " / ",
        ) || "—",
    },
    {
      name: "原子动作能力",
      pass: (t.atomicActions || []).every((action) =>
        r.capabilities.includes(atomicActionCapability[action]),
      ),
      detail:
        (t.atomicActions || [])
          .map((action) => `${action}（${atomicActionCapability[action]}）`)
          .join(" / ") || "按检测项执行",
    },
    {
      name: "地图版本",
      pass: r.mapId === t.mapId && r.mapVersion === t.mapVersion,
      detail: `实际地图第 ${r.mapVersion} 版 → 要求地图第 ${t.mapVersion} 版`,
    },
    {
      name: "电量",
      pass: r.battery >= r.constraints.minBattery,
      detail: `${r.battery}% · ${r.deviceType}最低 ${r.constraints.minBattery}%`,
    },
    {
      name: "轨道占用",
      pass: !(
        r.deviceType === "挂轨" &&
        r.constraints.railSectionId &&
        s.railSections.some(
          (x) =>
            x.id === r.constraints.railSectionId &&
            !!x.robotId &&
            x.robotId !== r.id,
        )
      ),
      detail:
        r.deviceType === "挂轨"
          ? `区段 ${r.constraints.railSectionId || "—"}`
          : "非挂轨机型，不适用",
    },
    {
      name: "控制与运行状态",
      pass:
        !["离线", "故障", "维护", "人工接管", "充电"].includes(r.state) &&
        !s.sessions.some(
          (x) => x.robotId === r.id && !["已释放", "已超时"].includes(x.state),
        ),
      detail: r.state === "人工接管" ? "MANUAL · 独占中" : r.state,
    },
    {
      name: "点位可用",
      pass: t.items.every(
        (p) => s.points.find((q) => q.id === p.id)?.state === "已启用",
      ),
      detail: "业务启用 / 自主验证",
    },
    {
      name: "当前任务冲突",
      pass: !cur || cur.id === t.id,
      detail:
        cur && cur.id !== t.id ? `${cur.id} · 执行中，需等待其结束` : "无当前冲突",
    },
    {
      name: "后续队列",
      pass: q.length === 0,
      detail: q.length ? `${q.length} 个任务排队中` : "无排队任务",
    },
  ];
}
