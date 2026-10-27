/**
 * @file logCenter.ts
 * @description 日志中心的三类日志模型与 Mock 数据（各 20 条）：系统操作 / 任务运行 / 机器人操作
 * @interaction 被 pages/LogCenter.tsx、components/LogTable.tsx、components/LogDetail.tsx 消费
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** n 小时前的本地时间戳：YYYY-MM-DD HH:mm:ss */
function ago(hours: number): string {
  const d = new Date(Date.now() - hours * 3_600_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 在基准时间上偏移 n 分钟 */
function after(base: string, minutes: number): string {
  const d = new Date(base.replace(" ", "T"));
  d.setMinutes(d.getMinutes() + minutes);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/* ── 系统操作日志 ── */
export interface SysLog {
  id: string;
  time: string;
  operator: string;
  employeeNo: string;
  ip: string;
  module: string;
  type: "新增" | "修改" | "删除" | "导出";
  status: "成功" | "失败";
  duration: number;
  detail: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
}

const SYS_OPERATORS = [
  { name: "Admin", no: "EMP-0012" },
  { name: "老周", no: "EMP-0087" },
  { name: "李工", no: "EMP-0103" },
  { name: "赵敏", no: "EMP-0216" },
  { name: "系统", no: "SYS" },
];
const SYS_MODULES = [
  "角色权限",
  "巡检计划",
  "机器人管理",
  "告警设置",
  "数据导出",
  "系统参数",
];
const SYS_TYPES: SysLog["type"][] = ["新增", "修改", "删除", "导出"];
const SYS_DETAILS = [
  "修改角色「调度员」的数据范围与按钮权限，涉及 3 个页面、6 个按钮",
  "新增角色「夜班巡检员」，复制自「巡检主管」并调整数据范围",
  "导出巡检结果报表（第 42 周），条件：华东大区 / 全部设备 / 含异常项",
  "删除角色「临时观察员」，该角色未关联任何成员",
  "修改系统参数「告警去重窗口」由 30s 调整为 60s",
  "批量导出机器人台账 24 条，字段：SN / 型号 / 固件 / 地图版本",
  `导出文件名 <script>alert("xss")</script>.xlsx 被安全策略拦截`,
  "修改告警设置「罐区压力上限」由 0.8 MPa 调整为 0.75 MPa",
  "新增巡检计划「装置区夜间红外巡检」，生效时间 22:00–05:00",
  "删除过期巡检计划「国庆临时巡检」，共 3 条任务关联",
  "导出接口日志 1 200 条，时间窗 2026-10-12 至 2026-10-18",
  "修改机器人「巡检车-02」的地图版本绑定：V7 → V8",
  "批量导入设备台账 56 条，其中 2 条因编号重复被跳过",
  '修改用户「周宁」的部门归属：调度中心 → 生产二部',
  "新增告警推送人员「吴桐」，推送范围：华东大区 / 罐区设备组",
  "导出审计报表，条件：高危操作 / 最近 7 天",
  "删除失效的算法模板「旧版气体判读」，已被 0 条台账引用",
  "修改系统参数「会话超时」由 30 分钟调整为 15 分钟",
  "新增角色「只读观察员」，套用查看 / 导出两类按钮",
  "导出机器人健康报表，含电量、里程、故障码三组指标",
];

const SYS_DIFFS = [
  {
    oldData: {
      角色名称: "调度员",
      数据范围: "本部门数据",
      可见页面: 21,
      按钮权限: 82,
      审批权限: "临时插单审批",
    },
    newData: {
      角色名称: "调度员",
      数据范围: "仅本人数据",
      可见页面: 23,
      按钮权限: 88,
      审批权限: "临时插单审批",
    },
  },
  {
    oldData: {
      参数名: "告警去重窗口",
      值: "30s",
      生效范围: "全租户",
      更新人: "老周",
    },
    newData: {
      参数名: "告警去重窗口",
      值: "60s",
      生效范围: "全租户",
      更新人: "Admin",
    },
  },
  {
    oldData: { 点位: "P-1024", 告警上限: "0.80 MPa", 级别: "二级" },
    newData: { 点位: "P-1024", 告警上限: "0.75 MPa", 级别: "一级" },
  },
];

export const SYS_LOGS: SysLog[] = Array.from({ length: 20 }, (_, i) => {
  const op = SYS_OPERATORS[i % SYS_OPERATORS.length];
  const module = SYS_MODULES[i % SYS_MODULES.length];
  const type = SYS_TYPES[i % SYS_TYPES.length];
  const failed = i % 7 === 3 || i === 6;
  const duration = 18 + ((i * 137) % 3180);
  const diff = SYS_DIFFS[i % SYS_DIFFS.length];
  return {
    id: `SYS-20261019-${pad(i + 1)}`,
    time: ago(i * 4 + 1),
    operator: op.name,
    employeeNo: op.no,
    ip: `10.20.${31 + (i % 5)}.${56 + i}`,
    module,
    type,
    status: failed ? "失败" : "成功",
    duration,
    detail: SYS_DETAILS[i],
    ...(type === "修改" ? diff : {}),
    request: {
      method: type === "导出" ? "POST" : "PUT",
      path: `/api/v1/${module === "角色权限" ? "roles" : "configs"}/${i + 1}`,
      operator: `${op.name}(${op.no})`,
      ip: `10.20.${31 + (i % 5)}.${56 + i}`,
      body: { id: `OBJ-${1000 + i}`, action: type, payload: { note: SYS_DETAILS[i] } },
    },
    response: failed
      ? { code: 403, message: "permission denied: 当前角色缺少该操作权限", elapsed: duration }
      : { code: 0, message: "ok", elapsed: duration },
  };
});

/* ── 任务运行日志 ── */
export interface TaskStep {
  name: string;
  status: "成功" | "失败" | "运行中";
  at: string;
  message?: string;
}
export interface TaskLog {
  id: string;
  name: string;
  type: "定时" | "手动";
  executor: string;
  start: string;
  end: string;
  duration: string;
  status: "成功" | "失败" | "运行中" | "超时";
  steps: TaskStep[];
  request: Record<string, unknown>;
  response: Record<string, unknown>;
}

const TASK_NAMES = [
  "华东区夜间巡检",
  "罐区早班压力检测",
  "装置区管廊气体巡检",
  "泵房设备温度巡检",
  "全厂区例行巡检",
];

function buildSteps(start: string, status: TaskLog["status"]): TaskStep[] {
  const steps: TaskStep[] = [
    { name: "任务下发", status: "成功", at: start },
    { name: "机器人唤醒 / 自检", status: "成功", at: after(start, 1) },
    { name: "路径规划", status: "成功", at: after(start, 2) },
    {
      name: "点位采集",
      status: "成功",
      at: after(start, 6),
      message: "已完成 28/28 个点位采集",
    },
    { name: "结果回传", status: "成功", at: after(start, 12) },
  ];
  if (status === "失败")
    steps[2] = {
      name: "路径规划",
      status: "失败",
      at: after(start, 3),
      message:
        '位置点 A（东北角管廊）无法到达：路径被临时围挡阻断，重规划 3 次均失败；详情见 "plan.log"',
    };
  if (status === "超时")
    steps[3] = {
      name: "点位采集",
      status: "失败",
      at: after(start, 9),
      message: "采集超时：等待机器人响应超过 120s，已自动中止任务",
    };
  if (status === "运行中")
    steps[3] = {
      name: "点位采集",
      status: "运行中",
      at: after(start, 5),
      message: "正在采集第 12/28 个点位（P-1036 泵体温度）",
    };
  return steps;
}

const TASK_STATUS: TaskLog["status"][] = [
  "成功",
  "成功",
  "失败",
  "成功",
  "超时",
  "运行中",
  "成功",
  "失败",
];

export const TASK_LOGS: TaskLog[] = Array.from({ length: 20 }, (_, i) => {
  const st = i === 0 ? "运行中" : TASK_STATUS[i % TASK_STATUS.length];
  const start = ago(i * 5 + 2);
  const minutes = 8 + ((i * 7) % 46);
  const duration =
    st === "运行中" ? `进行中（${minutes} 分钟）` : `${minutes} 分 ${(i * 13) % 60} 秒`;
  return {
    id: `TASK-202610${pad(19 - Math.floor(i / 5))}-${pad(i + 1)}`,
    name: TASK_NAMES[i % TASK_NAMES.length],
    type: i % 3 === 0 ? "手动" : "定时",
    executor: i % 2 === 0 ? "系统调度" : `机器人 ${["R-03", "R-07", "R-11"][i % 3]}`,
    start,
    end: st === "运行中" ? "—" : after(start, minutes),
    duration,
    status: st,
    steps: buildSteps(start, st),
    request: {
      taskId: `TASK-${i + 1}`,
      trigger: i % 3 === 0 ? "manual(Admin)" : "cron(0 22 * * *)",
      robot: `R-0${(i % 3) + 1}`,
      route: `RT-${100 + i}`,
      points: 28,
    },
    response: {
      code: st === "成功" || st === "运行中" ? 0 : 5001,
      message:
        st === "失败"
          ? "path_unreachable: 位置点 A 被遮挡"
          : st === "超时"
            ? "timeout: 指令响应超过 120s"
            : "ok",
      pointsDone: st === "成功" ? 28 : st === "运行中" ? 12 : 0,
    },
  };
});

/* ── 任务运行日志：事件流（日志编码 / 日志信息 / 日志时间） ── */
export interface TaskLogEntry {
  id: string;
  /** 日志编码：事件类型（巡检任务开始 / 巡检项停止 / 巡检任务结束） */
  code: string;
  /** 日志信息 */
  message: string;
  time: string;
  /** 归属任务（详情展示执行节点用） */
  taskId: string;
}

/**
 * 由任务派生日志条目：一个任务产生「开始 → 巡检项停止 → 结束」多条，
 * 按时间倒序展示（最新事件在最上面）
 */
export const TASK_LOG_ENTRIES: TaskLogEntry[] = TASK_LOGS.flatMap((t) => {
  const batch = t.id.replace(/\D/g, "").slice(-12) || "17688075571";
  const start: TaskLogEntry = {
    id: `${t.id}-S`,
    code: "巡检任务开始",
    message: `巡检任务启动[任务批次:${batch}]`,
    time: t.start,
    taskId: t.id,
  };
  const stop: TaskLogEntry = {
    id: `${t.id}-P`,
    code: "巡检项停止",
    message: `${batch}:51#${t.name} · 点位采集结束（28/28）`,
    time: after(t.start, 4),
    taskId: t.id,
  };
  if (t.end === "—") return [start, stop];
  const end: TaskLogEntry = {
    id: `${t.id}-E`,
    code: "巡检任务结束",
    message:
      t.status === "失败"
        ? `巡检任务中止[任务批次:${batch}]，原因：位置点 A 被临时围挡阻断`
        : t.status === "超时"
          ? `巡检任务超时[任务批次:${batch}]，指令响应超过 120s，已自动中止`
          : `巡检任务完成[任务批次:${batch}]，共 28 个点位`,
    time: t.end,
    taskId: t.id,
  };
  return [start, stop, end];
}).sort((a, b) => (a.time < b.time ? 1 : -1));

/* ── 机器人操作日志 ── */
export interface RobotLog {
  id: string;
  time: string;
  operator: string;
  sn: string;
  robotName: string;
  type: "接管" | "遥控" | "急停" | "固件升级" | "指令下发";
  level: "普通" | "高危";
  result: "成功" | "失败";
  source: "Web端" | "APP端" | "后台脚本";
  command: Record<string, unknown>;
  response: Record<string, unknown>;
}

const ROBOTS = [
  { sn: "SN-RB-2024-0031", name: "巡检车-01" },
  { sn: "SN-RB-2024-0032", name: "巡检车-02" },
  { sn: "SN-RB-2023-0017", name: "挂轨机器人-A" },
  { sn: "SN-RB-2025-0008", name: "防爆巡检车-B" },
];
const ROBOT_TYPES: RobotLog["type"][] = [
  "接管",
  "遥控",
  "急停",
  "固件升级",
  "指令下发",
];
const ROBOT_SOURCES: RobotLog["source"][] = ["Web端", "APP端", "后台脚本"];

export const ROBOT_LOGS: RobotLog[] = Array.from({ length: 20 }, (_, i) => {
  const robot = ROBOTS[i % ROBOTS.length];
  const type = ROBOT_TYPES[i % ROBOT_TYPES.length];
  const level: RobotLog["level"] =
    type === "急停" || type === "接管" || type === "固件升级" ? "高危" : "普通";
  const failed = i % 6 === 4;
  const operator = i % 4 === 2 ? "系统" : SYS_OPERATORS[i % 4].name;
  const source = operator === "系统" ? "后台脚本" : ROBOT_SOURCES[i % 3];
  return {
    id: `RBT-20261019-${pad(i + 1)}`,
    time: ago(i * 3 + 1),
    operator,
    sn: robot.sn,
    robotName: robot.name,
    type,
    level,
    result: failed ? "失败" : "成功",
    source,
    command: {
      cmd:
        type === "急停"
          ? "ROBOT_ESTOP"
          : type === "接管"
            ? "TAKEOVER_REQUEST"
            : type === "遥控"
              ? "REMOTE_MOVE"
              : type === "固件升级"
                ? "FIRMWARE_UPGRADE"
                : "TASK_DISPATCH",
      seq: 88_000 + i * 17,
      robotSn: robot.sn,
      params: {
        mode: type === "急停" ? "soft" : "normal",
        speed: type === "遥控" ? 0.4 : undefined,
        reason: type === "急停" ? "现场人员进入作业区" : undefined,
        note: `操作来源：${source}；操作人：${operator}`,
      },
    },
    response: failed
      ? { code: 4102, message: "robot_busy: 机器人正在执行任务，指令被拒绝" }
      : { code: 0, message: "accepted", ack: `${type}_ACK`, latency: 28 + i },
  };
});
