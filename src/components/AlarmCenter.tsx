/**
 * @file AlarmCenter.tsx
 * @description 顶栏告警中心（替代原消息铃铛）：按钮显示未处理告警数，点击打开**告警弹窗**；
 *              弹窗支持拖动悬浮与最小化为小胶囊；**悬浮钉常驻、不给关闭**（告警必须可被随时看到），
 *              逐条可「去处理」直达告警详情。不含消息中心。
 * @interaction 由 App.tsx 顶栏 header-right 渲染；跳转经 data/navigation 的 go()
 */
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Bell, Minus } from "lucide-react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { ALARM_CLASS_MAINS, type AlarmClassMain } from "../data/types";
import { mainOfAlarm } from "../data/alarmSettings";

/** 未处理告警判定：尚无人工处理（处理时间为空） */
const isOpen = (a: { handledAt?: string }) => !a.handledAt;
/**
 * 悬浮元素所在坐标空间的缩放比
 * @description 应用根 .app 带 transform: scale(--ui-scale)，fixed 子元素的 left/top 走**未缩放**逻辑像素，
 *              而指针事件的 clientX/Y 是**缩放后**视觉像素；不换算就会拖到 82% 处到头、且起手跳位
 */
const uiScaleOf = (el: HTMLElement | null) => {
  const w = el?.offsetWidth ?? 0;
  return w ? el!.getBoundingClientRect().width / w : 1;
};
/** 等级排序：一级 → 二级 → 其他 */
const rank = (lv: string) => (lv === "一级" ? 0 : lv === "二级" ? 1 : 2);

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
  /**
   * 悬浮钉位置（null = 默认贴右下）
   * @description 右下角常挡住分页 / 表格底部操作，允许拖走后记住位置（localStorage）
   */
  const [pillPos, SETPILLPOS] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem("rd.alarm.pill");
      return raw ? (JSON.parse(raw) as { x: number; y: number }) : null;
    } catch {
      return null;
    }
  });
  const pillRef = useRef<HTMLButtonElement>(null);
  /** 拖过就不当点击处理（避免松手时误开弹窗） */
  const pillDragged = useRef(false);
  /**
   * 弹窗内的标签页：业务预警 / 机器人预警
   * @description 口径与「告警记录」一致（见 data/alarmSettings 的 mainOfAlarm）：
   *              业务预警 = 设备 / 环境类判定异常；机器人预警 = 机器人本体事件
   */
  const [main, SETMAIN] = useState<AlarmClassMain>("业务预警");
  const panelRef = useRef<HTMLDivElement>(null);

  /** 全部未处理告警：顶栏角标、最小化胶囊与一级拦截都用它，不随标签页变化 */
  const allOpen = s.alarms.filter((a) => isOpen(a));
  /** 一级告警（全量）：全局拦截只看一级，避免切到机器人预警时漏掉业务一级 */
  const urgentList = allOpen.filter((a) => a.level === "一级");
  const urgent = urgentList.length;
  /** 当前标签页的未处理告警（列表与头部摘要都按它统计） */
  const list = allOpen
    .filter((a) => mainOfAlarm(a.category) === main)
    .sort((a, b) => rank(a.level) - rank(b.level));
  /**
   * 按等级计数
   * @param level 告警等级（一级 / 二级 / 三级）
   * @param arr 统计范围，默认当前标签页清单；传全量用于顶栏 tooltip
   */
  const lvCount = (level: string, arr: typeof list = list) =>
    arr.filter((a) => a.level === level).length;
  /** 头部主色调：当前标签页的最高等级决定（一级红 > 二级琥珀 > 仅三级 蓝灰） */
  const headTone: "urgent" | "lv2" | "lv3" | "none" =
    lvCount("一级") > 0
      ? "urgent"
      : lvCount("二级") > 0
        ? "lv2"
        : list.length > 0
          ? "lv3"
          : "none";

  /**
   * 一级告警全局拦截：
   * - `seenUrgent` 记录已"推送过"的一级告警 id —— 只有**新出现**的一级告警才自动弹窗，
   *   首帧已存在的历史告警不打扰（避免每次进页面都被弹）。
   * - `intercept` = 待确认的新一级告警 id：存在期间顶部显示红条、弹窗不可关闭，
   *   需点「知晓」或「去处理」后才收起（任何界面都能及时响应）。
   */
  const seenUrgent = useRef<Set<string>>(new Set(urgentList.map((a) => a.id)));
  const [intercept, SETINTERCEPT] = useState<string | null>(null);
  useEffect(() => {
    const fresh = s.alarms.filter(
      (a) =>
        a.level === "一级" && isOpen(a) && !seenUrgent.current.has(a.id),
    );
    s.alarms.forEach((a) => seenUrgent.current.add(a.id));
    if (!fresh.length) return;
    // 自动弹出悬浮窗并进入拦截确认态（不最小化、不自动收起）
    SETOPEN(true);
    SETMIN(false);
    SETINTERCEPT(fresh[0].id);
  }, [s.alarms]);
  // 一级告警一旦完成标注，自动解除拦截
  useEffect(() => {
    if (
      intercept &&
      !s.alarms.some((a) => a.id === intercept && isOpen(a))
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

  // 拖动：按住头部移动；位置限制在视口内（换算到缩放前的逻辑坐标再卡边，可贴边）
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const el = panelRef.current;
      const w = el?.offsetWidth ?? 344;
      const h = el?.offsetHeight ?? 320;
      const k = uiScaleOf(el) || 1;
      SETPOS({
        x: Math.max(0, Math.min(window.innerWidth / k - w, e.clientX / k - drag.ox)),
        y: Math.max(0, Math.min(window.innerHeight / k - h, e.clientY / k - drag.oy)),
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

  /** 记录指针相对弹窗的偏移（换算成逻辑像素），开始拖动 */
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = panelRef.current;
    const r = el?.getBoundingClientRect();
    if (!r) return;
    const k = uiScaleOf(el) || 1;
    SETDRAG({ ox: (e.clientX - r.left) / k, oy: (e.clientY - r.top) / k });
  };

  /**
   * 悬浮钉拖动：按住跟手移动，松手落位
   * @description 位移超过 4px 才算拖动（否则仍算点击打开弹窗）；坐标换回逻辑像素后夹在视口内，允许贴边
   */
  const startPillDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const el = pillRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const k = uiScaleOf(el) || 1;
    const ox = (e.clientX - r.left) / k;
    const oy = (e.clientY - r.top) / k;
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 4) return;
      moved = true;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      SETPILLPOS({
        x: Math.max(0, Math.min(window.innerWidth / k - w, ev.clientX / k - ox)),
        y: Math.max(0, Math.min(window.innerHeight / k - h, ev.clientY / k - oy)),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) pillDragged.current = true;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /** 悬浮钉位置落盘：下次进页面还停在挪过去的地方 */
  useEffect(() => {
    if (!pillPos) return;
    try {
      localStorage.setItem("rd.alarm.pill", JSON.stringify(pillPos));
    } catch {
      /* 无痕模式下忽略 */
    }
  }, [pillPos]);

  return (
    <>
      {/* 顶栏入口：Bell 图标 + 文字「告警」，未处置数作 badge；有一级告警时 bell 上多一个红点脉动提示 */}
      <button
        className={
          "alarm-entry" +
          (urgent > 0 ? " has-urgent" : allOpen.length ? " has-alarm" : "")
        }
        title={
          allOpen.length
            ? `未处置 ${allOpen.length} · 一级 ${urgent} · 二级 ${lvCount("二级", allOpen)} · 三级 ${lvCount("三级", allOpen)}`
            : "暂无告警"
        }
        onClick={() => {
          SETOPEN((v) => !v);
          SETMIN(false);
        }}
      >
        <Bell size={17} />
        <span className="entry-label">告警</span>
        {allOpen.length > 0 && (
            <i className="bell-badge alarm">
              {allOpen.length > 99 ? "99+" : allOpen.length}
            </i>
          )}
      </button>

      {/* 一级告警全局提醒条：置顶、任何界面可见；知晓 / 去处理后收起 */}
      {interceptAlarm && (
        <div className="alarm-interrupt" role="alert">
          <Bell size={16} />
          <b>一级告警</b>
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

      {/* 悬浮钉：常驻小胶囊（收起态一直可见，不提供关闭入口）；可拖动挪位置，免得挡分页 */}
      {(!open || min) && (
        <button
          ref={pillRef}
          className="alarm-min"
          title="拖动可挪位置，点击展开告警弹窗"
          style={
            pillPos
              ? { left: pillPos.x, top: pillPos.y, right: "auto", bottom: "auto" }
              : undefined
          }
          onPointerDown={startPillDrag}
          onClick={() => {
            // 拖过就别再当成点击，否则松手会误开弹窗
            if (pillDragged.current) {
              pillDragged.current = false;
              return;
            }
            SETOPEN(true);
            SETMIN(false);
          }}
        >
          <Bell size={15} />
          告警 {allOpen.length}
        </button>
      )}

      {/* 悬浮告警弹窗：头部可拖动，只能收起为悬浮钉（不提供关闭） */}
      {open && !min && (
        <div
          ref={panelRef}
          className={"alarm-panel" + (interceptAlarm ? " urgent" : "")}
          style={pos ? { left: pos.x, top: pos.y, right: "auto" } : undefined}
        >
          <div className={"alarm-panel-head tone-" + headTone} onPointerDown={startDrag}>
            <Bell size={15} />
            <b>告警 <em className="alarm-total">{list.length}</em> 条</b>
            {/* 分级摘要 chips：一级红 / 二级琥珀 / 三级蓝灰，数量为 0 时半透明 */}
            <div className="alarm-head-lv">
              <span className="alarm-lv-chip lv1" style={{ opacity: lvCount("一级") ? 1 : 0.35 }}>
                <i />一级 {lvCount("一级")}
              </span>
              <span className="alarm-lv-chip lv2" style={{ opacity: lvCount("二级") ? 1 : 0.35 }}>
                <i />二级 {lvCount("二级")}
              </span>
              <span className="alarm-lv-chip lv3" style={{ opacity: lvCount("三级") ? 1 : 0.35 }}>
                <i />三级 {lvCount("三级")}
              </span>
            </div>
            <span className="alarm-head-spacer" />
            {/* 一级告警拦截期间：不给「收起」，必须先知晓 / 去处理 */}
            {interceptAlarm ? (
              <>
                <button
                  className="alarm-ack"
                  title="知晓该一级告警并收起"
                  onClick={ack}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  知晓
                </button>
                <button
                  className="alarm-ack go"
                  title="前往处置该一级告警"
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
                  title="收起为悬浮钉"
                  onClick={() => SETMIN(true)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Minus size={15} />
                </button>
              </>
            )}
          </div>
          {/* 标签页：业务预警 / 机器人预警（与「告警记录」同一组口径）；切换只影响本弹窗的列表与头部摘要 */}
          <div className="segmented alarm-panel-tabs">
            {ALARM_CLASS_MAINS.map((m) => (
              <button
                key={m}
                className={main === m ? "active" : ""}
                onClick={() => SETMAIN(m)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {m}
              </button>
            ))}
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
