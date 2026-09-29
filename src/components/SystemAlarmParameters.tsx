import { useState } from "react";
import { useStore } from "../data/store";
import { systemRulesOf, type SystemRules } from "../data/alarmRules";
import { Btn, Field, Badge, Panel } from "./UI";
export function SystemAlarmParameters() {
  const { s, act } = useStore();
  const saved = systemRulesOf(s);
  const [draft, D] = useState(saved),
    [event, E] = useState("心跳中断"),
    [value, V] = useState(35);
  const triggered =
    event === "心跳中断"
      ? value >= draft.heartbeatSeconds
      : event === "下发无回执"
        ? value >= draft.dispatchSeconds
        : value < draft.lowBattery;
  return (
    <Panel title="系统事件触发参数">
      <div className="form-grid">
        {(
          [
            ["heartbeatSeconds", "心跳超时 / 秒"],
            ["dispatchSeconds", "下发回执超时 / 秒"],
            ["lowBattery", "低电量告警 / %"],
          ] as const
        ).map(([k, label]) => (
          <Field key={k} label={label}>
            <input
              type="number"
              min={1}
              value={draft[k]}
              onChange={(e) => D({ ...draft, [k]: +e.target.value })}
            />
          </Field>
        ))}
      </div>
      <div className="actions">
        <Badge>v{saved.version}</Badge>
        <Btn
          primary
          onClick={() => act({ type: "SAVE_SYSTEM_RULES", rules: draft })}
        >
          保存参数版本
        </Btn>
      </div>
      <p className="muted">
        低电量告警阈值与各机型最低可派电量分别维护。这里配置事件提示，调度仍执行机器人能力约束。
      </p>
      <div className="form-grid">
        <Field label="模拟事件">
          <select value={event} onChange={(e) => E(e.target.value)}>
            {["心跳中断", "下发无回执", "剩余电量"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label={event === "剩余电量" ? "当前电量 / %" : "持续时间 / 秒"}>
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => V(+e.target.value)}
          />
        </Field>
      </div>
      <p>
        <Badge>{triggered ? "触发系统告警" : "未达到触发条件"}</Badge>{" "}
        按当前表单参数测试；仅模拟校验，不改变机器人真实在线状态。
      </p>
    </Panel>
  );
}
