/**
 * @file NotificationCenter.tsx
 * @description 消息中心弹窗：顶栏铃铛按钮点击弹出（不再直接跳转告警页）。
 *              分类 Tab（全部 / 系统通知 / 业务消息 / 告警预警）+ 全部已读 / 清空 + 消息列表；
 *              演示数据：系统通知与业务消息为内置示例，告警预警与待办类消息取自演示数据实时生成
 * @interaction 由 App.tsx 顶栏铃铛打开；已读 / 清空状态存 localStorage，离线 file:// 下静默降级
 */
import { useMemo, useState } from "react";
import {
  BellRing,
  CheckCheck,
  Eye,
  ListChecks,
  Mail,
  Settings,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Modal } from "./UI";

type MsgCat = "system" | "biz" | "alarm";
type Tone = "blue" | "red" | "orange" | "purple";

interface Msg {
  id: string;
  cat: MsgCat;
  /** 图标底色（业务语义：告警红 / 审批橙 / 通知紫 / 任务蓝） */
  tone: Tone;
  icon: LucideIcon;
  title: string;
  badge?: "紧急" | "重要";
  text: string;
  time: string;
  source: string;
  /** 点击消息的跳转动作；无则仅标记已读 */
  to?: () => void;
}

/** 消息中心对外依赖的最小数据面：真实 store 状态结构兼容即可 */
interface NoticeSource {
  alarms: { id: string; name: string; level: string; state: string; time: string; pointId: string }[];
  results: { id: string; status: string }[];
  tasks: { id: string; state: string }[];
  points: { id: string; device?: string; object?: string }[];
}

/** 已读 / 清空状态的 localStorage 键；读写失败（离线 file://）时降级为内存态 */
const READ_KEY = "notice-read-v1";
const CLEARED_KEY = "notice-cleared-v1";
const memRead: string[] = [];

function loadRead(): string[] {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return raw ? (JSON.parse(raw) as string[]) : memRead;
  } catch {
    return memRead;
  }
}
function saveRead(ids: string[]) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(ids));
  } catch {
    /* 降级忽略 */
  }
}
function loadCleared(): boolean {
  try {
    return localStorage.getItem(CLEARED_KEY) === "1";
  } catch {
    return false;
  }
}
function saveCleared() {
  try {
    localStorage.setItem(CLEARED_KEY, "1");
  } catch {
    /* 降级忽略 */
  }
}

/** 时间字符串压缩为「MM-DD HH:mm」，用于告警类消息展示 */
function fmtTime(value: string) {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return value;
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 组装消息中心数据：内置演示消息 + 由演示数据实时生成的待办 / 告警消息
 * @param s 演示数据状态（App 与弹窗共用，保证角标数字与弹窗列表同口径）
 */
export function noticeMessages(s: NoticeSource): Msg[] {
  const alarmList = s.alarms.filter((a) => a.state === "待确认");
  const reviewN = s.results.filter((r) => r.status === "待复核").length;
  const dispatchN = s.tasks.filter((t) => t.state === "待调度").length;
  return [
    {
      id: "sys-maintain",
      cat: "system",
      tone: "purple",
      icon: Settings,
      title: "系统维护通知",
      badge: "重要",
      text: "系统将于今晚 22:00-23:00 进行例行维护升级，届时部分功能可能暂时不可用。",
      time: "58分钟前",
      source: "系统管理员",
    },
    {
      id: "sys-release",
      cat: "system",
      tone: "blue",
      icon: Settings,
      title: "新版本发布 v1.14.0",
      text: "系统已升级至 v1.14.0，新增通知中心、工作流增强等多项功能。",
      time: "今天 09:30",
      source: "系统管理员",
    },
    {
      id: "biz-approval",
      cat: "biz",
      tone: "red",
      icon: Mail,
      title: "审批流程待处理",
      badge: "紧急",
      text: "张三提交的《Q1 季度预算申请》需要您审批，请尽快处理。",
      time: "1小时前",
      source: "张三",
    },
    ...(reviewN
      ? [
          {
            id: "biz-review",
            cat: "biz" as MsgCat,
            tone: "orange" as Tone,
            icon: Eye,
            title: "巡检结果待复核",
            badge: "重要" as const,
            text: `有 ${reviewN} 条巡检结果等待人工复核确认，请及时处理。`,
            time: "今天 08:40",
            source: "巡检业务",
            to: () => go("review"),
          },
        ]
      : []),
    ...(dispatchN
      ? [
          {
            id: "biz-dispatch",
            cat: "biz" as MsgCat,
            tone: "blue" as Tone,
            icon: ListChecks,
            title: "任务待调度",
            text: `有 ${dispatchN} 条巡检任务等待调度派单，请前往任务调度工作台处理。`,
            time: "今天 08:40",
            source: "巡检业务",
            to: () => go("dispatch"),
          },
        ]
      : []),
    ...alarmList.map((a) => {
      const pt = s.points.find((p) => p.id === a.pointId);
      return {
        id: `alarm-${a.id}`,
        cat: "alarm" as MsgCat,
        tone: "red" as Tone,
        icon: BellRing,
        title: a.name,
        badge: (a.level === "高" ? "紧急" : undefined) as "紧急" | undefined,
        text: `${pt?.device || "点位"} · ${pt?.object || a.pointId} 触发告警，请查看原始结果与证据后确认处置。`,
        time: fmtTime(a.time),
        source: "监控中心",
        to: () => go("alarms"),
      };
    }),
  ];
}

/**
 * 计算未读消息数（顶栏铃铛角标用）；已清空则为 0
 * @param msgs 消息列表（与弹窗同口径）
 */
export function unreadNoticeCount(msgs: Msg[]): number {
  if (loadCleared()) return 0;
  const read = loadRead();
  return msgs.filter((m) => !read.includes(m.id)).length;
}

/** 分类 Tab 定义：key 与消息分类对应 */
const CATS: { key: MsgCat | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "system", label: "系统通知" },
  { key: "biz", label: "业务消息" },
  { key: "alarm", label: "告警预警" },
];

export function NotificationCenter({ onClose }: { onClose: () => void }) {
  const { s } = useStore();
  /** 当前分类 Tab；"all" 表示全部 */
  const [tab, SETTAB] = useState<MsgCat | "all">("all");
  /** 已读消息 id 集合；清空后列表为空态 */
  const [read, SETREAD] = useState<string[]>(loadRead);
  const [cleared, SETCLEARED] = useState<boolean>(loadCleared);

  const all = useMemo(() => noticeMessages(s), [s]);
  const list = cleared
    ? []
    : tab === "all"
      ? all
      : all.filter((m) => m.cat === tab);
  const countOf = (key: MsgCat | "all") =>
    cleared ? 0 : key === "all" ? all.length : all.filter((m) => m.cat === key).length;

  const markRead = (id: string) => {
    if (read.includes(id)) return;
    const next = [...read, id];
    SETREAD(next);
    saveRead(next);
  };
  const markAll = () => {
    const ids = all.map((m) => m.id);
    SETREAD(ids);
    saveRead(ids);
  };
  const clearAll = () => {
    SETCLEARED(true);
    saveCleared();
  };
  const openMsg = (m: Msg) => {
    markRead(m.id);
    onClose();
    m.to?.();
  };

  return (
    <Modal title="消息中心" onClose={onClose} wide>
      {/* 分类 Tab：徽标为该分类消息总数 */}
      <div className="nc-tabs">
        {CATS.map((c) => (
          <button
            key={c.key}
            className={"nc-tab" + (tab === c.key ? " active" : "")}
            onClick={() => SETTAB(c.key)}
          >
            {c.label}
            <i className="nc-tab-n">{countOf(c.key)}</i>
          </button>
        ))}
      </div>
      {/* 操作行：全部已读 / 清空 */}
      <div className="nc-actions">
        <button onClick={markAll}>
          <CheckCheck size={14} />
          全部已读
        </button>
        <button onClick={clearAll}>
          <Trash2 size={14} />
          清空
        </button>
      </div>
      {/* 消息列表：紧急消息左侧红色竖条，未读消息带提示圆点 */}
      {list.length ? (
        <ul className="nc-list">
          {list.map((m) => {
            const Icon = m.icon;
            const isRead = read.includes(m.id);
            const urgent = m.badge === "紧急";
            return (
              <li
                key={m.id}
                className={"nc-item" + (urgent ? " urgent" : "") + (isRead ? " read" : "")}
                onClick={() => openMsg(m)}
              >
                <span className={"nc-ico tone-" + m.tone}>
                  <Icon size={18} />
                </span>
                <div className="nc-main">
                  <div className="nc-title">
                    <b>{m.title}</b>
                    {m.badge && (
                      <em className={"nc-badge " + (urgent ? "hot" : "warm")}>
                        {m.badge}
                      </em>
                    )}
                  </div>
                  <p>{m.text}</p>
                  <small>
                    {m.time} · {m.source}
                  </small>
                </div>
                {!isRead && (
                  <span className={"nc-dot " + (urgent ? "red" : m.badge ? "orange" : "blue")} />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="nc-empty">暂无消息</div>
      )}
    </Modal>
  );
}
