import type { State, Task, Robot, Result } from "./types";
import { stages, atomicActionCapability } from "./types";
import { hasMobility } from "./deviceProfile";
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
  ALARM_ACK: "告警确认",
  RECHECK: "复查任务生成",
  ALARM_CLOSE: "告警关闭",
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
  REVIEW_DEVICE_IMPORT: "设备清单审核",
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
export const minutesLeft = (t?: Task) =>
  t
    ? Math.max(
        2,
        Math.ceil(
          t.duration *
            (1 - (t.index + (t.stage || 0) / stages.length) / t.items.length),
        ),
      )
    : 0;
export const pointOf = (s: State, r: Result) =>
  s.tasks
    .find((t) => t.id === r.taskId)
    ?.items.find((p) => p.id === r.pointId) ||
  s.points.find((p) => p.id === r.pointId);
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
export const timeAt = (minutes: number) => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
};
export interface Window {
  id: string;
  kind: "task" | "charging" | "maintenance";
  start: number;
  end: number;
  label: string;
  task?: Task;
}
export function schedule(s: State, r: Robot): Window[] {
  const out: Window[] = [];
  let cursor = 0;
  const cur = currentTask(s, r);
  if (cur) {
    const end = minutesLeft(cur);
    out.push({
      id: cur.id,
      kind: "task",
      start: 0,
      end,
      label: cur.name,
      task: cur,
    });
    cursor = end;
  }
  if (r.state === "充电") {
    out.push({
      id: r.id + "charge",
      kind: "charging",
      start: cursor,
      end: cursor + 45,
      label: "充电窗口（估计）",
    });
    cursor += 45;
  }
  const q = queueFor(s, r.id);
  let mv = `${r.mapId}/${r.mapVersion}/${r.pointSet}`;
  for (const t of q) {
    const target = `${t.mapId}/${t.mapVersion}/${t.pointSet}`;
    if (mv !== target) {
      out.push({
        id: t.id + "sync",
        kind: "maintenance",
        start: cursor,
        end: cursor + 15,
        label: "地图 / 点位同步窗口",
      });
      cursor += 15;
      mv = target;
    }
    out.push({
      id: t.id,
      kind: "task",
      start: cursor,
      end: cursor + t.duration,
      label: t.name,
      task: t,
    });
    cursor += t.duration;
  }
  return out;
}
export function robotAvailability(s: State, r: Robot) {
  if (["离线", "故障", "人工接管", "维护"].includes(r.state))
    return "待处理后评估";
  const windows = schedule(s, r);
  const end = windows.at(-1)?.end || 0;
  return end ? `${timeAt(end)}（约${end}分钟后）` : "现在";
}
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
      name: "移动能力",
      pass: hasMobility(r.mobility, t.requiredMobility),
      detail:
        (t.requiredMobility || []).join(" / ") ||
        `${r.deviceType}：${r.mobility.join(" / ")}`,
    },
    {
      name: "地图版本",
      pass: r.mapId === t.mapId && r.mapVersion === t.mapVersion,
      detail: `实际 m${r.mapVersion} → 要求 m${t.mapVersion}`,
    },
    {
      name: "点位版本",
      pass: r.pointSet === t.pointSet,
      detail: `实际 p${r.pointSet} → 要求 p${t.pointSet}`,
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
        cur && cur.id !== t.id
          ? `${cur.id} · 剩余约${minutesLeft(cur)}分钟`
          : "无当前冲突",
    },
    {
      name: "后续队列",
      pass: q.length === 0,
      detail: q.length
        ? `${q.length}个任务，末尾约${robotAvailability(s, r)}`
        : "无排队任务",
    },
  ];
}
