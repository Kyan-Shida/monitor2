/**
 * @file RobotNew.tsx
 * @description 新增机器人（内置页）：按 Robot 数据模型录入编码 / 名称 / 所属区域 / 机型 /
 *              采集能力 / 机型约束 / 固件；区域下拉取自「后台管理 › 区域配置」，
 *              未指定时在首次「地图下发」自动归属。
 * @interaction 菜单「机器人管理 › 新增机器人」；引擎 action：ADD_ROBOT
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Field, Panel } from "../components/UI";
import { deviceTypes, profileOf } from "../data/deviceProfile";
import { areaOptions } from "../data/deviceMaster";
import { captureKinds } from "../data/types";
import type { DeviceType } from "../data/types";

export function RobotNew() {
  const { s, act } = useStore();
  const [rid, RID] = useState("");
  const [name, NAME] = useState("");
  /** 所属区域：取自「后台管理 › 区域配置」，留空则首次「地图下发」时自动归属 */
  const [region, REGION] = useState("");
  const [deviceType, DT] = useState<DeviceType>("四轮车");
  /** 采集能力（可见光 / 红外 / 气体 / 声音）：任务下发时按能力校验 */
  const [caps, CAPS] = useState<string[]>(["可见光"]);
  const [minBattery, MINB] = useState(25);
  const [needCharging, CHARGE] = useState(true);
  const [maxSpeed, MAXS] = useState(1.5);
  const [railSection, RAIL] = useState("");
  const [firmware, FW] = useState("");
  const [err, ERR] = useState("");
  const idTaken = s.robots.some((r) => r.id === rid.trim());
  /**
   * 可选采集能力：取自「后台管理 › 机器人上装能力」中**启用**的上装，
   * 上装停用后这里就不再可选；后台尚未配置上装时退回内置采集方式，避免无能力可选。
   */
  const enabledKinds = [
    ...new Set(
      (s.robotPayloads || [])
        .filter((p) => p.state === "启用")
        .flatMap((p) => p.abilities.map((ab) => ab.kind)),
    ),
  ];
  const capOptions = enabledKinds.length ? enabledKinds : captureKinds;
  const valid = rid.trim() && !idTaken && name.trim() && caps.length > 0;

  /** 提交新增：校验通过后写入台账并回到机器台账 */
  function save() {
    ERR("");
    const ok = act({
      type: "ADD_ROBOT",
      id: rid.trim(),
      name: name.trim(),
      region: region || undefined,
      deviceType,
      capabilities: caps,
      minBattery,
      needChargingPlan: needCharging,
      maxSpeed: deviceType === "四轮车" ? maxSpeed : undefined,
      railSectionId: deviceType === "挂轨" ? railSection || undefined : undefined,
      firmware: firmware.trim() || undefined,
    });
    if (ok) go("robots");
    else ERR("新增失败：请检查填写内容（编码重复等）。");
  }

  return (
    <>
      <div className="context-bar">
        <b>新增机器人</b>
        <div className="actions">
          <Btn primary disabled={!valid} onClick={save}>
            确认新增
          </Btn>
          <Btn onClick={() => go("robots")}>返回机器台账</Btn>
        </div>
      </div>

      <div className="grid template-layout">
        <Panel title="① 基础身份" extra={<Badge>{deviceType}</Badge>}>
          <Field label="机器人编码（唯一）">
            <input
              value={rid}
              placeholder="例如 R04"
              onChange={(e) => RID(e.target.value)}
            />
          </Field>
          {idTaken && (
            <p role="alert" className="reference-upload-error">
              编码 {rid} 已存在，请更换。
            </p>
          )}
          <Field label="机器人名称">
            <input
              value={name}
              placeholder="例如 罐区巡检四号"
              onChange={(e) => NAME(e.target.value)}
            />
          </Field>
          <Field label="所属区域">
            <select value={region} onChange={(e) => REGION(e.target.value)}>
              <option value="">未指定</option>
              {areaOptions(s).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="机型">
            <select
              value={deviceType}
              onChange={(e) => {
                const t = e.target.value as DeviceType;
                DT(t);
                // 切换机型：约束给出机型默认值
                MINB(profileOf(t).constraints.minBattery);
                CHARGE(profileOf(t).constraints.needChargingPlan);
              }}
            >
              {deviceTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="固件版本（选填）">
            <input
              value={firmware}
              placeholder="例如 AGV-2.0.0"
              onChange={(e) => FW(e.target.value)}
            />
          </Field>
        </Panel>

        <Panel title="② 能力与约束">
          <Field label="采集能力（决定可执行的任务类型）">
            <div className="actions">
              {capOptions.map((c) => (
                <label key={c} className="inline-filter">
                  <input
                    type="checkbox"
                    checked={caps.includes(c)}
                    onChange={(e) =>
                      CAPS(
                        e.target.checked
                          ? [...caps, c]
                          : caps.filter((x) => x !== c),
                      )
                    }
                  />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </Field>
          <Field label="最低可派电量（%）">
            <input
              type="number"
              min={0}
              max={100}
              value={minBattery}
              onChange={(e) => MINB(Number(e.target.value))}
            />
          </Field>
          <Field label="是否参与充电排队规划">
            <label className="inline-filter">
              <input
                type="checkbox"
                checked={needCharging}
                onChange={(e) => CHARGE(e.target.checked)}
              />
              <span>{needCharging ? "参与" : "不参与"}</span>
            </label>
          </Field>
          {deviceType === "四轮车" && (
            <Field label="限速（m/s）">
              <input
                type="number"
                step="0.1"
                min={0}
                value={maxSpeed}
                onChange={(e) => MAXS(Number(e.target.value))}
              />
            </Field>
          )}
          {deviceType === "挂轨" && (
            <Field label="当前所在轨道区段">
              <select
                value={railSection}
                onChange={(e) => RAIL(e.target.value)}
              >
                <option value="">未指定</option>
                {(s.railSections || []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} · {r.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Panel>
      </div>

      {err && (
        <p role="alert" className="reference-upload-error">
          {err}
        </p>
      )}
    </>
  );
}
