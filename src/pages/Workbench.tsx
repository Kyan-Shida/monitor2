/**
 * @file Workbench.tsx
 * @description 「我的工作台」默认首页：顶部以待办 KPI 作为唯一入口，
 *              点击某个 KPI 后在弹窗中展开该类待办的明细（不在页面里平铺长列表）；
 *              工作台内只读展示，复核 / 处置等写操作一律跳转到对应页面完成
 * @interaction 由 src/App.tsx 在 page === "workbench" 时渲染；
 *              KPI 数字取自指标中心（与驾驶舱 / 报表同口径），页面只读消费 data/store 的状态
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  AlarmClock,
  BellRing,
  Bot,
  Eye,
  FilePlus2,
  ListChecks,
  Split,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Modal, Note } from "../components/UI";
import { ObjectLink, Kpis } from "../components/Business";
import { minutesLeft, pointOf, stageOf, terminal } from "../data/selectors";
import { DUE_SOON_MS, metricValue } from "../data/metrics";
import { canSee, roleOf } from "../data/roles";
import type { KpiTone } from "../components/Business";
import mascot from "../assets/mascot-robot.jpg";

// 即将超期阈值与低电量门槛统一由指标中心提供，避免工作台与报表出现两套口径

/**
 * 将时间字符串压缩为「MM-DD HH:mm」，用于待办列表紧凑展示
 * @param value 可被 Date.parse 解析的时间字符串
 * @returns 格式化结果；无法解析时原样返回，避免展示空白
 */
function shortTime(value: string) {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return value;
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 待办条目：只展示信息；需要追加「跳转去处理」入口时，由调用方自行拼装 li 并追加操作区
 * @param children 待办主体内容
 */
function Todo({ children }: { children: ReactNode }) {
  return (
    <li className="todo-item">
      <div className="todo-main">{children}</div>
    </li>
  );
}

/**
 * 空待办占位，避免业主误以为页面未加载
 */
function TodoEmpty({ text }: { text: string }) {
  return <li className="todo-empty">{text}</li>;
}

export function Workbench() {
  const { s } = useStore();
  /** 当前展开明细的待办分类 key；空串表示弹窗未打开 */
  const [openKey, OPEN] = useState("");
  /** 当前时间：每 30 秒刷新一次，驱动顶部问候语与日期展示 */
  const [now, SETN] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => SETN(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const pendingResults = s.results.filter((r) => r.status === "待复核");
  const pendingAlarms = s.alarms.filter((a) => a.state === "待确认");
  const pendingTasks = s.tasks.filter((t) => t.state === "待调度");
  const running = s.tasks.filter((t) => t.state === "执行中");

  // 机器人关注项：离线、低电量、地图/点位版本落后三类合并，同一机器人只出现一次
  const robotAttention = s.robots
    .map((robot) => {
      const map = s.maps.find((m) => m.id === robot.mapId);
      const stale =
        !!map &&
        (robot.mapVersion !== map.version || robot.pointSet !== map.pointSet);
      const reasons = [
        robot.state === "离线" ? "通信离线" : "",
        robot.battery < robot.constraints.minBattery
          ? `电量 ${robot.battery}%（低于${robot.deviceType}门槛 ${robot.constraints.minBattery}%）`
          : "",
        stale
          ? `地图版本落后（实际 m${robot.mapVersion} / p${robot.pointSet}）`
          : "",
      ].filter(Boolean);
      return { robot, reasons };
    })
    .filter((x) => x.reasons.length);

  const dueSoon = s.tasks.filter(
    (t) =>
      t.deadline &&
      Date.parse(t.deadline) - Date.now() < DUE_SOON_MS &&
      !terminal.includes(t.state),
  );

  const allClear =
    !pendingResults.length &&
    !pendingAlarms.length &&
    !pendingTasks.length &&
    !robotAttention.length &&
    !dueSoon.length;

  /**
   * 待办分类清单：KPI 数字与弹窗明细同源——
   * 数字取指标中心（与驾驶舱 / 报表同口径），明细是同口径列表，两者数量天然一致
   */
  const cards: {
    key: string;
    label: string;
    metric: string;
    title: string;
    empty: string;
    enterText: string;
    enter: () => void;
    count: number;
    items: ReactNode;
  }[] = [
    {
      key: "results",
      label: "待复核结果",
      metric: "reviewBacklog",
      title: "待复核巡检结果",
      empty: "没有待复核结果",
      enterText: "结果查询",
      enter: () => go("results"),
      count: pendingResults.length,
      items: (
        <ul className="todo-list">
          {!pendingResults.length && <TodoEmpty text="没有待复核结果" />}
          {pendingResults.map((r) => {
            const p = pointOf(s, r);
            return (
              <li className="todo-item" key={r.id}>
                <div className="todo-main">
                  <b>
                    {p?.device} · {p?.object} · {r.item}
                    <Badge>{r.abnormal ? "异常" : "正常"}</Badge>
                  </b>
                  <small className="todo-meta">
                    识别 {r.recognized} → 最终 {r.final} {r.unit} · 置信度{" "}
                    {Math.round(r.confidence * 100)}% · {shortTime(r.time)}
                  </small>
                  <small className="todo-meta">
                    来源任务 <ObjectLink type="task-detail" id={r.taskId} />
                  </small>
                </div>
                {/* 工作台只做展示：复核在「结果详情 / 复核」页完成 */}
                <div className="actions">
                  <Btn onClick={() => go("review", r.id)}>去复核</Btn>
                </div>
              </li>
            );
          })}
        </ul>
      ),
    },
    {
      key: "alarms",
      label: "待确认告警",
      metric: "unconfirmedAlarms",
      title: "待确认告警",
      empty: "没有待确认告警",
      enterText: "告警事件",
      enter: () => go("alarms"),
      count: pendingAlarms.length,
      items: (
        <ul className="todo-list">
          {!pendingAlarms.length && <TodoEmpty text="没有待确认告警" />}
          {pendingAlarms.map((a) => (
            <Todo key={a.id}>
              <b>
                {a.name}
                <Badge>{a.level}</Badge>
              </b>
              <small className="todo-meta">
                点位 <ObjectLink type="point" id={a.pointId} /> ·{" "}
                {shortTime(a.time)}
              </small>
              <small className="todo-meta">
                触发原因可查看原始结果与证据后再确认
              </small>
            </Todo>
          ))}
        </ul>
      ),
    },
    {
      key: "tasks",
      label: "待调度任务",
      metric: "pendingDispatch",
      title: "待调度任务",
      empty: "没有待调度任务",
      enterText: "调度工作台",
      enter: () => go("dispatch"),
      count: pendingTasks.length,
      items: (
        <ul className="todo-list">
          {!pendingTasks.length && <TodoEmpty text="没有待调度任务" />}
          {pendingTasks.map((t) => (
            <Todo key={t.id}>
              <b>
                {t.name}
                <Badge>{t.priority}</Badge>
              </b>
              <small className="todo-meta">
                {t.id} · {t.source} ·{" "}
                {s.maps.find((m) => m.id === t.mapId)?.name || t.mapId} ·{" "}
                {t.items.length} 个点位 · 预计需 {minutesLeft(t)} 分钟
              </small>
              <small className="todo-meta">
                {t.deadline
                  ? `要求 ${shortTime(t.deadline)} 前完成`
                  : "未设置完成时限"}
              </small>
            </Todo>
          ))}
        </ul>
      ),
    },
    {
      key: "robots",
      label: "机器人待关注",
      metric: "robotAttention",
      title: "机器人与地图待关注",
      empty: "机器人运行正常，地图版本一致",
      enterText: "机器人监测",
      enter: () => go("robots"),
      count: robotAttention.length,
      items: (
        <ul className="todo-list">
          {!robotAttention.length && (
            <TodoEmpty text="机器人运行正常，地图版本一致" />
          )}
          {robotAttention.map(({ robot, reasons }) => (
            <Todo key={robot.id}>
              <b>
                {robot.id} · {robot.name}
                <Badge>{robot.state}</Badge>
              </b>
              <small className="todo-meta">{reasons.join(" · ")}</small>
              <small className="todo-meta">
                {robot.region} · 电量 {robot.battery}% · 能力{" "}
                {robot.capabilities.join(" / ")}
              </small>
            </Todo>
          ))}
        </ul>
      ),
    },
    {
      key: "due",
      label: "即将超期",
      metric: "dueSoonTasks",
      title: "即将超期任务",
      empty: "没有临近完成时限的任务",
      enterText: "任务列表",
      enter: () => go("tasks"),
      count: dueSoon.length,
      items: (
        <ul className="todo-list">
          {!dueSoon.length && <TodoEmpty text="没有临近完成时限的任务" />}
          {dueSoon.map((t) => (
            <Todo key={t.id}>
              <b>
                {t.name}
                <Badge>{t.state}</Badge>
              </b>
              <small className="todo-meta">
                {t.id} · {t.priority} · {t.robotId || "未分配"} · 要求{" "}
                {t.deadline ? shortTime(t.deadline) : "—"} 前完成
              </small>
            </Todo>
          ))}
        </ul>
      ),
    },
    {
      key: "executing",
      label: "执行中任务",
      metric: "executing",
      title: "执行中任务",
      empty: "当前没有执行中的任务",
      enterText: "实时执行监控",
      enter: () => go("execution"),
      count: running.length,
      items: (
        <ul className="todo-list">
          {!running.length && <TodoEmpty text="当前没有执行中的任务" />}
          {running.map((t) => (
            <Todo key={t.id}>
              <b>
                {t.name}
                <Badge>{t.state}</Badge>
              </b>
              <small className="todo-meta">
                {t.id} · {t.robotId || "未分配"} · 完成 {t.done.length}/
                {t.items.length} · {stageOf(t)}
              </small>
              <small className="todo-meta">
                当前点位 <ObjectLink type="point" id={t.items[t.index]?.id} />
              </small>
            </Todo>
          ))}
        </ul>
      ),
    },
  ];
  const openCard = cards.find((c) => c.key === openKey);

  /** KPI 图标：每个待办分类配一个语义图标，强化卡片可读性与可识别度 */
  const kpiIcon: Record<string, LucideIcon> = {
    results: Eye,
    alarms: BellRing,
    tasks: ListChecks,
    robots: Bot,
    due: AlarmClock,
    executing: Activity,
  };
  /** KPI 图标色调：按业务语义区分（结果蓝 / 告警红 / 调度橙 / 机器人紫 / 超期灰 / 执行绿） */
  const kpiTone: Record<string, KpiTone> = {
    results: "blue",
    alarms: "red",
    tasks: "orange",
    robots: "purple",
    due: "gray",
    executing: "green",
  };

  /** 当前角色（决定欢迎语称呼与快捷入口的可见性） */
  const role = roleOf(s.roleId);
  /**
   * 按时段生成问候语，营造友好氛围
   * @returns 时段问候语（凌晨 / 早上 / 中午 / 下午 / 晚上）
   */
  const h = now.getHours();
  const hello =
    h < 6 ? "夜深了" : h < 11 ? "早上好" : h < 13 ? "中午好" : h < 18 ? "下午好" : "晚上好";
  /** 日期串：2026.9.26 星期六 */
  const dateStr = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()} 星期${"日一二三四五六"[now.getDay()]}`;
  /**
   * 快捷入口：管理员最常用的四个功能模块，一键直达免找菜单；
   * 按当前角色权限过滤，无权限的入口不展示
   */
  const shortcuts = [
    { label: "新建任务", icon: FilePlus2, page: "plan-edit", group: "巡检执行" },
    { label: "任务调度", icon: Split, page: "dispatch", group: "巡检执行" },
    { label: "结果复核", icon: Eye, page: "review", group: "结果与异常" },
    { label: "告警记录", icon: BellRing, page: "alarms", group: "结果与异常" },
  ].filter((x) => canSee(role, x.page, x.group));

  return (
    <div className="workbench-root">
      {/* 顶部：欢迎横幅（3D 形象 + 问候 / 日期）与快捷入口并排 */}
      <div className="wb-top">
        <section className="wb-hero">
          <div className="wb-hero-text">
            <h2>Hi~ {hello}</h2>
            <p>
              欢迎回来，{role.person}（{role.name}）
            </p>
            <small>今天是 {dateStr}</small>
          </div>
          <img className="wb-hero-avatar" src={mascot} alt="巡检助手 3D 形象" />
        </section>
        <aside className="wb-shortcuts">
          <div className="wb-sc-title">快捷入口</div>
          <div className="wb-sc-grid">
            {shortcuts.map(({ label, icon: Icon, page }) => (
              <button key={page} className="wb-sc-item" onClick={() => go(page)}>
                <span className="wb-sc-icon">
                  <Icon size={18} />
                </span>
                {label}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* 顶部 KPI 一律取自指标中心：与驾驶舱、报表同口径；点击展开该类待办的明细弹窗 */}
      <Kpis
        card
        items={cards.map((c) => ({
          label: c.label,
          value: metricValue(s, c.metric),
          icon: kpiIcon[c.key],
          tone: kpiTone[c.key],
          unit: "项",
          action: () => OPEN(c.key),
        }))}
      />

      {allClear && <Note>当前没有待处理事项，巡检业务已全部闭环。</Note>}

      {/* 下方实时面板：撑满剩余高度，列内各自滚动，避免页面空旷 */}
      <div className="wb-panels">
        <section className="wb-panel">
          <header className="wb-panel-head">
            <span>进行中任务</span>
            <button className="wb-panel-link" onClick={() => go("execution")}>
              实时监控
            </button>
          </header>
          <div className="wb-panel-body">
            {!running.length && <div className="wb-empty">当前没有执行中的任务</div>}
            <ul className="wb-feed">
              {running.map((t) => {
                const pct = Math.round((t.done.length / Math.max(1, t.items.length)) * 100);
                return (
                  <li
                    key={t.id}
                    className="wb-feed-item"
                    onClick={() => go("execution", t.id)}
                  >
                    <div className="wb-feed-top">
                      <b>{t.name}</b>
                      <span className="wb-feed-sub">{t.robotId || "未分配"}</span>
                    </div>
                    <small>
                      完成 {t.done.length}/{t.items.length} 个点位 · {stageOf(t)}
                    </small>
                    <div className="wb-progress">
                      <i style={{ width: pct + "%" }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
        <section className="wb-panel">
          <header className="wb-panel-head">
            <span>机器人运行概览</span>
            <button className="wb-panel-link" onClick={() => go("robots")}>
              机器人监测
            </button>
          </header>
          <div className="wb-panel-body">
            <ul className="wb-feed">
              {s.robots.map((r) => (
                <li
                  key={r.id}
                  className="wb-feed-item"
                  onClick={() => go("robots", r.id)}
                >
                  <div className="wb-feed-top">
                    <b>{r.name}</b>
                    <span
                      className={
                        "wb-dot " +
                        (r.state === "离线"
                          ? "off"
                          : r.state === "执行中"
                            ? "run"
                            : "idle")
                      }
                    />
                  </div>
                  <small>
                    {r.region} · 电量 {r.battery}% · {r.state}
                  </small>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {openCard && (
        <Modal
          title={`${openCard.title}（${openCard.count}）`}
          onClose={() => OPEN("")}
          wide
        >
          {openCard.items}
          <div className="modal-actions">
            <Btn onClick={() => OPEN("")}>关闭</Btn>
            <Btn
              primary
              onClick={() => {
                OPEN("");
                openCard.enter();
              }}
            >
              {openCard.enterText}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
