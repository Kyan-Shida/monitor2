/**
 * @file AlarmCenter.tsx
 * @description 顶栏告警中心（替代原消息铃铛）：按钮显示未处理告警数，点击打开**告警弹窗**；
 *              弹窗支持拖动悬浮与最小化为小胶囊，逐条可「去处理」直达告警详情。不含消息中心。
 * @interaction 由 App.tsx 顶栏 header-right 渲染；跳转经 data/navigation 的 go()
 */
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Bell, Minus, X } from "lucide-react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";

/** 未处理告警判定：未关闭即视为需要关注（待确认 / 处理中 / 待复查 / 已恢复） */
const isOpen = (state: string) => state !== "已关闭";
/** 等级排序：紧急 → 重要 → 其他 */
const rank = (lv: string) => (lv === "紧急" ? 0 : lv === "重要" ? 1 : 2);

export function AlarmCenter() {
  const { s } = useStore();
  /** 弹窗是否展开 */
  const [open, SETOPEN] = useState(false);
  /** 是否最小化为小胶囊 */
  const [min, SETMIN] = useState(false);
  /** 悬浮位置（null = 默认锚定顶栏右下） */
  const [pos, SETPOS] = useState<{ x: number; y: number } | null>(null);
  /** 拖动会话的指针偏移；非空表示正在拖动 */
  const [drag, SETDRAG] = useState<{ ox: number; oy: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const list = s.alarms
    .filter((a) => isOpen(a.state))
    .sort((a, b) => rank(a.level) - rank(b.level));
  const urgentList = list.filter((a) => a.level === "紧急");
  const urgent = urgentList.length;

  /**
   * 一级（紧急）告警全局拦截：
   * - `seenUrgent` 记录已"推送过"的紧急告警 id —— 只有**新出现**的紧急告警才自动弹窗，
   *   首帧已存在的历史告警不打扰（避免每次进页面都被弹）。
   * - `intercept` = 待确认的新紧急告警 id：存在期间顶部显示红条、弹窗不可关闭，
   *   需点「知晓」或「去处理」后才收起（任何界面都能及时响应）。
   */
  const seenUrgent = useRef<Set<string>>(new Set(urgentList.map((a) => a.id)));
  const [intercept, SETINTERCEPT] = useState<string | null>(null);
  useEffect(() => {
    const fresh = s.alarms.filter(
      (a) =>
        a.level === "紧急" && isOpen(a.state) && !seenUrgent.current.has(a.id),
    );
    s.alarms.forEach((a) => seenUrgent.current.add(a.id));
    if (!fresh.length) return;
    // 自动弹出悬浮窗并进入拦截确认态（不最小化、不自动收起）
    SETOPEN(true);
    SETMIN(false);
    SETINTERCEPT(fresh[0].id);
  }, [s.alarms]);
  // 待确认的紧急告警一旦闭环（不再未处理），自动解除拦截
  useEffect(() => {
    if (
      intercept &&
      !s.alarms.some((a) => a.id === intercept && isOpen(a.state))
    )
      SETINTERCEPT(null);
  }, [s.alarms, intercept]);
  const interceptAlarm = intercept
    ? s.alarms.find((a) => a.id === intercept)
    : undefined;
  /** 知晓并收起：关闭红条与弹窗 */
  const ack = () => {
    SETINTERCEPT(null);
    SETOPEN(false);
  };

  // 拖动：按住头部移动；位置限制在视口内
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const w = panelRef.current?.offsetWidth ?? 344;
      const h = panelRef.current?.offsetHeight ?? 320;
      SETPOS({
        x: Math.max(8, Math.min(window.innerWidth - w - 8, e.clientX - drag.ox)),
        y: Math.max(8, Math.min(window.innerHeight - h - 8, e.clientY - drag.oy)),
      });
    };
    const up = () => SETDRAG(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag]);

  /** 记录指针相对弹窗的偏移，开始拖动 */
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = panelRef.current?.getBoundingClientRect();
    if (!r) return;
    SETDRAG({ ox: e.clientX - r.left, oy: e.clientY - r.top });
  };

  return (
    <>
      {/* 顶栏入口：原消息铃铛位置，替换为告警入口 */}
      <button
        className={
          "alarm-entry" +
          (urgent > 0 ? " has-urgent" : list.length ? " has-alarm" : "")
        }
        title={
          list.length
            ? `有 ${list.length} 条未处理告警（紧急 ${urgent}），点击查看`
            : "暂无告警"
        }
        onClick={() => {
          SETOPEN((v) => !v);
          SETMIN(false);
        }}
      >
        <Bell size={18} />
        {list.length > 0 && (
          <i className="bell-badge alarm">
            {list.length > 99 ? "99+" : list.length}
          </i>
        )}
      </button>

      {/* 一级（紧急）告警全局提醒条：置顶、任何界面可见；知晓 / 去处理后收起 */}
      {interceptAlarm && (
        <div className="alarm-interrupt" role="alert">
          <Bell size={16} />
          <b>一级 · 紧急告警</b>
          <span>{interceptAlarm.name}</span>
          <small>{interceptAlarm.time}</small>
          <span className="alarm-interrupt-spacer" />
          <button
            className="alarm-interrupt-go"
            onClick={() => {
              SETINTERCEPT(null);
              SETOPEN(false);
              go("alarm", interceptAlarm.id);
            }}
          >
            去处理
          </button>
          <button onClick={ack}>知晓</button>
        </div>
      )}

      {/* 最小化态：右下角小胶囊 */}
      {open && min && (
        <button
          className="alarm-min"
          title="展开告警弹窗"
          onClick={() => SETMIN(false)}
        >
          <Bell size={15} />
          告警 {list.length}
        </button>
      )}

      {/* 悬浮告警弹窗：头部可拖动，支持最小化 / 关闭 */}
      {open && !min && (
        <div
          ref={panelRef}
          className={"alarm-panel" + (interceptAlarm ? " urgent" : "")}
          style={pos ? { left: pos.x, top: pos.y, right: "auto" } : undefined}
        >
          <div className="alarm-panel-head" onPointerDown={startDrag}>
            <Bell size={15} />
            <b>告警 {list.length} 条</b>
            {urgent > 0 && <em className="alarm-urgent">紧急 {urgent}</em>}
            <span className="alarm-head-spacer" />
            {/* 一级告警拦截期间：不给「最小化 / 关闭」，必须先知晓 / 去处理 */}
            {interceptAlarm ? (
              <>
                <button
                  className="alarm-ack"
                  title="知晓该紧急告警并收起"
                  onClick={ack}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  知晓
                </button>
                <button
                  className="alarm-ack go"
                  title="前往处置该紧急告警"
                  onClick={() => {
                    SETINTERCEPT(null);
                    SETOPEN(false);
                    go("alarm", interceptAlarm.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  去处理
                </button>
              </>
            ) : (
              <>
                <button
                  title="最小化"
                  onClick={() => SETMIN(true)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Minus size={15} />
                </button>
                <button
                  title="关闭"
                  onClick={() => SETOPEN(false)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <X size={15} />
                </button>
              </>
            )}
          </div>
          {list.length ? (
            <ul className="alarm-panel-list">
              {list.map((a) => (
                <li key={a.id} className={"alarm-row lv-" + a.level}>
                  <span className={"alarm-lv lv-" + a.level}>{a.level}</span>
                  <div className="alarm-row-main">
                    <b>{a.name}</b>
                    <small>
                      {a.time}
                      {a.pointId ? ` · ${a.pointId}` : ""}
                    </small>
                  </div>
                  <button
                    className="alarm-go"
                    onClick={() => {
                      SETOPEN(false);
                      go("alarm", a.id);
                    }}
                  >
                    去处理
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="alarm-empty">当前无未处理告警。</p>
          )}
        </div>
      )}
    </>
  );
}
