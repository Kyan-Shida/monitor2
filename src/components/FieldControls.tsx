import { useEffect, useRef, useState } from "react";
import { useStore } from "../data/store";
import {
  activeControl,
  fieldDefault,
  fieldCapabilities,
  type FieldCommand,
} from "../data/fieldControl";
import { Btn, Badge } from "./UI";
/**
 * 现场控制分页
 * @description 调度舱大屏做了两处拆分：镜头交给大屏「云台控制」卡、声光（警笛/警灯）交给「当前设备」卡，
 *              故分页除原来的三页外，另支持只含播报的「播报」页，组合由调用方按需传入
 */
export type FieldTab = "音频" | "镜头" | "声光 / 播报" | "播报";

export function FieldControls({
  robotId,
  compact = false,
  tabs,
}: {
  robotId: string;
  compact?: boolean;
  /**
   * 展示哪些分页；缺省给出全集
   * @description 后台「实时执行监控」需要完整镜头控制；调度舱大屏的镜头调控在大屏「云台控制」卡上，
   *              故只传音频与声光播报（镜头不在弹窗内重复一份）
   */
  tabs?: FieldTab[];
}) {
  const { s, act } = useStore(),
    r = s.robots.find((r) => r.id === robotId)!;
  const f = s.fieldDevices?.[robotId] || fieldDefault();
  const cap = fieldCapabilities(r);
  const session = activeControl(s, robotId);
  /** 实际展示的分页：外部指定优先，否则按 compact 给默认全集 */
  const tabList: FieldTab[] =
    tabs ?? (compact ? ["音频", "镜头"] : ["音频", "镜头", "声光 / 播报"]);
  const [tab, T] = useState<FieldTab>(tabList[0]),
    [fail, F] = useState(false),
    [clip, C] = useState("巡检作业中，请保持距离");
  const latest = useRef(act);
  latest.current = act;
  const outputs = useRef<Record<string, typeof f>>({});
  outputs.current[robotId] = f;
  useEffect(
    () => () => {
      const current = outputs.current[robotId];
      if (
        current &&
        (current.talking ||
          current.sound ||
          current.beacon ||
          current.broadcast)
      )
        latest.current({ type: "FIELD_COMMAND", robotId, command: "stop" });
    },
    [robotId],
  );
  const send = (command: FieldCommand, value?: unknown) => {
    act({ type: "FIELD_COMMAND", robotId, command, value, fail });
    F(false);
  };
  const disabled = (command: FieldCommand) =>
    !cap.includes(command) ||
    r.state === "离线" ||
    (command !== "listen" && !session);
  return (
    <section className={"field-controls " + (compact ? "compact" : "")}>
      <div className="field-control-head">
        <b>现场音视频控制</b>
        <Badge>Mock</Badge>
        <span>{session ? "独占会话有效" : "监听可用 · 控制需接管"}</span>
      </div>
      <div className="segmented">
        {tabList.map((t) => (
          <button
            className={t === tab ? "active" : ""}
            key={t}
            onClick={() => T(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "音频" && (
        <>
          <div className="field-readout">
            现场拾音 <b>{f.listening ? "已连接 · 模拟音频" : "未连接"}</b> ·{" "}
            {f.talking ? "正在讲话" : "话筒静音"}
          </div>
          <div className="actions">
            <Btn
              disabled={disabled("listen")}
              onClick={() => send("listen", !f.listening)}
            >
              {f.listening ? "关闭拾音" : "连接拾音"}
            </Btn>
            <Btn
              disabled={disabled("talk")}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                send("talk", true);
              }}
              onPointerUp={() => send("talk", false)}
              onPointerCancel={() =>
                latest.current({
                  type: "FIELD_COMMAND",
                  robotId,
                  command: "stop",
                })
              }
              onBlur={() =>
                latest.current({
                  type: "FIELD_COMMAND",
                  robotId,
                  command: "stop",
                })
              }
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                  e.preventDefault();
                  send("talk", true);
                }
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Enter") send("talk", false);
              }}
            >
              按住讲话
            </Btn>
            <Btn onClick={() => send("stop")}>停止输出</Btn>
          </div>
          <small>
            松开即停止；不调用本机麦克风、不保存录音。
            {!cap.includes("talk") ? "此机型未配置对讲扬声器。" : ""}
          </small>
        </>
      )}
      {tab === "镜头" && (
        <>
          <div className="field-readout">
            倍率 <b>{f.zoom}×</b> · {f.focusMode}聚焦 {f.focus} · 补光
            {f.light ? "开启" : "关闭"}
          </div>
          <div className="actions">
            <Btn
              disabled={disabled("zoom") || f.zoom <= 1}
              onClick={() => send("zoom", f.zoom - 1)}
            >
              变倍 −
            </Btn>
            <Btn
              disabled={disabled("zoom") || f.zoom >= 20}
              onClick={() => send("zoom", f.zoom + 1)}
            >
              变倍 ＋
            </Btn>
            <Btn
              disabled={disabled("focusMode")}
              onClick={() =>
                send("focusMode", f.focusMode === "自动" ? "手动" : "自动")
              }
            >
              {f.focusMode === "自动" ? "手动聚焦" : "自动聚焦"}
            </Btn>
            <Btn
              disabled={disabled("focus") || f.focusMode !== "手动"}
              onClick={() => send("focus", f.focus - 5)}
            >
              近焦
            </Btn>
            <Btn
              disabled={disabled("focus") || f.focusMode !== "手动"}
              onClick={() => send("focus", f.focus + 5)}
            >
              远焦
            </Btn>
            <Btn
              disabled={disabled("light")}
              onClick={() => send("light", !f.light)}
            >
              补光{f.light ? "关闭" : "开启"}
            </Btn>
          </div>
          <small>
            模拟范围 1–20×；变倍/聚焦按步进回执更新，不向机器人持续发送指令。
          </small>
        </>
      )}
      {/* 声光 / 播报：调度舱大屏把「声光」（警笛 / 警灯）放到了「当前设备」卡，
          故这里支持只含播报的「播报」页（tabs 传入），避免与卡上按钮重复 */}
      {(tab === "声光 / 播报" || tab === "播报") && (
        <>
          {tab === "声光 / 播报" && (
            <div className="actions">
              <Btn
                disabled={disabled("sound")}
                onClick={() => send("sound", !f.sound)}
              >
                警笛：{f.sound ? "开" : "关"}
              </Btn>
              <Btn
                disabled={disabled("beacon")}
                onClick={() => send("beacon", !f.beacon)}
              >
                警灯：{f.beacon ? "开" : "关"}
              </Btn>
            </div>
          )}
          <select
            aria-label="预录播报内容"
            value={clip}
            onChange={(e) => C(e.target.value)}
          >
            {[
              "巡检作业中，请保持距离",
              "前方危险，请勿靠近",
              "设备异常，请人员协助",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <div className="actions">
            <Btn
              disabled={disabled("broadcast")}
              onClick={() => send("broadcast", clip)}
            >
              播放预录
            </Btn>
            <Btn onClick={() => send("stop")}>
              停止{tab === "播报" ? "播报" : "声光与播报"}
            </Btn>
          </div>
          <small>
            {f.broadcast ? `正在播报：${f.broadcast}` : "无播报任务"} ·
            告警事件不会自动启动声光
          </small>
        </>
      )}
      <footer>
        <span>
          {f.lastCommand} · {f.status}
        </span>
        <label>
          <input
            type="checkbox"
            checked={fail}
            onChange={(e) => F(e.target.checked)}
          />
          模拟下次失败
        </label>
      </footer>
    </section>
  );
}
