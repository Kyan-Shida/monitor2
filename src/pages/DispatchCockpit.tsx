/**
 * @file DispatchCockpit.tsx
 * @description 调度指挥驾驶舱（V2 版式重构）：**中央地图最大化 + 左 300 / 右 350 固定栏 + 悬浮式操作台**。
 *   ① 顶栏与「管理驾驶舱」共用同一个 ScreenTopBar（卡片底 · 左品牌与两舱 Tab · 居中发光标题 ·
 *      调度中心 / 全屏 / 紧急停止 · 时钟），两舱样式完全一致；
 *   ② 左栏 300px：设备状态紧凑列表（状态灯 + 电量进度条）→ 选中设备后就地展开「当前设备」折叠面板（Accordion）；
 *   ③ 中栏 flex-1：地图舞台自适应铺满中央栏（不用绝对定位），左上角图层与图例、右下角缩放控件，
 *      底部为半透明毛玻璃悬浮操作台（导航 / 任务 / 云台 / 声光语音 四组，点开就地展开，不常驻占地图高度）；
 *   ④ 右栏 350px：单一枢纽卡片，三大 Tabs —— [告警与SLA] 红 · [视频信息] 青 · [巡检日志] 橙。
 *   配色口径（等价 Tailwind 语义，两舱统一）：底 `bg-slate-950 #020617` / 卡片 `slate-900 #0f172a` /
 *      边框 `slate-800 #1e293b` / 强调 `cyan-500 #06b6d4` + `red-500 #ef4444`。
 * @interaction 由 App.tsx 在 page === "screen" 时渲染；指标取自 data/metrics.ts，动作经 data/engine.ts
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  Camera,
  CameraOff,
  ChevronDown,
  Compass,
  ListChecks,
  Maximize,
  Minimize,
  RotateCcw,
  Route,
  TriangleAlert,
  Video as VideoIcon,
  Volume2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Can } from "../components/Can";
import { PERMS } from "../data/roles";
import { Badge, Btn, Modal, Note } from "../components/UI";
import { MapCanvas } from "../components/MapCanvas";
import { ScreenTopBar, type CockpitId } from "../components/ScreenTopBar";
import { TakeoverDialog } from "../components/TakeoverDialog";
import { Video } from "../components/Video";
import { AutoScrollList } from "../components/AutoScrollList";
import { ControlPad, type MoveCommand } from "../components/ControlPad";
import { metricValue, scopedState } from "../data/metrics";
import { deviceProfile, deviceTypes } from "../data/deviceProfile";
import { currentTask, queueFor, robotColors, stageOf } from "../data/selectors";
import {
  fieldCapabilities,
  fieldDefault,
  type FieldCommand,
} from "../data/fieldControl";
import type { Alarm } from "../data/types";
import type { PointerEvent as ReactPointerEvent } from "react";

/** 预录播报内容：与状态机 fieldCommand 的校验清单保持一致 */
const PRESETS = [
  "巡检作业中，请保持距离",
  "前方危险，请勿靠近",
  "设备异常，请人员协助",
];

/** 告警级别权重：用于分级抑制判断 */
const levelRank = (l: string) => (l === "紧急" ? 3 : l === "重要" ? 2 : 1);

/** 悬浮操作台的分组：四组控制按需展开 */
type PadKey = "nav" | "task" | "cam" | "av";
/** 右栏枢纽的两个 Tab（巡检日志已按需求移除） */
type HubKey = "alarm" | "video";

export function DispatchCockpit({
  onSwitch,
}: {
  /** 独立大屏窗口内的驾驶舱切换；后台外壳下缺省按路由跳转 */
  onSwitch?: (id: CockpitId) => void;
}) {
  const { s, act } = useStore();
  const [region, SETR] = useState("全部区域");
  const [devType, SETT] = useState("全部机型");
  const [taskState, SETTS] = useState("全部状态");
  const [layers, LAY] = useState({ points: true, chargers: true, rails: true });
  const [speed, SPEED] = useState(5);
  const [selected, SEL] = useState<string>();
  /** 设备池「全选」：一次性选中当前筛选的全部机器（地图全部高亮、明细/告警按全部机器展示） */
  const [allSel, SETALL] = useState(false);
  const [fs, FS] = useState(false);
  /** 全屏失败提示：部分预览环境禁用浏览器全屏 API */
  const [fsError, FSE] = useState("");
  /** 驾驶舱根节点：全屏以该元素为目标，整屏只显示驾驶舱（与管理驾驶舱一致） */
  const shellRef = useRef<HTMLDivElement>(null);
  const [estop, ES] = useState(false);
  const [home, HOME] = useState(false);
  /** 接管会话抽屉：点「申请接管」就地展开，不跳「人工操作与遥控」页（避免丢失当前选中设备与三栏上下文） */
  const [takeover, TAKEOVER] = useState(false);
  /** 底部控制带第 4 块所选的预录播报内容 */
  const [clip, C] = useState(PRESETS[0]);
  const [counterSign, CS] = useState("李主管");
  /** 悬浮操作台当前展开的分组：默认全部收起，保证地图主视野不被遮挡，点按钮才就地展开 */
  const [pad, PAD] = useState<PadKey | null>(null);
  /** 右栏枢纽 Tab */
  const [hub, HUB] = useState<HubKey>("alarm");
  /** 左栏「当前设备」折叠面板：默认展开，可手动收起 */
  const [devOpen, DEVO] = useState(true);
  /** 地图缩放倍率：仅作用于地图舞台内的图形层，配合右下角缩放控件 */
  const [zoom, ZOOM] = useState(1);

  useEffect(() => {
    const onFs = () => FS(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // SLA 倒计时推进：每分钟一次，仅缩短真实剩余时间，不生成任何模拟数据
  useEffect(() => {
    const i = setInterval(() => {
      const open = s.workOrders.some(
        (w) => !["已验收", "已关闭"].includes(w.state),
      );
      if (open) act({ type: "SLA_TICK" });
    }, 60000);
    return () => clearInterval(i);
  }, [s.workOrders, act]);

  const sc = scopedState(s, region);
  const mv = (key: string) => metricValue(sc, key);

  /** 设备列表：厂区 / 机型 / 状态三重筛选 */
  const robots = s.robots.filter((r) => {
    if (region !== "全部区域" && r.region !== region) return false;
    if (devType !== "全部机型" && r.deviceType !== devType) return false;
    if (taskState === "任务中" && r.state !== "执行中") return false;
    if (taskState === "异常" && !["故障", "离线", "人工接管"].includes(r.state))
      return false;
    if (taskState === "充电" && r.state !== "充电") return false;
    if (taskState === "空闲" && r.state !== "空闲") return false;
    return true;
  });
  /** 单台生效的机器：全选状态下不指定单台（仅作整体展示，操控需点选单台） */
  const activeId = allSel ? undefined : selected;
  /** 当前设备：仅当左栏选中单台机器时存在；未选中 / 全选时所有操控入口不可用 */
  const robot = robots.find((r) => r.id === activeId);
  /** 未选中设备时的引导文案：区分「已全选」与「未选择」 */
  const pickHint = allSel
    ? "已全选设备：操控仅支持单台，请在设备列表中点选一台机器"
    : "未选择设备：请先在左侧设备列表点选一台机器";
  const task = robot ? currentTask(s, robot) : undefined;
  const queue = robot ? queueFor(s, robot.id) : [];
  /** 有效接管会话：只有已接管且未到期时才允许下发手动指令 */
  const session = s.sessions.find(
    (x) =>
      x.robotId === robot?.id && x.state === "已接管" && x.expires > Date.now(),
  );

  /** 未关闭告警 */
  const openAlarms = useMemo(
    () => s.alarms.filter((a) => a.state !== "已关闭"),
    [s.alarms],
  );
  /** 选中机器后只看该机器任务的告警；未选中 / 全选时展示全部机器 */
  const scopedAlarms = useMemo(
    () =>
      activeId
        ? openAlarms.filter(
            (a) => s.tasks.find((t) => t.id === a.taskId)?.robotId === activeId,
          )
        : openAlarms,
    [openAlarms, s.tasks, activeId],
  );
  /** 告警去重合并：同锚点（业务点位 / 机器人本体异常按「分类+机器人」）+ 同级别的未关闭告警合并为一条 */
  const alarmGroups = useMemo(() => {
    const anchorOf = (a: Alarm) => a.pointId || `${a.category}:${a.robotId}`;
    const groups = new Map<string, Alarm[]>();
    scopedAlarms.forEach((a) => {
      const key = `${anchorOf(a)}|${a.level}`;
      groups.set(key, [...(groups.get(key) || []), a]);
    });
    return [...groups.entries()].map(([key, items]) => ({
      key,
      items,
      head: items[0],
      /** 分级抑制：同锚点存在更高级别告警时，低级别仅记录不推送处置 */
      suppressed: scopedAlarms.some(
        (x) =>
          anchorOf(x) === anchorOf(items[0]) &&
          levelRank(x.level) > levelRank(items[0].level),
      ),
    }));
  }, [scopedAlarms]);
  /** 未闭环工单：SLA 倒计时列表 */
  const openWos = s.workOrders.filter(
    (w) => !["已验收", "已关闭"].includes(w.state),
  );

  /** 指挥 KPI 数字条：8 项待处置量，与管理驾驶舱数字带同款（只读展示，不下钻） */
  const strip = [
    { n: mv("onlineCount"), label: "在线设备（台）" },
    { n: mv("executing"), label: "执行中任务（个）" },
    { n: sc.alarms.filter((a) => a.state !== "已关闭").length, label: "未闭环告警（条）" },
    { n: openWos.filter((w) => w.slaState !== "正常").length, label: "SLA 预警/超时（单）" },
    { n: openWos.filter((w) => !w.assignee).length, label: "待派单工单（单）" },
    { n: s.sessions.filter((x) => x.state === "已接管").length, label: "人工接管会话（个）" },
    { n: mv("lowBattery"), label: "低电量设备（台）" },
    { n: mv("fieldPending"), label: "现场待处理（项）" },
  ];

  /**
   * 切换全屏展示：以驾驶舱根节点为目标请求全屏（与管理驾驶舱一致），整屏只显示驾驶舱；
   * 部分预览环境会拒绝该请求，此时给出明确提示，不静默失败
   */
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await shellRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      FSE(
        "当前预览环境禁止浏览器全屏，请在独立浏览器窗口中打开以使用全屏展示。",
      );
      setTimeout(() => FSE(""), 6000);
    }
  };
  /** 下发手动移动指令：会话与速度档位一并传入状态机 */
  const sendMove = (cmd: MoveCommand) => {
    if (!session || !robot) return;
    act({ type: "CONTROL", id: session.id, command: cmd, step: speed });
  };
  /** 下发云台 / 采集指令 */
  const sendCmd = (cmd: string) => {
    if (!session) return;
    act({ type: "CONTROL", id: session.id, command: cmd, step: speed });
  };
  /**
   * 现场设备状态：与「现场控制」弹窗同源（都读 robot.fieldDevices）
   * @description 未操作过时用 fieldDefault()，保证卡内读数与弹窗一致，不另造状态；镜头与声光共用
   */
  const field = (robot && s.fieldDevices?.[robot.id]) || fieldDefault();
  /** 现场指令可用性：与状态机 fieldCommand 的校验一致（需接管会话 + 机型支持 + 在线） */
  const fieldOn = (c: FieldCommand) =>
    !!session &&
    !!robot &&
    robot.state !== "离线" &&
    fieldCapabilities(robot).includes(c);
  /** value 可省：「停止输出」等无参指令只传 command */
  const sendField = (command: FieldCommand, value?: unknown) => {
    if (!robot) return;
    act({ type: "FIELD_COMMAND", robotId: robot.id, command, value });
  };
  /** 按住讲话：按下开始、松开 / 取消 / 失焦即停（不调用本机麦克风，只下发模拟指令） */
  const talkDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    sendField("talk", true);
  };
  const talkUp = () => sendField("talk", false);

  return (
    <div className="cockpit-screen ds-root ds-v2" ref={shellRef}>
      {/* 大屏全局导航栏：品牌 + 导航 Tab + 发光标题 + 本舱控件 + 时间
          （调度中心属导航、全屏属显示控制、紧急停止为全局动作，三者归顶栏） */}
      <ScreenTopBar
        current="screen"
        onSwitch={onSwitch}
        extra={
          <>
            <Btn onClick={() => go("dispatch", robot?.id)}>
              <Route size={13} />
              调度中心
            </Btn>
            <button
              className="cs-nav-icon"
              title="驾驶舱独占整屏展示"
              aria-label={fs ? "退出全屏" : "全屏展示"}
              onClick={toggleFullscreen}
            >
              {fs ? <Minimize size={15} /> : <Maximize size={15} />}
            </button>
            <Can perm={PERMS.紧急停止}>
              <button className="screen-estop" onClick={() => ES(true)}>
                <TriangleAlert size={13} />
                紧急停止
              </button>
            </Can>
          </>
        }
      />
      {/* 指挥 KPI 数字条：8 格待处置量，只读展示，不下钻跳转 */}
      <div className="cs-kpi-strip">
        {strip.map((x) => (
          <div key={x.label} className="cs-kpi">
            <b>{x.n}</b>
            <span>{x.label}</span>
          </div>
        ))}
      </div>
      {fsError && <Note>{fsError}</Note>}

      <div className="ds-grid">
        {/* ══ 左栏（300px）：设备与状态收纳 ══ */}
        <aside className="ds-col ds-col-l">
          {/* 设备状态 + 当前设备：合并为一张卡片并撑满左栏（「历史与实时数据」块已按需求移除） */}
          <section className="ds-card ds-fleet grow">
            <header className="ds-head">
              <h3>设备状态</h3>
              <small>
                在线 {mv("onlineCount")}/{mv("devices")}
              </small>
              <button
                className={"ds-chip" + (allSel ? " active" : "")}
                title="一次选中当前筛选的全部机器"
                onClick={() => {
                  SETALL(!allSel);
                  SEL(undefined);
                }}
              >
                {allSel ? "取消全选" : "全选"}
              </button>
            </header>
            <div className="ds-selects">
              <select aria-label="厂区" value={region} onChange={(e) => SETR(e.target.value)}>
                {["全部区域", ...new Set(s.robots.map((r) => r.region))].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select aria-label="机型" value={devType} onChange={(e) => SETT(e.target.value)}>
                {["全部机型", ...deviceTypes].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select aria-label="状态" value={taskState} onChange={(e) => SETTS(e.target.value)}>
                {["全部状态", "任务中", "空闲", "充电", "异常"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
            <div className="ds-fleet-list">
              {robots.map((r) => (
                <button
                  key={r.id}
                  className={"ds-fleet-row" + (allSel || r.id === selected ? " active" : "")}
                  title="点击选中该机器后可执行导航 / 任务 / 云台操作；再次点击取消选择"
                  onClick={() => {
                    SETALL(false);
                    SEL(r.id === selected ? undefined : r.id);
                    DEVO(true);
                  }}
                >
                  {/* 状态灯色值取自状态机配色，外发光与圆点同色 */}
                  <i
                    className="ds-led"
                    style={{
                      background: robotColors[r.state],
                      boxShadow: `0 0 8px ${robotColors[r.state]}`,
                    }}
                  />
                  <div className="ds-fleet-main">
                    <b>
                      {r.id}
                      <em>{r.deviceType}</em>
                      <em className="ds-st">{r.state}</em>
                    </b>
                    <span className="ds-progress">
                      <i style={{ width: `${r.battery}%` }} />
                    </span>
                  </div>
                  <em className="ds-battery">{r.battery}%</em>
                </button>
              ))}
              {!robots.length && <Note>当前筛选条件下无设备。</Note>}
            </div>
            {/* 当前设备：与设备列表同属一张卡、可就地折叠的 Accordion（不再拆成第二个独立卡片） */}
            <div className={"ds-dev" + (devOpen && robot ? " open" : "")}>
              <button
                className="ds-dev-head"
                onClick={() => DEVO((v) => !v)}
                disabled={!robot}
                aria-expanded={devOpen && !!robot}
              >
                <h4>当前设备</h4>
                <small>{robot ? robot.id : "未选择"}</small>
                <ChevronDown size={14} className="ds-chev" />
              </button>
              {devOpen && robot ? (
                <div className="ds-dev-body">
                  <div className="cs-kv">
                    <span>
                      机型<b>{robot.deviceType}</b>
                    </span>
                    <span>
                      区域<b>{robot.region}</b>
                    </span>
                    <span>
                      电量<b>{robot.battery}%</b>
                    </span>
                    <span>
                      通信<b>{robot.state === "离线" ? "离线" : "在线"}</b>
                    </span>
                    <span>
                      巡检进度<b>{stageOf(task)}</b>
                    </span>
                    <span>
                      接管会话<b>{session ? session.id : "未接管"}</b>
                    </span>
                  </div>
                  <div className="ds-actions">
                    <Can perm={PERMS.远程接管}>
                      <Btn primary disabled={!robot} onClick={() => TAKEOVER(true)}>
                        {session ? "接管会话" : "申请接管"}
                      </Btn>
                    </Can>
                    <Can perm={PERMS.一键返航充电}>
                      <Btn disabled={!robot} onClick={() => HOME(true)}>
                        一键返航
                      </Btn>
                      {robot.state === "返航中" && (
                        <Btn onClick={() => act({ type: "RETURN_ARRIVED", robotId: robot.id })}>
                          模拟到位回报
                        </Btn>
                      )}
                    </Can>
                  </div>
                  <small className="ds-hint">
                    {session
                      ? `会话已生效 · 关机重点：${deviceProfile[robot.deviceType].focusItems.join(" / ")}`
                      : `接管后导航 / 云台 / 声光语音才可用 · 关机重点：${deviceProfile[robot.deviceType].focusItems.join(" / ")}`}
                  </small>
                </div>
              ) : (
                <small className="ds-hint">{robot ? "已收起详情" : pickHint}</small>
              )}
            </div>
          </section>

        </aside>

        {/* ══ 中栏（flex-1）：地图最大化 + 悬浮操作台 ══ */}
        <main className="ds-col ds-col-c">
          <div className="ds-stage">
            {/* 图层与图例：左上角，不占地图版面 */}
            <div className="ds-overlay ds-overlay-tl">
              <div className="ds-layers">
                {(
                  [
                    ["points", "点位"],
                    ["chargers", "充电桩"],
                    ["rails", "轨道"],
                  ] as const
                ).map(([k, n]) => (
                  <button
                    key={k}
                    className={layers[k] ? "active" : ""}
                    onClick={() => LAY({ ...layers, [k]: !layers[k] })}
                  >
                    {n}
                  </button>
                ))}
                <button title="BIM / 室内楼层待数据源接入" onClick={() => undefined}>
                  BIM
                </button>
              </div>
              <div className="ds-legend">
                {deviceTypes.map((d) => (
                  <span key={d}>
                    <i /> {d}
                  </span>
                ))}
                <span>
                  <i /> 充电桩
                </span>
                <span>
                  <i /> 轨道区段
                </span>
              </div>
            </div>

            {/* 缩放控件：右下角 */}
            <div className="ds-zoom">
              <button
                title="放大"
                onClick={() => ZOOM((z) => Math.min(2.4, +(z + 0.2).toFixed(2)))}
              >
                <ZoomIn size={14} />
              </button>
              <button
                title="缩小"
                onClick={() => ZOOM((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))}
              >
                <ZoomOut size={14} />
              </button>
              <button title="复位缩放" onClick={() => ZOOM(1)}>
                <RotateCcw size={13} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
            </div>

            {/* 地图本体：图形层按缩放倍率变换，点击选机器仍然生效 */}
            <div className="ds-stage-map" style={{ transform: `scale(${zoom})` }}>
              <MapCanvas
                points={layers.points ? sc.points : []}
                robots={robots}
                chargers={layers.chargers ? s.chargers : []}
                rails={layers.rails ? s.railSections : []}
                fit="xMidYMid meet"
                selectedRobot={activeId}
                highlightAll={allSel}
                onRobot={(rid) => {
                  SETALL(false);
                  SEL(rid === selected ? undefined : rid);
                  DEVO(true);
                }}
              />
            </div>

            {/* 悬浮操作台（半透明毛玻璃）：导航 / 任务 / 云台 / 声光语音，点开就地展开，不常驻占地图高度 */}
            <div className="ds-fab">
              {pad && (
                <div className="ds-fab-panel">
                  <header className="ds-fab-head">
                    <b>
                      {pad === "nav"
                        ? "机器人导航"
                        : pad === "task"
                          ? "任务导航"
                          : pad === "cam"
                            ? "云台 · 镜头"
                            : "声光 · 语音"}
                    </b>
                    <small>
                      {pad === "task"
                        ? robot
                          ? task
                            ? task.id
                            : "无执行中任务"
                          : "未选择设备"
                        : robot
                          ? session
                            ? session.id
                            : "需先接管"
                          : "未选择设备"}
                    </small>
                    <button className="ds-fab-close" onClick={() => PAD(null)} title="收起">
                      <ChevronDown size={13} />
                    </button>
                  </header>

                  {pad === "nav" && (
                    <ControlPad
                      onCommand={sendMove}
                      disabled={!session || !robot || robot.state === "离线"}
                      speed={speed}
                      onSpeed={SPEED}
                      hint={
                        session
                          ? `会话 ${session.id} · 已接管，指令即时生效`
                          : robot
                            ? "点「申请接管」就地建立会话后，此处才可操控"
                            : pickHint
                      }
                    />
                  )}

                  {pad === "task" && (
                    <>
                      <div className="ds-fab-kv">
                        <span>
                          当前任务<b>{task?.name || "—"}</b>
                        </span>
                        <span>
                          当前点位
                          <b>
                            {task?.items[Math.min(task.index, task.items.length - 1)]?.name || "—"}
                          </b>
                        </span>
                        <span>
                          待执行队列<b>{robot ? `${queue.length} 项` : "—"}</b>
                        </span>
                        <span>
                          机型约束
                          <b>{robot ? deviceProfile[robot.deviceType].taskConstraints.join(" / ") : "—"}</b>
                        </span>
                      </div>
                      {task && ["执行中", "暂停"].includes(task.state) && (
                        <div className="ds-cam">
                          <Can perm={PERMS.调度下发}>
                            <Btn
                              primary
                              onClick={() =>
                                task.state === "执行中"
                                  ? act({ type: "PAUSE", id: task.id })
                                  : act({ type: "START", id: task.id })
                              }
                            >
                              {task.state === "执行中" ? "暂停任务" : "继续任务"}
                            </Btn>
                          </Can>
                        </div>
                      )}
                    </>
                  )}

                  {pad === "cam" && (
                    <>
                      <div className="ds-cam">
                        <Btn disabled={!session || !robot} onClick={() => sendCmd("云台左转")}>
                          云台左
                        </Btn>
                        <Btn disabled={!session || !robot} onClick={() => sendCmd("云台右转")}>
                          云台右
                        </Btn>
                        <Btn disabled={!session || !robot} onClick={() => sendCmd("云台抬头")}>
                          抬头
                        </Btn>
                        <Can perm={PERMS.远程接管}>
                          <Btn
                            primary
                            disabled={!session || !robot}
                            onClick={() => sendCmd("采集照片")}
                          >
                            采集照片
                          </Btn>
                        </Can>
                      </div>
                      <div className="ds-lens">
                        <span className="ds-lens-readout">
                          倍率 <b>{field.zoom}×</b> · {field.focusMode}聚焦 {field.focus} · 补光
                          {field.light ? "开" : "关"}
                        </span>
                        <div className="ds-cam">
                          <Btn
                            disabled={!fieldOn("zoom") || field.zoom <= 1}
                            onClick={() => sendField("zoom", field.zoom - 1)}
                          >
                            变倍 −
                          </Btn>
                          <Btn
                            disabled={!fieldOn("zoom") || field.zoom >= 20}
                            onClick={() => sendField("zoom", field.zoom + 1)}
                          >
                            变倍 ＋
                          </Btn>
                          <Btn
                            disabled={!fieldOn("focusMode")}
                            onClick={() =>
                              sendField("focusMode", field.focusMode === "自动" ? "手动" : "自动")
                            }
                          >
                            {field.focusMode === "自动" ? "手动聚焦" : "自动聚焦"}
                          </Btn>
                          <Btn
                            disabled={!fieldOn("focus") || field.focusMode !== "手动"}
                            onClick={() => sendField("focus", field.focus - 5)}
                          >
                            近焦
                          </Btn>
                          <Btn
                            disabled={!fieldOn("focus") || field.focusMode !== "手动"}
                            onClick={() => sendField("focus", field.focus + 5)}
                          >
                            远焦
                          </Btn>
                          <Btn disabled={!fieldOn("light")} onClick={() => sendField("light", !field.light)}>
                            补光{field.light ? "关" : "开"}
                          </Btn>
                        </div>
                      </div>
                    </>
                  )}

                  {pad === "av" && (
                    <>
                      <div className="ds-cam">
                        <Btn disabled={!fieldOn("sound")} onClick={() => sendField("sound", !field.sound)}>
                          警笛{field.sound ? "关" : "开"}
                        </Btn>
                        <Btn disabled={!fieldOn("beacon")} onClick={() => sendField("beacon", !field.beacon)}>
                          警灯{field.beacon ? "关" : "开"}
                        </Btn>
                        <Btn disabled={!fieldOn("listen")} onClick={() => sendField("listen", !field.listening)}>
                          {field.listening ? "关闭拾音" : "连接拾音"}
                        </Btn>
                        <Btn
                          disabled={!fieldOn("talk")}
                          onPointerDown={talkDown}
                          onPointerUp={talkUp}
                          onPointerCancel={talkUp}
                          onBlur={talkUp}
                        >
                          按住讲话
                        </Btn>
                      </div>
                      <div className="ds-cam">
                        <select
                          className="ds-fab-select"
                          aria-label="预录播报内容"
                          value={clip}
                          onChange={(e) => C(e.target.value)}
                          disabled={!fieldOn("broadcast")}
                        >
                          {PRESETS.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                        <Btn disabled={!fieldOn("broadcast")} onClick={() => sendField("broadcast", clip)}>
                          播放预录
                        </Btn>
                        <Btn onClick={() => sendField("stop")}>停止输出</Btn>
                      </div>
                      <small className="ds-hint">
                        对讲与播报互斥；{field.broadcast ? `正在播报：${field.broadcast}` : "当前无播报"}
                        ，告警不会自动启动声光。
                      </small>
                    </>
                  )}
                </div>
              )}

              <div className="ds-fab-bar">
                <button className={pad === "nav" ? "active" : ""} onClick={() => PAD(pad === "nav" ? null : "nav")}>
                  <Compass size={13} />
                  导航
                </button>
                <button className={pad === "task" ? "active" : ""} onClick={() => PAD(pad === "task" ? null : "task")}>
                  <ListChecks size={13} />
                  任务
                </button>
                <button className={pad === "cam" ? "active" : ""} onClick={() => PAD(pad === "cam" ? null : "cam")}>
                  <Camera size={13} />
                  云台
                </button>
                <button className={pad === "av" ? "active" : ""} onClick={() => PAD(pad === "av" ? null : "av")}>
                  <Volume2 size={13} />
                  声光语音
                </button>
                <span className="ds-fab-info">
                  {robot
                    ? `${robot.id} · ${robot.state} · 电量 ${robot.battery}%${
                        task ? ` · ${task.name}` : ""
                      }`
                    : pickHint}
                </span>
              </div>
            </div>
          </div>
        </main>

        {/* ══ 右栏（350px）：告警 · 视频 · 日志 三 Tab 枢纽 ══ */}
        <aside className="ds-col ds-col-r">
          <section className="ds-card ds-hub grow">
            <div className="ds-hub-tabs">
              <button
                className={"ds-hub-tab t-alarm" + (hub === "alarm" ? " active" : "")}
                onClick={() => HUB("alarm")}
              >
                <BellRing size={13} />
                告警与SLA
                <b>{alarmGroups.length}</b>
              </button>
              <button
                className={"ds-hub-tab t-video" + (hub === "video" ? " active" : "")}
                onClick={() => HUB("video")}
              >
                <VideoIcon size={13} />
                视频信息
              </button>
            </div>

            {hub === "alarm" && (
              <div className="ds-hub-body">
                <section className="ds-sub">
                  <header>
                    <h4>告警 · 去重合并</h4>
                    <small>
                      分级抑制 · {activeId ? `${activeId} · ` : "全部机器 · "}
                      {alarmGroups.length} 组
                    </small>
                    <button className="ds-chip" onClick={() => go("alarms")}>
                      告警事件 ›
                    </button>
                  </header>
                  <AutoScrollList listClass="cs-work-list readonly">
                    {!alarmGroups.length && <Note>当前无未关闭告警。</Note>}
                    {alarmGroups.map((g) => (
                      <button key={g.key}>
                        <i className={"severity " + (g.head.level === "重要" ? "red" : "amber")} />
                        <div>
                          <b>{g.head.name}</b>
                          <small>
                            {g.head.pointId
                              ? g.head.pointId
                              : `${g.head.category}${g.head.robotId ? " " + g.head.robotId : ""}`}{" "}
                            · {g.head.state}
                            {g.items.length > 1 ? ` · 合并 ${g.items.length} 条` : ""}
                            {g.suppressed ? " · 已抑制" : ""}
                          </small>
                        </div>
                        <Badge>{g.head.level}</Badge>
                      </button>
                    ))}
                  </AutoScrollList>
                </section>

                <section className="ds-sub">
                  <header>
                    <h4>SLA 倒计时</h4>
                    <small>{openWos.length} 单未闭环</small>
                  </header>
                  <AutoScrollList listClass="cs-work-list readonly">
                    {!openWos.length && <Note>当前无未闭环工单。</Note>}
                    {openWos.map((w) => (
                      <button key={w.id}>
                        <i
                          className={
                            "severity " +
                            (w.slaState === "已升级" ? "red" : w.slaState === "预警" ? "amber" : "teal")
                          }
                        />
                        <div>
                          <b>{w.title}</b>
                          <small>
                            {w.level}级 · {w.assignee || "待派单"} ·{" "}
                            {w.slaLeft > 0 ? `剩余 ${w.slaLeft} 分钟` : `已超时 ${-w.slaLeft} 分钟`}
                            {w.slaState !== "正常" ? ` · ${w.slaState}` : ""}
                          </small>
                        </div>
                        <Badge>{w.state}</Badge>
                      </button>
                    ))}
                  </AutoScrollList>
                </section>
              </div>
            )}

            {hub === "video" && (
              <div className="ds-hub-body ds-video-body">
                {robot ? (
                  <>
                    <div className="cs-video-dual">
                      <Video live label="可见光主画面" robotId={robot.id} />
                      <Video live label="红外热像" robotId={robot.id} />
                    </div>
                    <div className="ds-fab-kv">
                      <span>
                        设备<b>{robot.id}</b>
                      </span>
                      <span>
                        机型<b>{robot.deviceType}</b>
                      </span>
                      <span>
                        区域<b>{robot.region}</b>
                      </span>
                      <span>
                        通信<b>{robot.state === "离线" ? "离线" : "在线"}</b>
                      </span>
                    </div>
                    <small className="ds-hint">
                      对讲 / 声光 / 播报在中央地图底部的悬浮操作台「声光语音」组，与画面同域操作。
                    </small>
                  </>
                ) : (
                  <>
                    <div className="cs-video-dual">
                      {["可见光主画面", "红外热像"].map((label) => (
                        <div className="video-placeholder" key={label}>
                          <CameraOff size={28} />
                          <b>{label}</b>
                          <small>未选择设备</small>
                        </div>
                      ))}
                    </div>
                    <small className="ds-hint">{pickHint}</small>
                  </>
                )}
              </div>
            )}

          </section>
        </aside>
      </div>

      {takeover && robot && (
        <TakeoverDialog
          robotId={robot.id}
          onClose={() => TAKEOVER(false)}
          onOpenConsole={() => go("manual", robot.id)}
          onResume={(id) => {
            act({ type: "START", id });
          }}
        />
      )}
      {/* 急停确认：高风险操作，需第二复核人确认 */}
      {estop && (
        <Modal title="确认紧急停止" onClose={() => ES(false)}>
          <Note>
            将立即暂停全部执行中任务、设备进入安全待机并强制释放遥控会话。该操作最高优先级，
            第二复核人：<b>{counterSign}</b>。
          </Note>
          <Btn
            danger
            onClick={() => {
              act({
                type: "EMERGENCY_STOP",
                reason: `双人复核（${counterSign}）确认执行急停`,
              });
              ES(false);
            }}
          >
            确认急停
          </Btn>
        </Modal>
      )}

      {home && (
        <Modal title="确认一键返航" onClose={() => HOME(false)}>
          <Note>
            将终止 {robot?.id} 当前任务并直接下发回充。第二复核人：<b>{counterSign}</b>。
          </Note>
          <Btn
            danger
            onClick={() => {
              if (robot) act({ type: "RETURN_HOME", robotId: robot.id });
              HOME(false);
            }}
          >
            确认返航
          </Btn>
        </Modal>
      )}
    </div>
  );
}
