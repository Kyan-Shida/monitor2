/**
 * @file RobotNew.tsx
 * @description 新增机器人（内置页）：按 Robot 数据模型录入编码 / 名称 / 机型 / 区域 / 地图 /
 *              采集能力 / 移动能力 / 机型约束 / 固件，提交即接入台账并进入「机器台账」列表。
 * @interaction 菜单「机器人管理 › 新增机器人」；引擎 action：ADD_ROBOT
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Field, Note, Panel } from "../components/UI";
import { deviceTypes, profileOf } from "../data/deviceProfile";
import { captureKinds } from "../data/types";
import type { DeviceType, MobilityCapability } from "../data/types";

export function RobotNew() {
  const { s, act } = useStore();
  const [rid, RID] = useState("");
  const [name, NAME] = useState("");
  const [deviceType, DT] = useState<DeviceType>("四轮车");
  const [region, REG] = useState(s.robots[0]?.region || "");
  const [mapId, MAP] = useState(s.maps[0]?.id || "");
  /** 采集能力（可见光 / 红外 / 气体 / 声音）：任务下发时按能力校验 */
  const [caps, CAPS] = useState<string[]>(["可见光"]);
  /** 移动能力：默认带出本机型的标准移动能力，可增删 */
  const [mobility, MOB] = useState<MobilityCapability[]>(
    profileOf("四轮车").mobility,
  );
  const [minBattery, MINB] = useState(25);
  const [needCharging, CHARGE] = useState(true);
  const [maxSpeed, MAXS] = useState(1.5);
  const [railSection, RAIL] = useState("");
  const [firmware, FW] = useState("");
  const [err, ERR] = useState("");

  const map = s.maps.find((m) => m.id === mapId);
  const regions = [...new Set([...s.robots.map((r) => r.region), ...s.maps.map((m) => m.region)])];
  const allMobility = [...new Set(deviceTypes.flatMap((t) => profileOf(t).mobility))];
  const idTaken = s.robots.some((r) => r.id === rid.trim());
  const valid =
    rid.trim() &&
    !idTaken &&
    name.trim() &&
    mapId &&
    caps.length > 0;

  /** 提交新增：校验通过后写入台账并回到机器台账 */
  function save() {
    ERR("");
    const ok = act({
      type: "ADD_ROBOT",
      id: rid.trim(),
      name: name.trim(),
      deviceType,
      region: region || map?.region || "",
      mapId,
      capabilities: caps,
      mobility,
      minBattery,
      needChargingPlan: needCharging,
      maxSpeed: deviceType === "四轮车" ? maxSpeed : undefined,
      railSectionId: deviceType === "挂轨" ? railSection || undefined : undefined,
      firmware: firmware.trim() || undefined,
    });
    if (ok) go("robots");
    else ERR("新增失败：请检查填写内容（编码重复 / 地图未选等）。");
  }

  return (
    <>
      <div className="context-bar">
        <b>新增机器人</b>
        <span>
          机器人 = 编码 + 名称 + 机型 + 区域 + 地图 + 采集能力 + 移动能力 + 机型约束；
          新增后进入「机器台账」，可被计划 / 临时任务调度。
        </span>
        <div className="actions">
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
          <Field label="机型">
            <select
              value={deviceType}
              onChange={(e) => {
                const t = e.target.value as DeviceType;
                DT(t);
                // 切换机型：移动能力重置为本机型标准能力，约束给出机型默认值
                MOB([...profileOf(t).mobility]);
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
          <Field label="所属区域">
            <select value={region} onChange={(e) => REG(e.target.value)}>
              <option value="">请选择区域</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="所在地图（决定可巡检的点位范围）">
            <select value={mapId} onChange={(e) => MAP(e.target.value)}>
              <option value="">请选择地图</option>
              {s.maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}（{m.region} · v{m.version}）
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
              {captureKinds.map((c) => (
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
          <Field label="移动能力（决定任务可否下发到本机型）">
            <div className="actions">
              {allMobility.map((mb) => (
                <label key={mb} className="inline-filter">
                  <input
                    type="checkbox"
                    checked={mobility.includes(mb)}
                    onChange={(e) =>
                      MOB(
                        e.target.checked
                          ? [...mobility, mb]
                          : mobility.filter((x) => x !== mb),
                      )
                    }
                  />
                  <span>{mb}</span>
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
          <Note>
            {profileOf(deviceType).summary}；机型专项差异（地图图层 / 操控重点 /
            告警类型等）由机型配置表统一带出，新增后可在「机器人能力 › 机型专项」查看。
          </Note>
          {map && (
            <p className="muted">
              将激活地图 <b>{map.name}</b>（m{map.version} / p{map.pointSet}），
              初始状态「空闲」、电量 100%。
            </p>
          )}
        </Panel>
      </div>

      <div className="actions toolbar-inline">
        <Btn primary disabled={!valid} onClick={save}>
          确认新增
        </Btn>
        <Btn onClick={() => go("robots")}>返回机器台账</Btn>
        <small className="muted">
          新增后机器人出现在「机器台账」与地图上；调度校验（能力 / 电量 / 地图版本）与既有机器人同口径。
        </small>
      </div>
      {err && (
        <p role="alert" className="reference-upload-error">
          {err}
        </p>
      )}
    </>
  );
}
