/**
 * @file DispatchCockpit.tsx
 * @description 调度指挥驾驶舱：深色大屏形态（顶部菜单条 + 居中标题 + 左中右三栏 + 双导航控制盘 + 底部指挥操作区），
 *              提供手动导航、任务导航、多层地图、告警去重合并与分级抑制、SLA 倒计时与超时升级、一键派单
 * @interaction 由 App.tsx 在 page === "screen" 时渲染；指标取自 data/metrics.ts，动作经 data/engine.ts
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CameraOff, Maximize, Minimize } from "lucide-react";
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
import { Sparkline } from "../components/Sparkline";
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
  const [now, NOW] = useState(() => new Date());
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
  /** 告警去重合并：同点位 + 同级别的未关闭告警合并为一条，标注合并条数 */
  const alarmGroups = useMemo(() => {
    const groups = new Map<string, Alarm[]>();
    scopedAlarms.forEach((a) => {
      const key = `${a.pointId}|${a.level}`;
      groups.set(key, [...(groups.get(key) || []), a]);
    });
    return [...groups.entries()].map(([key, items]) => ({
      key,
      items,
      head: items[0],
      /** 分级抑制：同点位存在更高级别告警时，低级别仅记录不推送处置 */
      suppressed: scopedAlarms.some(
        (x) =>
          x.pointId === items[0].pointId &&
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

  /** 巡检明细：选中机器时展示该机器任务的巡检数据，未选中 / 全选时展示全部机器（仅自动滚动播放，不可点击） */
  const detailResults = useMemo(() => {
    const scope = activeId
      ? s.results.filter(
          (r) => s.tasks.find((t) => t.id === r.taskId)?.robotId === activeId,
        )
      : s.results;
    return scope.slice(0, 20);
  }, [s.results, s.tasks, activeId]);
  /** 采集数据流：取最近可解析为数值的检测结果，用于波形（无数据时不绘制） */
  const wave = s.results
    .filter((r) => Number.isFinite(Number(r.final)))
    .slice(0, 14)
    .reverse()
    .map((r, i) => ({ d: String(i + 1), v: Number(r.final) }));
  const pointName = (pid: string) =>
    s.points.find((p) => p.id === pid)?.name || pid;

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
    <div className="cockpit-screen ds-root" ref={shellRef}>
      {/* 大屏全局导航栏：品牌 + 导航 Tab + 发光标题 + 本舱控件 + 时间
          （原「驾驶舱工具条」独立一行已取消：调度中心属导航、全屏属显示控制、紧急停止为全局动作，
            三者归顶栏；现场音视频控制归入右侧「视频信息」卡头，与它控制的画面同域） */}
      <ScreenTopBar
        current="screen"
        onSwitch={onSwitch}
        extra={
          <>
            <Btn onClick={() => go("dispatch", robot?.id)}>调度中心</Btn>
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
                紧急停止
              </button>
            </Can>
          </>
        }
      />
      {/* 指挥 KPI 数字条：与管理驾驶舱完全同款（8 格），均为当前待处置量 */}
      {/* KPI 数字条：只读展示，不做下钻跳转 */}
      <div className="cs-kpi-strip">
        {strip.map((x) => (
          <div key={x.label} className="cs-kpi">
            <b>{x.n}</b>
            <span>{x.label}</span>
          </div>
        ))}
      </div>
      {fsError && <Note>{fsError}</Note>}

      <div className="cs-body ds-body">
        {/* 左：设备状态 + 数据采集 + 巡检明细 */}
        <aside className="cs-left">
          {/* grow：撑满列高，与中/右两栏底边对齐 */}
          <section className="cs-card grow">
            <h3>
              设备状态
              <small>在线 {mv("onlineCount")}/{mv("devices")}</small>
              {/* 全选：一次选中当前筛选的全部机器（地图全部高亮；操控仍需点选单台） */}
              <span className="cs-range">
                <button
                  className={allSel ? "active" : ""}
                  title="一次选中当前筛选的全部机器"
                  onClick={() => {
                    SETALL(!allSel);
                    SEL(undefined);
                  }}
                >
                  {allSel ? "取消全选" : "全选"}
                </button>
              </span>
            </h3>
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
            <div className="cs-list">
              {robots.map((r) => (
                <button
                  key={r.id}
                  className={allSel || r.id === selected ? "active" : ""}
                  title="点击选中该机器后可执行导航 / 任务 / 云台操作；再次点击取消选择"
                  onClick={() => {
                    SETALL(false);
                    SEL(r.id === selected ? undefined : r.id);
                  }}
                >
                  <i
                    className="cs-dot"
                    style={{ background: robotColors[r.state] }}
                  />
                  <div>
                    <b>
                      {r.id}
                      <em>{r.deviceType}</em>
                    </b>
                    <small>{r.state}</small>
                  </div>
                  <span className="cs-bar">
                    <i style={{ width: `${r.battery}%` }} />
                  </span>
                  <em className="cs-battery">{r.battery}%</em>
                </button>
              ))}
              {!robots.length && <Note>当前筛选条件下无设备。</Note>}
            </div>
          </section>

          <section className="cs-card">
            <h3>
              当前设备
              <small>{robot ? robot.id : "未选择"}</small>
            </h3>
            <div className="cs-kv">
              <span>
                机型<b>{robot?.deviceType || "—"}</b>
              </span>
              <span>
                区域<b>{robot?.region || "—"}</b>
              </span>
              <span>
                电量<b>{robot ? `${robot.battery}%` : "—"}</b>
              </span>
              <span>
                通信
                <b>{robot ? (robot.state === "离线" ? "离线" : "在线") : "—"}</b>
              </span>
              <span>
                巡检进度<b>{robot ? stageOf(task) : "—"}</b>
              </span>
              <span>
                接管会话<b>{robot ? (session ? session.id : "未接管") : "—"}</b>
              </span>
            </div>
            {/* 操控入口：未选中机器时一律不可用；接管就地开抽屉，不跳「人工操作与遥控」页 */}
            <div className="actions">
              <Can perm={PERMS.远程接管}>
                <Btn
                  primary
                  disabled={!robot}
                  onClick={() => TAKEOVER(true)}
                >
                  {session ? "接管会话" : "申请接管"}
                </Btn>
              </Can>
              <Can perm={PERMS.一键返航充电}>
                <Btn disabled={!robot} onClick={() => HOME(true)}>一键返航</Btn>
                {robot?.state === "返航中" && <Btn onClick={() => act({ type: "RETURN_ARRIVED", robotId: robot.id })}>模拟到位回报</Btn>}
              </Can>
            </div>
            {/* 声光 / 语音不在本卡：统一放在中栏底部控制带的第 4 块「声光 · 语音」，避免同一能力两处入口 */}
            <small className="cs-hint">
              {robot
                ? session
                  ? `会话已生效，可下发导航 / 云台 / 镜头 / 声光语音指令 · 关机重点：${deviceProfile[robot.deviceType].focusItems.join(" / ")}`
                  : `点「申请接管」就地建立会话后，导航 / 云台 / 镜头 / 声光语音才可用 · 关机重点：${deviceProfile[robot.deviceType].focusItems.join(" / ")}`
                : pickHint}
            </small>
          </section>

          <section className="cs-card">
            <h3>
              采集数据流
              <small>{wave.length} 个观测点</small>
            </h3>
            {wave.length >= 2 ? (
              <Sparkline list={wave} ok />
            ) : (
              <small className="cs-hint">
                观测点不足 2 个，不绘制波形（不插值补造）
              </small>
            )}
            <small className="cs-hint">
              来自巡检结果的实际读数序列，非信号仿真。
            </small>
          </section>

          <section className="cs-card">
            <h3>
              巡检明细
              <small>
                {activeId ? `${activeId} · 自动播放` : "全部机器 · 自动播放"}
              </small>
            </h3>
            {/* 自动上下滚动播放：纯展示，不提供点击与手动上下拉动 */}
            <AutoScrollList listClass="cs-work-list readonly">
              {!detailResults.length && <Note>暂无巡检结果。</Note>}
              {detailResults.map((r) => (
                <button key={r.id}>
                  <div>
                    <b>{pointName(r.pointId)}</b>
                    <small>
                      {r.item} · {r.time}
                    </small>
                  </div>
                  <em>
                    {r.final} {r.unit}
                  </em>
                  <Badge>{r.status}</Badge>
                </button>
              ))}
            </AutoScrollList>
          </section>
        </aside>

        {/* 中：地图 + 双导航控制盘 */}
        <main className="cs-center">
          <section className="cs-card cs-map-card grow">
            <h3>
              机器人位置
              <small>
                {robot
                  ? `${robot.id} · 坐标 (${robot.x}, ${robot.y})`
                  : allSel
                    ? `已全选 ${robots.length} 台 · 点选单台查看坐标`
                    : "未选择设备 · 点选左侧列表或地图上的机器"}
              </small>
            </h3>
            <div className="ds-layers">
              {(
                [
                  ["points", "点位图层"],
                  ["chargers", "充电桩"],
                  ["rails", "轨道区段"],
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
              <button
                title="BIM / 室内楼层待数据源接入"
                onClick={() => undefined}
              >
                BIM 视图
              </button>
            </div>
            <div className="cs-map">
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
                }}
              />
            </div>
            <div className="cs-map-legend">
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
          </section>

          <div className="ds-pads">
            <section className="cs-card">
              <h3>
                机器人导航
                <small>手动</small>
              </h3>
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
            </section>

            <section className="cs-card">
              <h3>
                任务导航
                <small>
                  {robot ? (task ? task.id : "无执行中任务") : "未选择设备"}
                </small>
              </h3>
              <div className="cs-kv">
                <span>
                  当前任务<b>{task?.name || "—"}</b>
                </span>
                <span>
                  当前点位
                  <b>
                    {task?.items[Math.min(task.index, task.items.length - 1)]?.name ||
                      "—"}
                  </b>
                </span>
                <span>
                  待执行队列<b>{robot ? `${queue.length} 项` : "—"}</b>
                </span>
                <span>
                  机型约束
                  <b>
                    {robot
                      ? deviceProfile[robot.deviceType].taskConstraints.join(" / ")
                      : "—"}
                  </b>
                </span>
              </div>
              {/* 任务操作：仅选中机器且存在执行中 / 暂停任务时可用 */}
              {task && ["执行中", "暂停"].includes(task.state) && (
                <div className="actions">
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
              <small className="cs-hint">
                {robot
                  ? "自动巡航由任务引擎按点位顺序执行；手动导航仅用于特殊情况接管。"
                  : pickHint}
              </small>
            </section>

            <section className="cs-card">
              <h3>
                云台控制
                <small>相机</small>
              </h3>
              <div className="ds-cam">
                <Btn
                  disabled={!session || !robot}
                  onClick={() => sendCmd("云台左转")}
                >
                  云台左
                </Btn>
                <Btn
                  disabled={!session || !robot}
                  onClick={() => sendCmd("云台右转")}
                >
                  云台右
                </Btn>
                <Btn
                  disabled={!session || !robot}
                  onClick={() => sendCmd("云台抬头")}
                >
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
              {/* 镜头调控：变倍 / 聚焦 / 补光。与「现场控制」弹窗同源（都走 FIELD_COMMAND），
                  故可用性口径一致：需已接管 + 该机型支持 + 在线 */}
              <div className="ds-lens">
                <span className="ds-lens-readout">
                  倍率 <b>{field.zoom}×</b> · {field.focusMode}聚焦 {field.focus} ·
                  补光{field.light ? "开" : "关"}
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
                      sendField(
                        "focusMode",
                        field.focusMode === "自动" ? "手动" : "自动",
                      )
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
                  <Btn
                    disabled={!fieldOn("light")}
                    onClick={() => sendField("light", !field.light)}
                  >
                    补光{field.light ? "关" : "开"}
                  </Btn>
                </div>
              </div>
              <small className="cs-hint">
                {robot
                  ? "接管后可调整云台与镜头并抓拍留档；声光与对讲在右侧「声光 · 语音」卡。"
                  : pickHint}
              </small>
            </section>

            {/* 第 4 块：声光 / 对讲 / 播报——现场操作类集中在这一条控制带，不再开弹窗 */}
            <section className="cs-card">
              <h3>
                声光 · 语音
                <small>
                  {robot ? (session ? "接管中" : "需先接管") : "未选择设备"}
                </small>
              </h3>
              <div className="ds-cam">
                <Btn
                  disabled={!fieldOn("sound")}
                  onClick={() => sendField("sound", !field.sound)}
                >
                  警笛{field.sound ? "关" : "开"}
                </Btn>
                <Btn
                  disabled={!fieldOn("beacon")}
                  onClick={() => sendField("beacon", !field.beacon)}
                >
                  警灯{field.beacon ? "关" : "开"}
                </Btn>
                <Btn
                  disabled={!fieldOn("listen")}
                  onClick={() => sendField("listen", !field.listening)}
                >
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
              <select
                aria-label="预录播报内容"
                value={clip}
                onChange={(e) => C(e.target.value)}
                disabled={!fieldOn("broadcast")}
              >
                {PRESETS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <div className="ds-cam">
                <Btn
                  disabled={!fieldOn("broadcast")}
                  onClick={() => sendField("broadcast", clip)}
                >
                  播放预录
                </Btn>
                <Btn onClick={() => sendField("stop")}>停止输出</Btn>
              </div>
              <small className="cs-hint">
                {robot
                  ? `对讲与播报互斥；${field.broadcast ? `正在播报：${field.broadcast}` : "当前无播报"}，告警不会自动启动声光。`
                  : pickHint}
              </small>
            </section>
          </div>
        </main>

        {/* 右：告警与 SLA + 视频信息 */}
        <aside className="cs-right">
          <section className="cs-card grow">
            <h3>
              告警 · 去重合并
              <small>
                分级抑制 · {activeId ? `${activeId} · ` : "全部机器 · "}
                {alarmGroups.length} 组 · 自动播放
              </small>
              {/* 唯一入口按钮：进入告警事件页；列表本身不逐条加按钮 */}
              <span className="cs-range">
                <button onClick={() => go("alarms")}>告警事件 ›</button>
              </span>
            </h3>
            {/* 自动上下滚动播放：纯展示，不提供点击与手动上下拉动 */}
            <AutoScrollList listClass="cs-work-list readonly">
              {!alarmGroups.length && <Note>当前无未关闭告警。</Note>}
              {alarmGroups.map((g) => (
                <button key={g.key}>
                  <i
                    className={
                      "severity " + (g.head.level === "重要" ? "red" : "amber")
                    }
                  />
                  <div>
                    <b>{g.head.name}</b>
                    <small>
                      {g.head.pointId} · {g.head.state}
                      {g.items.length > 1 ? ` · 合并 ${g.items.length} 条` : ""}
                      {g.suppressed ? " · 已抑制（同点位存在更高级别）" : ""}
                    </small>
                  </div>
                  <Badge>{g.head.level}</Badge>
                </button>
              ))}
            </AutoScrollList>
          </section>

          <section className="cs-card">
            <h3>
              SLA 倒计时
              {/* 不受机器选择影响：恒为全部未闭环工单 */}
              <small>{openWos.length} 单未闭环 · 自动播放</small>
            </h3>
            {/* 自动上下滚动播放：纯展示，不提供点击与手动上下拉动 */}
            <AutoScrollList listClass="cs-work-list readonly">
              {!openWos.length && <Note>当前无未闭环工单。</Note>}
              {openWos.map((w) => (
                <button key={w.id}>
                  <i
                    className={
                      "severity " +
                      (w.slaState === "已升级"
                        ? "red"
                        : w.slaState === "预警"
                          ? "amber"
                          : "teal")
                    }
                  />
                  <div>
                    <b>{w.title}</b>
                    <small>
                      {w.level}级 · {w.assignee || "待派单"} ·{" "}
                      {w.slaLeft > 0
                        ? `剩余 ${w.slaLeft} 分钟`
                        : `已超时 ${-w.slaLeft} 分钟`}
                      {w.slaState !== "正常" ? ` · ${w.slaState}` : ""}
                    </small>
                  </div>
                  <Badge>{w.state}</Badge>
                </button>
              ))}
            </AutoScrollList>
          </section>

          <section className="cs-card">
            <h3>
              视频信息
              {robot && <small>{robot.id} 实时画面</small>}
              {/* 对讲 / 声光 / 播报已全部内联到底部控制带（第 4 块「声光 · 语音」），此处不再放入口 */}
            </h3>
            {/* 仅在选中单台机器时展示该机器画面；未选中 / 全选时用空白占位（保持卡片布局稳定） */}
            {robot ? (
              <div className="cs-video-dual">
                <Video live label="可见光主画面" robotId={robot.id} />
                <Video live label="红外热像" robotId={robot.id} />
              </div>
            ) : (
              <div className="cs-video-dual">
                {["可见光主画面", "红外热像"].map((label) => (
                  <div className="video-placeholder" key={label}>
                    <CameraOff size={28} />
                    <b>{label}</b>
                    <small>未选择设备</small>
                  </div>
                ))}
              </div>
            )}
            {!robot && <small className="cs-hint">{pickHint}</small>}
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
