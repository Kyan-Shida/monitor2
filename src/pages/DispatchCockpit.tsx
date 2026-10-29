/**
 * @file DispatchCockpit.tsx
 * @description 调度指挥驾驶舱（V3 版式重构）：**中央地图场景最大化 + 左右可折叠浮层面板**（与管理驾驶舱同款
 *   「左右块折叠 / 展开」形态）。
 *   ① 顶栏与「管理驾驶舱」共用同一个 ScreenTopBar（卡片底 · 左品牌与两舱 Tab · 居中发光标题 ·
 *      调度中心 / 全屏 / 紧急停止 · 时钟），两舱样式完全一致；
 *   ② 指挥 KPI 数字条悬浮于场景顶部（半透明毛玻璃徽标，不再占一整行版面）；
 *   ③ 中央场景：地图舞台铺满主区（图层 / 图例左上角、缩放控件右下角、底部半透明悬浮操作台）；
 *      左栏（浮层 · 可折叠）= 设备状态 + 当前设备折叠面板；右栏（浮层 · 可折叠）= 视频信息 单卡；
 *      贴边箭头整体收起 / 展开，折叠后场景全屏。
 *   配色口径（等价 Tailwind 语义，两舱统一）：底 `bg-slate-950 #020617` / 卡片 `slate-900 #0f172a` /
 *      边框 `slate-800 #1e293b` / 强调 `cyan-500 #06b6d4` + `red-500 #ef4444`。
 * @interaction 由 App.tsx 在 page === "screen" 时渲染；指标取自 data/metrics.ts，动作经 data/engine.ts
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CameraOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Video as VideoIcon,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Can } from "../components/Can";
import { PERMS } from "../data/roles";
import { Btn, Modal, Note } from "../components/UI";
import { MapCanvas } from "../components/MapCanvas";
import { ScreenTopBar, type CockpitId } from "../components/ScreenTopBar";
import { TakeoverDialog } from "../components/TakeoverDialog";
import { Video } from "../components/Video";
import {
  AvPad,
  GimbalPad,
  OpticalPad,
  RobotPad,
  type MoveCommand,
} from "../components/ManualPad";
import { metricValue, scopedState } from "../data/metrics";
import { deviceProfile, deviceTypes } from "../data/deviceProfile";
import { currentTask, robotColors, stageOf } from "../data/selectors";
import {
  fieldCapabilities,
  fieldDefault,
  type FieldCommand,
} from "../data/fieldControl";
import type { Alarm } from "../data/types";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

export function DispatchCockpit({
  onSwitch,
}: {
  /** 独立大屏窗口内的驾驶舱切换；后台外壳下缺省按路由跳转 */
  onSwitch?: (id: CockpitId) => void;
}) {
  const { s, act } = useStore();
  /** 设备筛选：仅按机型（区域已与机器人解绑，不再作为筛选维度） */
  const [devType, SETT] = useState("全部机型");
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
  /** 接管会话抽屉：点「进行接管」就地展开，不跳「人工操作与遥控」页（避免丢失当前选中设备与三栏上下文） */
  const [takeover, TAKEOVER] = useState(false);
  /** 云台电源：本地下电开关，关闭后云台方向键与速度滑块失能（不下发后台指令） */
  const [camOn, CAM] = useState(true);
  const [counterSign, CS] = useState("李主管");
  /** 左栏「当前设备」折叠面板：默认展开，可手动收起 */
  const [devOpen, DEVO] = useState(true);
  /** 左右数据面板折叠状态（true=展开；折叠后中央场景全屏，与管理驾驶舱一致） */
  const [openL, OPENL] = useState(true);
  const [openR, OPENR] = useState(true);
  /** 地图缩放倍率：仅作用于地图舞台内的图形层，配合右下角缩放控件 */
  const [zoom, ZOOM] = useState(1);
  /** 右栏宽度：null = 跟随样式表默认值（宽屏 420 / 窄屏 330），拖拽后改为固定像素 */
  const [rightW, RIGHTW] = useState<number | null>(null);
  /** 右栏节点：拖拽起始宽度按实际渲染宽度取，避免与媒体查询的默认值冲突 */
  const asideRef = useRef<HTMLElement>(null);
  /** 拖拽基准：按下时的指针横坐标与栏宽 */
  const dragRef = useRef<{ x: number; w: number } | null>(null);

  useEffect(() => {
    const onFs = () => FS(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const sc = scopedState(s);
  const mv = (key: string) => metricValue(sc, key);

  /** 设备列表：仅按机型筛选 */
  const robots = s.robots.filter(
    (r) => devType === "全部机型" || r.deviceType === devType,
  );
  /** 单台生效的机器：全选状态下不指定单台（仅作整体展示，操控需点选单台） */
  const activeId = allSel ? undefined : selected;
  /** 当前设备：仅当左栏选中单台机器时存在；未选中 / 全选时所有操控入口不可用 */
  const robot = robots.find((r) => r.id === activeId);
  /** 未选中设备时的引导文案：区分「已全选」与「未选择」 */
  const pickHint = allSel
    ? "已全选设备：操控仅支持单台，请在设备列表中点选一台机器"
    : "未选择设备：请先在左侧设备列表点选一台机器";
  const task = robot ? currentTask(s, robot) : undefined;
  /** 有效接管会话：只有已接管且未到期时才允许下发手动指令 */
  const session = s.sessions.find(
    (x) =>
      x.robotId === robot?.id && x.state === "已接管" && x.expires > Date.now(),
  );

  /** 指挥 KPI 数字条：5 项待处置量，悬浮场景顶部，只读展示 */
  const strip = [
    { n: mv("onlineCount"), label: "在线设备（台）" },
    { n: mv("executing"), label: "执行中任务（个）" },
    { n: mv("lowBattery"), label: "低电量设备（台）" },
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
  /** 切换设备前先释放当前对讲，避免上一台持续占用发声通道 */
  const releaseTalk = () => {
    if (field.talking) sendField("talk", false);
  };
  /** 右栏拖拽：按下记基准，向左拖变宽（视频画面随之放大），夹在 320–760 */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, w: asideRef.current?.offsetWidth ?? 420 };
  };
  const moveResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    RIGHTW(Math.min(760, Math.max(320, d.w + d.x - e.clientX)));
  };
  const endResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  /** 拾音不受接管会话限制（只读监听），仅要求机型支持且在线 */
  const canListen =
    !!robot &&
    robot.state !== "离线" &&
    fieldCapabilities(robot).includes("listen");
  /** 宽口径会话（含待暂停确认 / 退出核对中）：用于驱动接管浮层的自动收放 */
  const flowSession = s.sessions.find(
    (x) => x.robotId === robot?.id && !["已释放", "已超时"].includes(x.state),
  );
  const prevFlow = useRef<string | undefined>(undefined);
  useEffect(() => {
    const st = flowSession?.state;
    if (prevFlow.current === st) return;
    prevFlow.current = st;
    // 拿到控制权即关闭浮层，把画面与操控让给用户；进入退出核对时自动重新打开，避免漏掉释放
    if (st === "已接管") TAKEOVER(false);
    else if (st === "退出核对中") TAKEOVER(true);
  }, [flowSession?.state]);


  return (
    <div className="cockpit-screen ds-root ds-v2" ref={shellRef}>
      {/* 大屏全局导航栏：品牌 + 导航 Tab + 发光标题 + 本舱控件 + 时间
          （调度中心属导航、全屏属显示控制、紧急停止为全局动作，三者归顶栏） */}
      <ScreenTopBar
        current="screen"
        onSwitch={onSwitch}
        extra={
          <>
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
      {fsError && <Note>{fsError}</Note>}

      <div
        className={
          "ds-grid ds-scene-layout" +
          (openL ? "" : " fold-l") +
          (openR ? "" : " fold-r")
        }
        style={rightW ? ({ "--col-r": `${rightW}px` } as CSSProperties) : undefined}
      >
        {/* ══ 左栏（浮层 · 可折叠）：设备状态 + 当前设备 ══ */}
        <aside className={"ds-col ds-col-l" + (openL ? "" : " folded")}>
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
            {/* 指挥 KPI：嵌在「设备状态」卡顶部，四等分一行 */}
            <div className="cs-kpi-strip ds-strip-float">
              {strip.map((x) => (
                <div key={x.label} className="cs-kpi">
                  <b>{x.n}</b>
                  <span>{x.label}</span>
                </div>
              ))}
            </div>
            <div className="ds-selects">
              <select aria-label="机型" value={devType} onChange={(e) => SETT(e.target.value)}>
                {["全部机型", ...deviceTypes].map((x) => (
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
                    const next = r.id === selected ? undefined : r.id;
                    releaseTalk();
                    TAKEOVER(false);
                    SETALL(false);
                    SEL(next);
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
                    {/* 接管入口：既是按钮也是浮层开关，文字/灯色直接反映会话状态 */}
                    <Can perm={PERMS.远程接管}>
                      <button
                        className={"ds-takeover" + (session ? " on" : "")}
                        disabled={!robot}
                        onClick={() => TAKEOVER(true)}
                        title={session ? `会话 ${session.id}` : "建立独占控制会话"}
                      >
                        <ShieldCheck size={13} />
                        {session ? `接管 · ${session.state}` : "进行接管"}
                      </button>
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
            {/* 选中机器后地图整体缩小居中，给底部操控面板与左右浮层腾出视野 */}
            <div
              className="ds-stage-map"
              style={{ transform: `scale(${zoom * (robot ? 0.86 : 1)})` }}
            >
              <MapCanvas
                points={layers.points ? sc.points : []}
                robots={robots}
                chargers={layers.chargers ? s.chargers : []}
                rails={layers.rails ? s.railSections : []}
                fit="xMidYMid meet"
                selectedRobot={activeId}
                highlightAll={allSel}
                onRobot={(rid) => {
                  const next = rid === selected ? undefined : rid;
                  releaseTalk();
                  TAKEOVER(false);
                  SETALL(false);
                  SEL(next);
                  DEVO(true);
                }}
              />
            </div>

          </div>
        </main>

        {/* ══ 右栏（浮层 · 可折叠）：视频信息 单卡 ══ */}
        <aside
          ref={asideRef}
          className={"ds-col ds-col-r" + (openR ? "" : " folded")}
        >
          {/* 左边缘拖拽条：手动拉宽右栏，视频画面随之变大 */}
          <div
            className="ds-resizer"
            role="separator"
            aria-label="拖动调整视频栏宽度"
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
          {/* 视频信息：选中设备后的双画面 */}
          <section className="ds-card grow">
            <header className="ds-head">
              <h3>
                <VideoIcon size={13} />
                视频信息
              </h3>
              <small>{robot ? `${robot.id} · ${robot.state}` : "未选择设备"}</small>
            </header>
            <div className="ds-video-body">
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
              <small className="ds-hint">
                {robot
                  ? "对讲 / 声光在底部操控面板「对话」组，与画面同域操作。"
                  : pickHint}
              </small>
            </div>
          </section>
        </aside>

        {/* 折叠按钮：展开时贴在面板外侧，收起后回到屏幕边缘（场景全屏） */}
        <button
          className={"ds-fold ds-fold-l" + (openL ? " open" : "")}
          title={openL ? "收起左侧面板" : "展开左侧面板"}
          onClick={() => OPENL((v) => !v)}
        >
          {openL ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
        </button>
        <button
          className={"ds-fold ds-fold-r" + (openR ? " open" : "")}
          title={openR ? "收起右侧面板" : "展开右侧面板"}
          onClick={() => OPENR((v) => !v)}
        >
          {openR ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>

        {/* 操控面板：挂在场景网格层（z6 高于左右浮层 z2，不会被视频栏遮住）；
            平时藏在下沿之外，选中机器后上滑；未接管时只给「进行接管」+ 急停 */}
        <div className={"ds-fab" + (robot ? " open" : "")}>
          {session ? (
            <div className="ds-mp">
              <RobotPad
                disabled={!robot || robot.state === "离线"}
                speed={speed}
                onSpeed={SPEED}
                onMove={sendMove}
                onEstop={() => ES(true)}
              />
              <GimbalPad
                disabled={!robot || robot.state === "离线"}
                camOn={camOn}
                onCam={() => CAM(!camOn)}
                speed={speed}
                onSpeed={SPEED}
                onDir={sendCmd}
              />
              <OpticalPad
                zoom={field.zoom}
                focus={field.focus}
                focusMode={field.focusMode}
                canZoom={fieldOn("zoom")}
                canFocus={fieldOn("focus")}
                canMode={fieldOn("focusMode")}
                onZoom={(v) => sendField("zoom", v)}
                onFocus={(v) => sendField("focus", v)}
                onMode={() =>
                  sendField("focusMode", field.focusMode === "自动" ? "手动" : "自动")
                }
              />
              <AvPad
                beacon={field.beacon}
                listening={field.listening}
                talking={field.talking}
                canBeacon={fieldOn("beacon")}
                canListen={canListen}
                canTalk={fieldOn("talk")}
                onBeacon={() => sendField("beacon", !field.beacon)}
                onListen={() => sendField("listen", !field.listening)}
                onTalk={(on) => sendField("talk", on)}
              />
            </div>
          ) : (
            <div className="ds-gate">
              <button className="ds-gate-btn" onClick={() => TAKEOVER(true)}>
                进行接管
              </button>
              <button className="ds-mp-estop" onClick={() => ES(true)}>
                急停
              </button>
            </div>
          )}
        </div>

        {/* 接管会话浮层：贴在地图区右上角、不遮视频，接管生效后自动收成小胶囊 */}
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
      </div>

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
