/**
 * @file RobotNew.tsx
 * @description 新增机器人（内置页）：按 Robot 数据模型录入编码 / SN / 名称 / 机型 / 固件 / 约束 / 采集能力；
 *              表单按「标签—控件」成对双列排布，操作按钮收在表单底部；
 *              区域不再手工填写，由首次「地图下发」按地图归属自动带出。
 * @interaction 菜单「机器人管理 › 新增机器人」；引擎 action：ADD_ROBOT
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Panel, Confirm } from "../components/UI";
import { deviceTypes, profileOf } from "../data/deviceProfile";
import { captureKinds } from "../data/types";
import type { DeviceType } from "../data/types";

export function RobotNew() {
  const { s, act } = useStore();
  /** 机器人编码：平台内部主键（任务 / 日志 / 告警都按它关联） */
  const [rid, RID] = useState("");
  /** 机器人编号（SN）：厂商出厂的硬件序列号，资产与售后口径 */
  const [sn, SN] = useState("");
  const [name, NAME] = useState("");
  const [deviceType, DT] = useState<DeviceType>("四轮车");
  /** 采集能力（可见光 / 红外 / 气体 / 声音）：任务下发时按能力校验 */
  const [caps, CAPS] = useState<string[]>(["可见光"]);
  const [minBattery, MINB] = useState(25);
  const [needCharging, CHARGE] = useState(true);
  const [maxSpeed, MAXS] = useState(1.5);
  const [railSection, RAIL] = useState("");
  const [firmware, FW] = useState("");
  const [err, ERR] = useState("");
  /** 取消二次确认：放弃已填内容 */
  const [ask, ASK] = useState(false);
  const idTaken = !!rid.trim() && s.robots.some((r) => r.id === rid.trim());
  const snTaken = !!sn.trim() && s.robots.some((r) => r.sn === sn.trim());
  /**
   * 可选采集能力：取自「后台管理 › 机器人上装能力」中**启用**的上装，
   * 上装停用后这里就不再可选；后台尚未配置上装时退回内置采集方式，避免无能力可选。
   */
  const enabledKinds = [
    ...new Set(
      (s.robotPayloads || []).flatMap((p) => p.abilities.map((ab) => ab.kind)),
    ),
  ];
  const capOptions = enabledKinds.length ? enabledKinds : captureKinds;
  const valid =
    !!rid.trim() &&
    !idTaken &&
    !!sn.trim() &&
    !snTaken &&
    !!name.trim() &&
    !!firmware.trim() &&
    caps.length > 0;

  /** 提交新增：校验通过后写入台账并回到机器台账 */
  function save() {
    ERR("");
    const ok = act({
      type: "ADD_ROBOT",
      id: rid.trim(),
      sn: sn.trim(),
      name: name.trim(),
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
      {/* 整页一张大表：双列「标签—控件」，分区行做小标题 */}
      <Panel
        className="robot-form"
        title="机器人信息"
        extra={<Badge>{deviceType}</Badge>}
      >
        <div className="table-scroll">
          <table className="form-table">
            <tbody>
              <tr className="form-sec">
                <th colSpan={4}>① 基础身份</th>
              </tr>
              <tr>
                <th>
                  机器人编码<em className="req">*</em>
                </th>
                <td>
                  <input
                    value={rid}
                    placeholder="例如 R04"
                    onChange={(e) => RID(e.target.value)}
                  />
                  {idTaken && (
                    <p role="alert" className="reference-upload-error">
                      编码 {rid.trim()} 已存在，请更换。
                    </p>
                  )}
                </td>
                <th>
                  机器人编号（SN）<em className="req">*</em>
                </th>
                <td>
                  <input
                    value={sn}
                    placeholder="例如 SN-AGV-2026-001"
                    onChange={(e) => SN(e.target.value)}
                  />
                  {snTaken && (
                    <p role="alert" className="reference-upload-error">
                      编号 {sn.trim()} 已存在，请更换。
                    </p>
                  )}
                </td>
              </tr>
              <tr>
                <th>
                  机器人名称<em className="req">*</em>
                </th>
                <td colSpan={3}>
                  <input
                    value={name}
                    placeholder="例如 罐区巡检四号"
                    onChange={(e) => NAME(e.target.value)}
                  />
                </td>
              </tr>

              <tr className="form-sec">
                <th colSpan={4}>② 机型与硬件</th>
              </tr>
              <tr>
                <th>
                  机型<em className="req">*</em>
                </th>
                <td>
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
                </td>
                <th>
                  固件版本<em className="req">*</em>
                </th>
                <td>
                  <input
                    value={firmware}
                    placeholder="例如 AGV-2.0.0"
                    onChange={(e) => FW(e.target.value)}
                  />
                </td>
              </tr>

              <tr className="form-sec">
                <th colSpan={4}>③ 机型约束</th>
              </tr>
              <tr>
                <th>
                  最低派单电量（%）<em className="req">*</em>
                </th>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={minBattery}
                    onChange={(e) => MINB(Number(e.target.value))}
                  />
                </td>
                <th>
                  是否参与充电排队规划<em className="req">*</em>
                </th>
                <td>
                  <label className="inline-filter">
                    <input
                      type="checkbox"
                      checked={needCharging}
                      onChange={(e) => CHARGE(e.target.checked)}
                    />
                    <span>{needCharging ? "参与" : "不参与"}</span>
                  </label>
                </td>
              </tr>
              {deviceType === "四轮车" && (
                <tr>
                  <th>限速（m/s）</th>
                  <td colSpan={3}>
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      value={maxSpeed}
                      onChange={(e) => MAXS(Number(e.target.value))}
                    />
                  </td>
                </tr>
              )}
              {deviceType === "挂轨" && (
                <tr>
                  <th>当前所在轨道区段</th>
                  <td colSpan={3}>
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
                  </td>
                </tr>
              )}

              <tr className="form-sec">
                <th colSpan={4}>④ 采集能力</th>
              </tr>
              <tr>
                <th>
                  采集能力<em className="req">*</em>
                </th>
                <td colSpan={3}>
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
                  <p className="form-row-note">
                    采集能力决定该机器人可执行的任务类型。
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {err && (
          <p role="alert" className="reference-upload-error">
            {err}
          </p>
        )}

        {/* 操作收在表单底部：读完整张表再提交 */}
        <div className="actions form-actions">
          <Btn onClick={() => ASK(true)}>取消</Btn>
          <Btn primary disabled={!valid} onClick={save}>
            确认新增
          </Btn>
        </div>
      </Panel>

      {/* 取消二次确认：放弃已填写内容，不落库 */}
      {ask && (
        <Confirm
          title="放弃新增"
          message="已填写的内容将不会保存。"
          confirmText="放弃"
          danger
          onClose={() => ASK(false)}
          onConfirm={() => go("robots")}
        />
      )}
    </>
  );
}
