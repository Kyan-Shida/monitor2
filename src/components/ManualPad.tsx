/**
 * @file ManualPad.tsx
 * @description 驾驶舱手动控制盘：机器人 / 云台 / 可见光 / 声光 四组圆盘式控件
 * @interaction 由 pages/DispatchCockpit.tsx 消费。方向与镜头指令经 act 进入状态机；
 *   云台电源为本地下电开关（仅决定方向键是否可点），不下发后台指令
 */
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crosshair,
  Megaphone,
  Mic,
  Minus,
  Plus,
  Power,
  Siren,
} from "lucide-react";
import type { ReactNode } from "react";

/** 底盘方向指令集（与状态机 CONTROL 的位移分支一致） */
export type MoveCommand = "前进" | "后退" | "左移" | "右移";
/** 云台方向指令集（与状态机 CONTROL 的 pan / tilt 分支一致） */
export type GimbalCommand = "云台左转" | "云台右转" | "云台抬头" | "云台低头";
/** 方向键四向 */
type DirKey = "up" | "down" | "left" | "right";

/** 卡片外壳：标题 + 自定义短下划线（统一四组控件的视觉口径） */
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ds-mp-card">
      <h4>{title}</h4>
      <div className="ds-mp-body">{children}</div>
    </section>
  );
}

/** 圆形方向键：外环虚线 + 中央发光圆芯，四向各自独立禁用 */
function DirPad({
  disabled,
  onDir,
  labels,
}: {
  disabled?: boolean;
  onDir: (d: DirKey) => void;
  labels: Record<DirKey, string>;
}) {
  const btn = (d: DirKey, Icon: typeof ChevronUp) => (
    <button
      type="button"
      className={d}
      disabled={disabled}
      aria-label={labels[d]}
      title={labels[d]}
      onClick={() => onDir(d)}
    >
      <Icon size={15} />
    </button>
  );
  return (
    <div className="ds-mp-dir">
      {btn("up", ChevronUp)}
      {btn("left", ChevronLeft)}
      <span className="core" aria-hidden="true">
        <Crosshair size={13} />
      </span>
      {btn("right", ChevronRight)}
      {btn("down", ChevronDown)}
    </div>
  );
}

/** 垂直速度滑块：值越大白点越高（range 旋转 -90° 实现，跨内核表现一致） */
function VSlider({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="ds-mp-speed">
      <span>速度</span>
      <span className="rail">
        <input
          type="range"
          min={1}
          max={9}
          step={1}
          value={value}
          disabled={disabled}
          aria-label="速度档位"
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </span>
      <b>{value}</b>
    </label>
  );
}

/** 加减键组：变倍 / 聚焦各一组，上键加、下键减 */
function StepKeys({
  label,
  onPlus,
  onMinus,
  plusDisabled,
  minusDisabled,
}: {
  label: string;
  onPlus: () => void;
  onMinus: () => void;
  plusDisabled?: boolean;
  minusDisabled?: boolean;
}) {
  return (
    <div className="ds-mp-steps">
      <span>{label}</span>
      <div className="keys">
        <button
          type="button"
          disabled={plusDisabled}
          aria-label={`${label}增加`}
          title={`${label}增加`}
          onClick={onPlus}
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          disabled={minusDisabled}
          aria-label={`${label}减小`}
          title={`${label}减小`}
          onClick={onMinus}
        >
          <Minus size={14} />
        </button>
      </div>
    </div>
  );
}

/** 机器人控制：方向键 + 垂直速度 + 急停（急停为全局安全动作，不随会话状态禁用） */
export function RobotPad({
  disabled,
  speed,
  onSpeed,
  onMove,
  onEstop,
}: {
  disabled?: boolean;
  speed: number;
  onSpeed: (v: number) => void;
  onMove: (cmd: MoveCommand) => void;
  onEstop: () => void;
}) {
  const map: Record<DirKey, MoveCommand> = {
    up: "前进",
    down: "后退",
    left: "左移",
    right: "右移",
  };
  return (
    <Card title="机器人控制">
      <DirPad disabled={disabled} onDir={(d) => onMove(map[d])} labels={map} />
      <VSlider value={speed} onChange={onSpeed} disabled={disabled} />
      <button type="button" className="ds-mp-estop" onClick={onEstop} title="紧急停止">
        急停
      </button>
    </Card>
  );
}

/** 云台控制：方向键 + 垂直速度 + 云台电源开关（关闭时方向键失能） */
export function GimbalPad({
  disabled,
  camOn,
  onCam,
  speed,
  onSpeed,
  onDir,
}: {
  disabled?: boolean;
  camOn: boolean;
  onCam: () => void;
  speed: number;
  onSpeed: (v: number) => void;
  onDir: (cmd: GimbalCommand) => void;
}) {
  const map: Record<DirKey, GimbalCommand> = {
    up: "云台抬头",
    down: "云台低头",
    left: "云台左转",
    right: "云台右转",
  };
  return (
    <Card title="云台控制">
      <DirPad disabled={disabled || !camOn} onDir={(d) => onDir(map[d])} labels={map} />
      <VSlider value={speed} onChange={onSpeed} disabled={disabled || !camOn} />
      <button
        type="button"
        className={"ds-mp-power" + (camOn ? " on" : "")}
        onClick={onCam}
        aria-pressed={camOn}
        title={camOn ? "关闭云台" : "开启云台"}
      >
        <Power size={16} />
        云台
      </button>
    </Card>
  );
}

/** 可见光控制：聚焦模式圆钮 + 变倍 / 聚焦两组加减键 */
export function OpticalPad({
  zoom,
  focus,
  focusMode,
  canZoom,
  canFocus,
  canMode,
  onZoom,
  onFocus,
  onMode,
}: {
  zoom: number;
  focus: number;
  focusMode: string;
  canZoom: boolean;
  canFocus: boolean;
  canMode: boolean;
  onZoom: (v: number) => void;
  onFocus: (v: number) => void;
  onMode: () => void;
}) {
  return (
    <Card title="可见光控制">
      <button
        type="button"
        className={"ds-mp-mode" + (canMode ? "" : " off")}
        disabled={!canMode}
        onClick={onMode}
        title={`切换到${focusMode === "自动" ? "手动" : "自动"}聚焦`}
      >
        <span>聚焦模式</span>
        <b>{focusMode}</b>
      </button>
      <StepKeys
        label="变倍"
        plusDisabled={!canZoom || zoom >= 20}
        minusDisabled={!canZoom || zoom <= 1}
        onPlus={() => onZoom(zoom + 1)}
        onMinus={() => onZoom(zoom - 1)}
      />
      <StepKeys
        label="聚焦"
        plusDisabled={!canFocus || focusMode !== "手动" || focus >= 100}
        minusDisabled={!canFocus || focusMode !== "手动" || focus <= 0}
        onPlus={() => onFocus(focus + 5)}
        onMinus={() => onFocus(focus - 5)}
      />
    </Card>
  );
}

/** 对话：警灯 / 拾音 / 说话 三个开关 */
export function AvPad({
  beacon,
  listening,
  talking,
  canBeacon,
  canListen,
  canTalk,
  onBeacon,
  onListen,
  onTalk,
}: {
  beacon: boolean;
  listening: boolean;
  talking: boolean;
  canBeacon: boolean;
  canListen: boolean;
  canTalk: boolean;
  onBeacon: () => void;
  onListen: () => void;
  onTalk: (on: boolean) => void;
}) {
  const rows = [
    {
      key: "beacon",
      label: "警灯",
      icon: <Siren size={14} />,
      on: beacon,
      disabled: !canBeacon,
      toggle: onBeacon,
    },
    {
      key: "listen",
      label: "拾音",
      icon: <Mic size={14} />,
      on: listening,
      disabled: !canListen,
      toggle: onListen,
    },
    {
      key: "talk",
      label: "说话",
      icon: <Megaphone size={14} />,
      on: talking,
      disabled: !canTalk,
      toggle: () => onTalk(!talking),
    },
  ];
  return (
    <Card title="对话">
      <div className="ds-mp-av">
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            role="switch"
            aria-checked={r.on}
            className={"ds-mp-switch" + (r.on ? " on" : "")}
            disabled={r.disabled}
            onClick={r.toggle}
          >
            {r.icon}
            <span>{r.label}</span>
            <i aria-hidden="true" />
          </button>
        ))}
      </div>
    </Card>
  );
}
