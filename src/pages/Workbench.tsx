/**
 * @file Workbench.tsx
 * @description 「我的工作台」默认首页：顶部以待办 KPI 作为唯一入口，卡片按业务模块分类展示；
 *              点击某个 KPI 在弹窗中展开该类待办的明细（明细同样按业务维度分类），
 *              明细行可直接点进对应处理页面；工作台内只读，复核 / 处置等写操作一律到对应页面完成。
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
import { Badge, Modal, Note } from "../components/UI";
import { ObjectLink, Kpis } from "../components/Business";
import { pointOf, stageOf, terminal } from "../data/selectors";
import { DUE_SOON_MS, metricValue } from "../data/metrics";
import { canSee, roleOf } from "../data/roles";
import { ALARM_LEVELS } from "../data/types";
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
 * 待办条目
 * @description 传入 onClick 时整行即「进入对应处理页面」的入口（可点样式 + hover 反馈）
 * @param children 待办主体内容
 * @param onClick 点击整行的动作
 * @param title 悬浮说明
 */
function Todo({
  children,
  onClick,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <li
      className={"todo-item" + (onClick ? " clickable" : "")}
      onClick={onClick}
      title={title}
    >
      <div className="todo-main">{children}</div>
    </li>
  );
}

/**
 * 空待办占位，避免业主误以为页面未加载
 * @param text 占位文案
 */
function TodoEmpty({ text }: { text: string }) {
  return <li className="todo-empty">{text}</li>;
}

/**
 * 待办明细分类渲染
 * @description 同一分组的条目聚在一起，组头给出分组名与条数；
 *              组顺序按 order 给定（未列出的分组排在其后，组内保持原有业务顺序）。
 * @param items 明细条目
 * @param keyOf 分组键（如所属区域 / 告警级别 / 任务来源 / 机器人）
 * @param render 单条渲染（需自带 key）
 * @param order 分组展示顺序
 * @returns 「组头 + 组内条目」交替输出的节点数组
 */
function groupTodo<T>(
  items: T[],
  keyOf: (x: T) => string,
  render: (x: T) => ReactNode,
  order: string[] = [],
): ReactNode[] {
  const keys = [...new Set(items.map(keyOf))].sort((a, b) => {
    const ia = order.indexOf(a),
      ib = order.indexOf(b);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
  });
  return keys.flatMap((k) => {
    const group = items.filter((x) => keyOf(x) === k);
    return [
      <li className="todo-group" key={"g-" + k}>
        <span>{k}</span>
        <b>{group.length}</b>
      </li>,
      ...group.map(render),
    ];
  });
}

// 告警分级三档（ALARM_LEVELS）与「告警事件」页同源：一级 / 二级 / 三级
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

  /** 未处理告警：尚无人工处理（处理时间为空），异常即告警，检查受理在告警页完成 */
  const openAlarms = s.alarms.filter((a) => !a.handledAt);
  const pendingTasks = s.tasks.filter((t) => t.state === "待调度");
  const running = s.tasks.filter((t) => t.state === "执行中");

  // 机器人关注项：离线、低电量、地图版本落后三类合并，同一机器人只出现一次
  const robotAttention = s.robots
    .map((robot) => {
      const map = s.maps.find((m) => m.id === robot.mapId);
      const stale = !!map && robot.mapVersion !== map.version;
      const reasons = [
        robot.state === "离线" ? "通信离线" : "",
        robot.battery < robot.constraints.minBattery
          ? `电量 ${robot.battery}%（低于${robot.deviceType}门槛 ${robot.constraints.minBattery}%）`
          : "",
        stale ? `地图版本落后（实际 v${robot.mapVersion}）` : "",
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
    !openAlarms.length &&
    !pendingTasks.length &&
    !robotAttention.length &&
    !dueSoon.length;

  /**
   * 待办分类清单：KPI 数字与弹窗明细同源——
   * 数字取指标中心（与驾驶舱 / 报表同口径），明细是同口径列表，两者数量天然一致；
   * group 与左侧导航的业务模块同名，卡片按模块分类展示（相邻同组自动归并为一组）
   */
  const cards: {
    key: string;
    label: string;
    metric: string;
    title: string;
    empty: string;
    group: string;
    count: number;
    items: ReactNode;
  }[] = [
    {
      key: "alarms",
      label: "未处理告警",
      metric: "unconfirmedAlarms",
      title: "未处理告警",
      empty: "没有未处理告警",
      group: "结果与异常",
      count: openAlarms.length,
      items: (
        <ul className="todo-list">
          {!openAlarms.length && <TodoEmpty text="没有未处理告警" />}
          {groupTodo(
            openAlarms,
            (a) => a.level,
            (a) => (
              <Todo
                key={a.id}
                title="点击进入告警检查受理"
                onClick={() => go("alarm", a.id)}
              >
                <b>
                  {a.name}
                  <Badge>{a.level}</Badge>
                </b>
                <small className="todo-meta">
                  点位 <ObjectLink type="point" id={a.pointId} /> ·{" "}
                  {shortTime(a.time)}
                </small>
                <small className="todo-meta">
                  关联业务结果与证据在告警页，可直接检查受理
                </small>
              </Todo>
            ),
            ALARM_LEVELS,
          )}
        </ul>
      ),
    },
    {
      key: "tasks",
      label: "待调度任务",
      metric: "pendingDispatch",
      title: "待调度任务",
      empty: "没有待调度任务",
      group: "调度中心",
      count: pendingTasks.length,
      items: (
        <ul className="todo-list">
          {!pendingTasks.length && <TodoEmpty text="没有待调度任务" />}
          {groupTodo(
            pendingTasks,
            (t) => t.source,
            (t) => (
              <Todo
                key={t.id}
                title="点击进入调度"
                onClick={() => go("dispatch", t.id)}
              >
                <b>
                  {t.name}
                  <Badge>{t.state}</Badge>
                </b>
                <small className="todo-meta">
                  {t.id} · {t.source} ·{" "}
                  {s.maps.find((m) => m.id === t.mapId)?.name || t.mapId} ·{" "}
                  {t.items.length} 个点位
                </small>
                <small className="todo-meta">
                  {t.deadline
                    ? `要求 ${shortTime(t.deadline)} 前完成`
                    : "未设置完成时限"}
                </small>
              </Todo>
            ),
          )}
        </ul>
      ),
    },
    {
      key: "due",
      label: "即将超期",
      metric: "dueSoonTasks",
      title: "即将超期任务",
      empty: "没有临近完成时限的任务",
      group: "调度中心",
      count: dueSoon.length,
      items: (
        <ul className="todo-list">
          {!dueSoon.length && <TodoEmpty text="没有临近完成时限的任务" />}
          {groupTodo(dueSoon, (t) => t.state, (t) => (
            <Todo
              key={t.id}
              title="点击查看任务详情"
              onClick={() => go("task-detail", t.id)}
            >
              <b>
                {t.name}
                <Badge>{t.state}</Badge>
              </b>
              <small className="todo-meta">
                {t.id} · {t.robotId || "未分配"} · 要求{" "}
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
      group: "巡检执行",
      count: running.length,
      items: (
        <ul className="todo-list">
          {!running.length && <TodoEmpty text="当前没有执行中的任务" />}
          {groupTodo(running, (t) => t.robotId || "未分配", (t) => (
            <Todo
              key={t.id}
              title="点击进入现场监控"
              onClick={() => go("execution-monitor", t.id)}
            >
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
    // 新建任务：直达「临时巡检任务」创建抽屉（quick 路由渲染 QuickTaskDrawer，关闭后回任务列表）
    { label: "新建任务", icon: FilePlus2, page: "quick", group: "调度中心" },
    { label: "任务调度", icon: Split, page: "dispatch", group: "调度中心" },
    { label: "结果查询", icon: Eye, page: "results", group: "结果与异常" },
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

      {/* 顶部 KPI 一律取自指标中心：与驾驶舱、报表同口径；按业务模块分类，点击展开该类待办的明细弹窗 */}
      <Kpis
        card
        items={cards.map((c) => ({
          label: c.label,
          value: metricValue(s, c.metric),
          icon: kpiIcon[c.key],
          tone: kpiTone[c.key],
          unit: "项",
          group: c.group,
          action: () => OPEN(c.key),
        }))}
      />

      {allClear && <Note>当前没有待处理事项，巡检业务已全部闭环。</Note>}

      {/* 待办明细：按业务维度分类，行内直接点进对应处理页面（关闭用弹窗右上角 ×） */}
      {openCard && (
        <Modal
          title={`${openCard.title}（${openCard.count}）`}
          onClose={() => OPEN("")}
          wide
        >
          {openCard.items}
        </Modal>
      )}
    </div>
  );
}
