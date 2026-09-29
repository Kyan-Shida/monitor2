import type { Robot, State } from "./types";
export type FieldCommand =
  | "listen"
  | "talk"
  | "zoom"
  | "focusMode"
  | "focus"
  | "light"
  | "sound"
  | "beacon"
  | "broadcast"
  | "stop";
export interface FieldState {
  listening: boolean;
  talking: boolean;
  zoom: number;
  focusMode: string;
  focus: number;
  light: boolean;
  sound: boolean;
  beacon: boolean;
  broadcast: string;
  lastCommand: string;
  status: string;
}
export const fieldDefault = (): FieldState => ({
  listening: false,
  talking: false,
  zoom: 1,
  focusMode: "自动",
  focus: 50,
  light: false,
  sound: false,
  beacon: false,
  broadcast: "",
  lastCommand: "尚未下发",
  status: "就绪",
});
export function fieldCapabilities(r: Robot): FieldCommand[] {
  return r.deviceType === "挂轨"
    ? ["listen", "zoom", "focusMode", "focus", "light", "stop"]
    : r.deviceType === "四轮车"
      ? ["listen", "zoom", "focusMode", "focus", "light", "beacon", "stop"]
      : [
          "listen",
          "talk",
          "zoom",
          "focusMode",
          "focus",
          "light",
          "sound",
          "beacon",
          "broadcast",
          "stop",
        ];
}
export function activeControl(s: State, rid: string) {
  return s.sessions.find(
    (x) => x.robotId === rid && x.state === "已接管" && x.expires > Date.now(),
  );
}
export function fieldCommand(
  s: State,
  r: Robot,
  cmd: FieldCommand,
  value: unknown,
  fail = false,
) {
  s.fieldDevices ??= {};
  const f = (s.fieldDevices[r.id] ??= fieldDefault());
  if (cmd === "stop") {
    Object.assign(f, {
      talking: false,
      sound: false,
      beacon: false,
      broadcast: "",
      lastCommand: "停止输出",
      status: "模拟回执成功",
    });
    return;
  }
  if (!fieldCapabilities(r).includes(cmd)) throw Error("此机型不支持该能力");
  if (r.state === "离线") throw Error("机器人离线");
  if (cmd !== "listen" && !activeControl(s, r.id))
    throw Error("请先取得有效的独占控制会话");
  if (cmd === "talk" && value && f.broadcast)
    throw Error("预录播报占用发声通道，请先停止播报");
  if (cmd === "broadcast" && value && f.talking)
    throw Error("对讲占用发声通道，请先停止讲话");
  f.lastCommand = cmd;
  if (fail) {
    f.status = "模拟回执失败 · 设备拒绝";
    return;
  }
  if (cmd === "zoom") f.zoom = Math.max(1, Math.min(20, Number(value)));
  if (cmd === "focus") f.focus = Math.max(0, Math.min(100, Number(value)));
  if (cmd === "focusMode") f.focusMode = String(value);
  if (cmd === "listen") f.listening = !!value;
  if (cmd === "talk") f.talking = !!value;
  if (cmd === "light") f.light = !!value;
  if (cmd === "sound") f.sound = !!value;
  if (cmd === "beacon") f.beacon = !!value;
  if (cmd === "broadcast") {
    if (
      value &&
      ![
        "巡检作业中，请保持距离",
        "前方危险，请勿靠近",
        "设备异常，请人员协助",
      ].includes(String(value))
    )
      throw Error("请选择预录内容");
    f.broadcast = String(value);
  }
  f.status = "模拟回执成功";
}
export function releaseOutputs(s: State) {
  for (const [rid, f] of Object.entries(s.fieldDevices || {})) {
    const r = s.robots.find((r) => r.id === rid);
    if (!r || r.state === "离线" || !activeControl(s, rid)) {
      f.talking = false;
      f.sound = false;
      f.beacon = false;
      f.broadcast = "";
      if (r?.state === "离线") f.listening = false;
    }
  }
}
