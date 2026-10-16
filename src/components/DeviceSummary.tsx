/**
 * @file DeviceSummary.tsx
 * @description 设备摘要块（通用组件）：标题（设备名称）+ 只读字段（编码 / 形态 / 所属区域 / 安装位置）+「编辑」，
 *              编辑在弹窗内完成并保存（引擎 action：UPDATE_DEVICE）。
 * @interaction 设备档案（pages/DeviceArchive.tsx）、设备巡检目标（pages/DeviceTargets.tsx）等多处复用
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { Badge, Btn, Field, Modal } from "./UI";
import { areaNameOf, areaOptions, deviceKindOf } from "../data/deviceMaster";
import { deviceKinds } from "../data/types";
import type { DeviceAsset, DeviceKind } from "../data/types";

export function DeviceSummary({ dev }: { dev: DeviceAsset }) {
  const { s } = useStore();
  const [editing, EDITING] = useState(false);
  /** 归属区域：显式字段优先，未指定时按安装位置推导（与设备树同口径） */
  const region = dev.region || areaNameOf(s, dev);
  return (
    <>
      <div className="object-head">
        <h2>
          {dev.name}
          {dev.state === "停用" && <Badge>已停用</Badge>}
        </h2>
        <Btn onClick={() => EDITING(true)}>编辑</Btn>
      </div>
      <dl className="object-facts">
        <div>
          <dt>设备编码</dt>
          <dd>{dev.id}</dd>
        </div>
        <div>
          <dt>设备形态</dt>
          <dd>{deviceKindOf(dev)}</dd>
        </div>
        <div>
          <dt>所属区域</dt>
          <dd>{region}</dd>
        </div>
        <div>
          <dt>安装位置</dt>
          <dd>{dev.locationDesc || dev.coord || "—"}</dd>
        </div>
      </dl>
      {editing && <DeviceEdit dev={dev} onClose={() => EDITING(false)} />}
    </>
  );
}

/**
 * 编辑设备信息（弹窗）：主数据就地修改，保存走 UPDATE_DEVICE
 * @description 设备名称是点位的归属键，改名由引擎同步点位归属；名称 / 形态 / 区域为必填。
 */
function DeviceEdit({
  dev,
  onClose,
}: {
  dev: DeviceAsset;
  onClose: () => void;
}) {
  const { s, act } = useStore();
  /** 字段初值：归属区域显式字段优先，未指定时回落到按安装位置推导 */
  const initial = () => {
    const area0 = dev.region || areaNameOf(s, dev);
    return {
      name: dev.name,
      kind: deviceKindOf(dev),
      region: area0 === "未分区" ? "" : area0,
      location: dev.locationDesc || "",
    };
  };
  const [init] = useState(initial);
  const [form, FORM] = useState(init);
  /** 设备名称是点位的归属键，保存前统一去空格 */
  const name = form.name.trim();
  const dirty =
    form.name !== init.name ||
    form.kind !== init.kind ||
    form.region !== init.region ||
    form.location !== init.location;
  return (
    <Modal
      title="编辑设备信息"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>取消</Btn>
          <Btn
            primary
            disabled={!dirty || !name}
            onClick={() => {
              const ok = act({
                type: "UPDATE_DEVICE",
                id: dev.id,
                name,
                deviceKind: form.kind,
                region: form.region,
                locationDesc: form.location,
              });
              if (ok) onClose();
            }}
          >
            保存
          </Btn>
        </>
      }
    >
      <Field label="设备编码">
        <input value={dev.id} readOnly />
      </Field>
      <Field label="设备名称" required>
        <input
          value={form.name}
          onChange={(e) => FORM({ ...form, name: e.target.value })}
        />
      </Field>
      <Field label="设备形态" required>
        <select
          value={form.kind}
          onChange={(e) => FORM({ ...form, kind: e.target.value as DeviceKind })}
        >
          {deviceKinds.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </Field>
      <Field label="所属区域" required>
        <select
          value={form.region}
          onChange={(e) => FORM({ ...form, region: e.target.value })}
        >
          <option value="">（未指定）</option>
          {areaOptions(s).map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </Field>
      <Field label="安装位置">
        <input
          value={form.location}
          onChange={(e) => FORM({ ...form, location: e.target.value })}
        />
      </Field>
    </Modal>
  );
}
