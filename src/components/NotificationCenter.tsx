/**
 * @file NotificationCenter.tsx
 * @description 顶栏通用通知中心（与 AlarmCenter 并行）：
 *              合并三类非告警通知——
 *                · 系统消息（机器人离线 / 故障 / 人工接管）
 *                · 任务通知（任务完成 / 失败 / 超期 / 已被接管）
 *                · 审批提醒（预留扩展，当前告警模板无审批 state）
 *              入口按钮显示合并 badge，点击弹出可关闭的下拉面板，按 Tab 分组。
 * @interaction 由 App.tsx 顶栏 header-right 渲染；与 AlarmCenter 并列；
 *              数据源取自 data/store 的 robots / tasks / alarmTemplates
 */
import { useEffect, useRef, useState } from "react";
import { Bell, CircleCheck, CircleAlert, ClipboardCheck, Layers, MonitorOff, X } from "lucide-react";
import { useStore } from "../data/store";

/** 通知类型分组：图标 + 标签 + 颜色 */
type NotifyTab = "system" | "task" | "approval";

const TAB_META: Record<NotifyTab, { label: string; Icon: typeof Bell; color: string }> = {
  system:   { label: "系统消息",  Icon: MonitorOff,    color: "#3b82f6" },
  task:     { label: "任务通知",  Icon: Layers,        color: "#06b6d4" },
  approval: { label: "审批提醒",  Icon: ClipboardCheck,color: "#a855f7" },
};

/** 单条通知 */
interface NotifyItem {
  id: string;
  tab: NotifyTab;
  icon: typeof Bell;
  level: "info" | "warn" | "danger" | "success";
  title: string;
  desc: string;
  time: string;            // 原始时间串
  timeShort: string;       // 展示用 HH:mm
  read: boolean;           // 是否已读
}

/** 机器人哪些 state 算"需要关注的系统消息" */
const SYSTEM_ROBOT_STATES = new Set(["离线", "故障", "人工接管"]);
/** 任务哪些 state 算"任务通知" */
const TASK_DONE_STATES = new Set(["完成", "部分完成"]);
const TASK_FAIL_STATES = new Set(["失败", "取消", "超期", "已被接管"]);

/** 格式化时间为 HH:mm（当日）或 MM-DD HH:mm */
function shortTime(raw: string) {
  if (!raw) return "";
  const t = raw.replace("T", " ").slice(5, 16); // MM-DD HH:mm
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const isToday = t.startsWith(`${mm}-${dd}`);
  return isToday ? t.slice(6) : t;
}

export function NotificationCenter() {
  const { s } = useStore();
  const [open, SETOPEN] = useState(false);
  const [tab, SETTAB] = useState<NotifyTab>("system");
  const [read, SETREAD] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // ── 数据源派生：三类通知 ──

  // 系统消息：关注状态的机器人
  const sysNotifies: NotifyItem[] = s.robots
    .filter((r) => SYSTEM_ROBOT_STATES.has(r.state))
    .map((r) => ({
      id: `sys-r-${r.id}`,
      tab: "system",
      icon: MonitorOff,
      level: r.state === "故障" ? "danger" : r.state === "离线" ? "warn" : "info",
      title: `机器人「${r.name}」${r.state}`,
      desc: `当前电量 ${r.battery}% · ${r.region}`,
      time: r.lastSeen || r.created || "",
      timeShort: shortTime(r.lastSeen || r.created || ""),
      read: read.has(`sys-r-${r.id}`),
    }));

  // 任务通知：近 12 小时已完成 / 失败 / 超期
  const CUTOFF = Date.now() - 12 * 3600 * 1000;
  const taskNotifies: NotifyItem[] = s.tasks
    .filter((t) => {
      if (TASK_FAIL_STATES.has(t.state)) return true;
      if (TASK_DONE_STATES.has(t.state)) {
        const finish = t.finishedAt || t.created;
        return finish && new Date(finish).getTime() >= CUTOFF;
      }
      return false;
    })
    .map((t) => {
      const isFail = TASK_FAIL_STATES.has(t.state);
      return {
        id: `task-${t.id}`,
        tab: "task",
        icon: isFail ? CircleAlert : CircleCheck,
        level: isFail ? "warn" : "success",
        title: `任务「${t.objectName || t.name || t.id}」${t.state}`,
        desc: `机器人 ${t.robotId || "—"} · ${t.created ? shortTime(t.created) : ""}`,
        time: t.finishedAt || t.created || "",
        timeShort: shortTime(t.finishedAt || t.created || ""),
        read: read.has(`task-${t.id}`),
      };
    });

  // 审批提醒：当前无审批 state 字段，占位空数组（将来接 alarmTemplates 审批流）
  const approvalNotifies: NotifyItem[] = [];

  const all: NotifyItem[] = [...sysNotifies, ...taskNotifies, ...approvalNotifies].sort(
    (a, b) => (b.time || "").localeCompare(a.time || ""),
  );

  /** 未读 badge（当前 Tab 下的未读数，或全部） */
  const unreadAll = all.filter((n) => !n.read).length;
  const unreadByTab: Record<NotifyTab, number> = {
    system:   sysNotifies.filter((n) => !n.read).length,
    task:     taskNotifies.filter((n) => !n.read).length,
    approval: approvalNotifies.filter((n) => !n.read).length,
  };

  /** 当前 Tab 的数据 */
  const currentItems = (tab === "system" ? sysNotifies : tab === "task" ? taskNotifies : approvalNotifies);

  // 点击面板外关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        SETOPEN(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  /** 全部标记已读（当前 Tab） */
  const markAll = () => {
    const ids = currentItems.map((n) => n.id);
    SETREAD((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  return (
    <>
      {/* 入口按钮：Bell 图标 + 文字「通知」，未读数作 badge */}
      <button
        ref={btnRef}
        className={"notify-entry" + (unreadAll > 0 ? " has-unread" : "")}
        title={unreadAll > 0 ? `有 ${unreadAll} 条未读通知` : "暂无新通知"}
        onClick={() => SETOPEN((v) => !v)}
      >
        <Bell size={17} />
        <span className="entry-label">通知</span>
        {unreadAll > 0 && <i className="notify-badge">{unreadAll > 99 ? "99+" : unreadAll}</i>}
      </button>

      {/* 下拉通知面板 */}
      {open && (
        <div
          ref={panelRef}
          className="notify-panel"
          style={{ top: "58px", right: "72px" }}
        >
          <div className="notify-head">
            <Bell size={15} />
            <b>通知中心</b>
            {unreadAll > 0 && <em className="notify-unread-badge">{unreadAll}</em>}
            <span style={{ flex: 1 }} />
            {currentItems.length > 0 && (
              <button className="notify-markall" onClick={markAll}>全部已读</button>
            )}
            <button
              className="notify-close"
              title="关闭"
              onClick={() => SETOPEN(false)}
            >
              <X size={14} />
            </button>
          </div>

          {/* Tab 切换 */}
          <div className="notify-tabs">
            {(["system", "task", "approval"] as NotifyTab[]).map((key) => {
              const meta = TAB_META[key];
              const Icon = meta.Icon;
              const cnt = unreadByTab[key];
              return (
                <button
                  key={key}
                  className={"notify-tab" + (tab === key ? " on" : "")}
                  onClick={() => SETTAB(key)}
                >
                  <Icon size={13} />
                  {meta.label}
                  {cnt > 0 && <i className="notify-tab-dot">{cnt}</i>}
                </button>
              );
            })}
          </div>

          {/* 列表区 */}
          <div className="notify-list">
            {currentItems.length > 0 ? (
              currentItems.map((n) => {
                const Icon = n.icon;
                return (
                  <div key={n.id} className={"notify-row lv-" + n.level + (n.read ? " read" : "")}>
                    <span className={"notify-row-icon lv-" + n.level}><Icon size={14} /></span>
                    <div className="notify-row-main">
                      <b>{n.title}</b>
                      <small>{n.desc}</small>
                    </div>
                    <time>{n.timeShort}</time>
                  </div>
                );
              })
            ) : (
              <div className="notify-empty">
                {tab === "approval"
                  ? "暂无审批提醒（告警模板审批流待接入）"
                  : "暂无新通知"}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
