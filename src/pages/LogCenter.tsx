/**
 * @file LogCenter.tsx
 * @description 日志中心：系统操作日志 / 任务运行日志 / 机器人操作日志 / 接口日志（顶部页签切换）；
 *              平台管理视角下只看平台侧留痕，仅保留系统操作日志
 * @interaction 由 pages/Supporting.tsx 在 page === "audit" 时渲染；表格见 components/LogTable.tsx
 */
import { useState } from "react";
import { Badge, Btn, Panel } from "../components/UI";
import { Pager } from "../components/Business";
import { LogTable, type LogColumn } from "../components/LogTable";
import { Segmented } from "../components/Segmented";
import { downloadXlsx } from "../data/excel";
import { usePageSize } from "../data/navigation";
import { useStore } from "../data/store";
import { InterfaceLog } from "./InterfaceLog";
import {
  ROBOT_LOGS,
  SYS_LOGS,
  TASK_LOG_ENTRIES,
  type RobotLog,
  type SysLog,
  type TaskLogEntry,
} from "../data/logCenter";

type TabKey = "sys" | "task" | "robot" | "interface";

const TABS: { key: TabKey; label: string }[] = [
  { key: "sys", label: "系统操作日志" },
  { key: "task", label: "任务运行日志" },
  { key: "robot", label: "机器人操作日志" },
  { key: "interface", label: "接口日志" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const toInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** 默认时间范围：最近 7 天（含今天） */
function defaultRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 0, 0);
  return { start: toInput(start), end: toInput(end) };
}

const DEFAULT_RANGE = defaultRange();

interface Query {
  start: string;
  end: string;
  status: string;
  kw: string;
}

/** 日志页通用骨架：筛选 + 表格 + 分页 */
function LogPage<T extends { id: string }>({
  id,
  rows,
  columns,
  statusOptions,
  statusOf,
  timeOf,
  searchOf,
  filename,
  sheet,
  unit,
}: {
  id: string;
  rows: T[];
  columns: LogColumn<T>[];
  /** 不传则不展示「状态」筛选项 */
  statusOptions?: string[];
  statusOf?: (r: T) => string;
  timeOf: (r: T) => string;
  searchOf: (r: T) => string;
  filename: string;
  sheet: string;
  unit: string;
}) {
  const initial: Query = {
    start: DEFAULT_RANGE.start,
    end: DEFAULT_RANGE.end,
    status: "全部",
    kw: "",
  };
  const [applied, APPLIED] = useState<Query>(initial);
  const [draft, DRAFT] = useState<Query>(initial);
  const [page, PAGE] = useState(1);
  const [size, SIZE] = usePageSize(id + ".size", 10);
  const [filterOpen, OPENFILTER] = useState(false);

  const filtered = rows.filter((r) => {
    // 统一为 datetime-local 的 T 分隔格式，避免空格与 T 的字典序错位
    const t = timeOf(r).slice(0, 16).replace(" ", "T");
    if (t < applied.start || t > applied.end) return false;
    if (
      statusOptions &&
      statusOf &&
      applied.status !== "全部" &&
      statusOf(r) !== applied.status
    )
      return false;
    return !applied.kw || searchOf(r).includes(applied.kw);
  });
  const max = Math.max(1, Math.ceil(filtered.length / size));
  const cur = Math.min(page, max);
  const shown = filtered.slice((cur - 1) * size, cur * size);

  /** 生效条件数：时间偏离默认 + 状态 + 关键词 */
  const filterCount =
    (statusOptions && applied.status !== "全部" ? 1 : 0) +
    (applied.kw.trim() ? 1 : 0) +
    (applied.start !== DEFAULT_RANGE.start ||
    applied.end !== DEFAULT_RANGE.end
      ? 1
      : 0);

  /** 展开时用生效值回填，避免上次未提交的草稿残留 */
  function toggleFilter() {
    if (!filterOpen) DRAFT(applied);
    OPENFILTER(!filterOpen);
  }
  function apply() {
    APPLIED(draft);
    PAGE(1);
    OPENFILTER(false);
  }
  function reset() {
    DRAFT(initial);
    APPLIED(initial);
    PAGE(1);
  }

  /** 导出当前筛选结果（全量，不受分页限制） */
  function exportExcel() {
    const cols = columns.filter((c) => c.text);
    const aoa = [
      cols.map((c) => c.head),
      ...filtered.map((r) => cols.map((c) => c.text!(r))),
    ];
    const d = new Date();
    downloadXlsx(
      aoa,
      sheet,
      `${filename}_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`,
    );
  }

  return (
    <Panel
      className="panel-filters-wrap"
      title={sheet}
      extra={
        <div className="actions">
          <Btn onClick={toggleFilter}>
            {filterOpen ? "收起筛选" : "筛选"}
            {filterCount ? `（${filterCount}）` : ""}
          </Btn>
          <Btn onClick={exportExcel}>导出 Excel</Btn>
        </div>
      }
    >
      {filterOpen && (
        <div className="filter-panel log-filter">
          <label className="fp-field">
            <span>
              开始时间<em className="req">*</em>
            </span>
            <input
              type="datetime-local"
              value={draft.start}
              onChange={(e) => DRAFT({ ...draft, start: e.target.value })}
            />
          </label>
          <label className="fp-field">
            <span>
              结束时间<em className="req">*</em>
            </span>
            <input
              type="datetime-local"
              value={draft.end}
              onChange={(e) => DRAFT({ ...draft, end: e.target.value })}
            />
          </label>
          {statusOptions && statusOf && (
            <label className="fp-field">
              <span>状态</span>
              <select
                value={draft.status}
                onChange={(e) => DRAFT({ ...draft, status: e.target.value })}
              >
                {["全部", ...statusOptions].map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="fp-field fp-wide">
            <span>关键字</span>
            <input
              placeholder="支持 ID / 名称 / 操作人模糊匹配"
              value={draft.kw}
              onChange={(e) => DRAFT({ ...draft, kw: e.target.value })}
            />
          </label>
          <div className="fp-actions">
            <Btn onClick={reset}>重置</Btn>
            <Btn primary disabled={!draft.start || !draft.end} onClick={apply}>
              查询
            </Btn>
          </div>
        </div>
      )}

      <LogTable columns={columns} rows={shown} />
      <Pager
        page={cur}
        count={filtered.length}
        size={size}
        unit={unit}
        sizes={[10, 20, 50]}
        onChange={PAGE}
        onSize={(n) => {
          SIZE(n);
          PAGE(1);
        }}
      />
    </Panel>
  );
}

/* ── 系统操作日志 ── */
function SysLogPage() {
  const columns: LogColumn<SysLog>[] = [
    {
      key: "time",
      head: "操作时间",
      width: 190,
      render: (r) => r.time,
      text: (r) => r.time,
    },
    {
      key: "operator",
      head: "操作人",
      width: 130,
      render: (r) => `${r.operator}（${r.employeeNo}）`,
      text: (r) => `${r.operator}（${r.employeeNo}）`,
    },
    { key: "ip", head: "IP 地址", width: 110, render: (r) => r.ip, text: (r) => r.ip },
    {
      key: "module",
      head: "操作模块",
      width: 105,
      render: (r) => r.module,
      text: (r) => r.module,
    },
    {
      key: "detail",
      head: "操作内容",
      width: 320,
      render: (r) => r.detail,
      text: (r) => r.detail,
    },
  ];

  return (
    <LogPage
      id="log.sys"
      rows={SYS_LOGS}
      columns={columns}
      timeOf={(r) => r.time}
      searchOf={(r) => r.id + r.time + r.operator + r.employeeNo + r.module + r.detail}
      filename="系统操作日志"
      sheet="系统操作日志"
      unit="条"
    />
  );
}

/* ── 任务运行日志（事件流：日志编码 / 日志信息 / 日志时间） ── */
function TaskLogPage() {
  const columns: LogColumn<TaskLogEntry>[] = [
    {
      key: "code",
      head: "日志编码",
      width: 150,
      render: (r) => r.code,
      text: (r) => r.code,
    },
    {
      key: "message",
      head: "日志信息",
      width: 430,
      render: (r) => r.message,
      text: (r) => r.message,
    },
    {
      key: "time",
      head: "日志时间",
      width: 190,
      render: (r) => r.time,
      text: (r) => r.time,
    },
  ];

  return (
    <LogPage
      id="log.task"
      rows={TASK_LOG_ENTRIES}
      columns={columns}
      timeOf={(r) => r.time}
      searchOf={(r) => r.code + r.message + r.taskId}
      filename="任务运行日志"
      sheet="任务运行日志"
      unit="条"
    />
  );
}

/* ── 机器人操作日志 ── */
function RobotLogPage() {
  const columns: LogColumn<RobotLog>[] = [
    {
      key: "time",
      head: "操作时间",
      width: 190,
      render: (r) => r.time,
      text: (r) => r.time,
    },
    {
      key: "operator",
      head: "操作人",
      width: 90,
      render: (r) => r.operator,
      text: (r) => r.operator,
    },
    {
      key: "sn",
      head: "机器人编号（SN）",
      width: 165,
      render: (r) => r.sn,
      text: (r) => r.sn,
    },
    {
      key: "robotName",
      head: "机器人名称",
      width: 130,
      render: (r) => r.robotName,
      text: (r) => r.robotName,
    },
    {
      key: "type",
      head: "操作类型",
      width: 110,
      render: (r) => <Badge>{r.type}</Badge>,
      text: (r) => r.type,
    },
  ];

  return (
    <LogPage
      id="log.robot"
      rows={ROBOT_LOGS}
      columns={columns}
      timeOf={(r) => r.time}
      searchOf={(r) => r.id + r.sn + r.robotName + r.operator + r.type}
      filename="机器人操作日志"
      sheet="机器人操作日志"
      unit="条"
    />
  );
}

export function LogCenter() {
  const { account, platformMode } = useStore();
  /** 平台管理视角只看平台侧的操作留痕：任务 / 机器人 / 接口属租户业务日志，不在此暴露 */
  const platformOnly = account?.level === "super" && platformMode;
  const [tab, setTab] = useState<TabKey>("sys");
  return (
    <>
      {!platformOnly && (
        <Segmented<TabKey> items={TABS} value={tab} onChange={setTab} />
      )}
      {(platformOnly || tab === "sys") && <SysLogPage />}
      {!platformOnly && tab === "task" && <TaskLogPage />}
      {!platformOnly && tab === "robot" && <RobotLogPage />}
      {!platformOnly && tab === "interface" && <InterfaceLog />}
    </>
  );
}
