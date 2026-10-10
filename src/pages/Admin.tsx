/**
 * @file Admin.tsx
 * @description 后台管理：工厂**已有基础数据**的统一配置入口（区域 / 设备 / 仪表）。
 *              区域是设备树分组与地图「区域」下拉的唯一来源；设备 / 仪表在此增删改查。
 *              算法（AI 能力）已独立成页（后台管理 › 算法模板管理，见 AlgoTemplates.tsx）。
 * @interaction 路由 `admin`（后台管理 › 工厂基础数据）；引擎动作：
 *              ADD_AREA / RENAME_AREA / DELETE_AREA、
 *              ADD_DEVICE / UPDATE_DEVICE / DELETE_DEVICE、
 *              ADD_INSTRUMENT / UPDATE_INSTRUMENT / DELETE_INSTRUMENT
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Btn, Badge, Panel, Table, Field, Note, Modal } from "../components/UI";
import { areaNameOf, areaOptions } from "../data/deviceMaster";
import { captureKinds } from "../data/types";
import type { CaptureKind } from "../data/types";

/** 区域表单：id 存在 = 编辑，否则新增 */
type AreaForm = { id?: string; name: string };
/** 设备表单：编码在编辑态不可改（是业务唯一身份） */
type DevForm = {
  mode: "add" | "edit";
  id: string;
  name: string;
  type: string;
  region: string;
  locationDesc: string;
};
/** 仪表表单 */
type InsForm = {
  mode: "add" | "edit";
  id?: string;
  name: string;
  deviceId: string;
  capture: CaptureKind;
  unit: string;
};
/** 删除二次确认 */
type Confirm = { title: string; text: string; run: () => boolean };

export function Admin({ tab: initTab = "area" }: { tab?: string }) {
  const { s, act } = useStore();
  /** 支持路由 ?tab= 定位到指定配置分区（如设备树的「区域配置」直达 area） */
  const [tab, TAB] = useState(initTab);
  const areas = s.areas || [];
  const devices = s.devices || [];
  const instruments = s.instruments || [];
  /** 区域选项：区域主数据 ∪ 设备实际归属（与设备树、地图下拉同源） */
  const regionOpts = areaOptions(s);
  /** 设备在某区域下的台数 */
  const countOf = (name: string) =>
    devices.filter((d) => areaNameOf(s, d) === name).length;

  const [areaForm, setAreaForm] = useState<AreaForm | null>(null);
  const [devForm, setDevForm] = useState<DevForm | null>(null);
  const [insForm, setInsForm] = useState<InsForm | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  return (
    <>
      <div className="toolbar">
        <div className="segmented">
          {[
            ["area", "区域配置"],
            ["device", "设备配置"],
            ["instrument", "仪表配置"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => TAB(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 算法已独立成页：算法是被台账引用的主数据，与工厂已有数据分开维护 */}
        <div className="actions">
          <Btn onClick={() => go("requirements")}>巡检要求管理 →</Btn>
          <Btn onClick={() => go("algo-templates")}>算法模板管理 →</Btn>
        </div>
      </div>

      {tab === "area" && (
        <Panel
          title="区域配置"
          extra={
            <Btn primary onClick={() => setAreaForm({ name: "" })}>
              ＋ 新增区域
            </Btn>
          }
        >
          <Note>
            区域是工厂树的第一层。设备按安装位置前缀归属到区域；
            地图导入、机器人等处的「区域」下拉都取自这里，保证全平台同一份口径。
          </Note>
          <Table
            heads={["区域名称", "设备数", "操作"]}
            rows={areas.map((a) => [
              <b>{a.name}</b>,
              countOf(a.name),
              <div className="actions">
                <Btn
                  onClick={() => setAreaForm({ id: a.id, name: a.name })}
                >
                  编辑
                </Btn>
                <Btn
                  onClick={() =>
                    setConfirm({
                      title: "删除区域",
                      text: `确认删除区域「${a.name}」？`,
                      run: () => act({ type: "DELETE_AREA", id: a.id }),
                    })
                  }
                >
                  删除
                </Btn>
              </div>,
            ])}
          />
        </Panel>
      )}

      {tab === "device" && (
        <Panel
          title="设备配置"
          extra={
            <Btn
              primary
              onClick={() =>
                setDevForm({
                  mode: "add",
                  id: "",
                  name: "",
                  type: "",
                  region: regionOpts[0] || "",
                  locationDesc: "",
                })
              }
            >
              ＋ 新增设备
            </Btn>
          }
        >
          <Note>
            这里维护设备主数据的基本身份（编码 / 名称 / 类型 / 区域 / 安装位置）；
            巡检项配置与清单导入仍在「资源与地图 › 设备台账」。
          </Note>
          <Table
            heads={["编码", "设备名称", "类型 / 位置", "所属区域", "操作"]}
            rows={devices.map((d) => {
              const rg = areaNameOf(s, d);
              return [
                d.id,
                d.name,
                <>
                  {d.type}
                  <small>{d.locationDesc || "—"}</small>
                </>,
                <Badge>{rg}</Badge>,
                <div className="actions">
                  <Btn
                    onClick={() =>
                      setDevForm({
                        mode: "edit",
                        id: d.id,
                        name: d.name,
                        type: d.type,
                        region: rg === "未分区" ? "" : rg,
                        locationDesc: d.locationDesc,
                      })
                    }
                  >
                    编辑
                  </Btn>
                  <Btn
                    onClick={() =>
                      setConfirm({
                        title: "删除设备",
                        text: `确认删除设备「${d.name}」？其下仪表会一并移除。`,
                        run: () => act({ type: "DELETE_DEVICE", id: d.id }),
                      })
                    }
                  >
                    删除
                  </Btn>
                </div>,
              ];
            })}
          />
        </Panel>
      )}

      {tab === "instrument" && (
        <Panel
          title="仪表配置"
          extra={
            <Btn
              primary
              onClick={() =>
                setInsForm({
                  mode: "add",
                  name: "",
                  deviceId: devices[0]?.id || "",
                  capture: "可见光",
                  unit: "",
                })
              }
            >
              ＋ 新增仪表
            </Btn>
          }
        >
          <Note>
            仪表挂在设备下、本身只是资产，叠加「巡检要求」后才成为可执行的巡检目标。
          </Note>
          <Table
            heads={["仪表名称", "所属设备", "采集方式", "单位", "操作"]}
            rows={instruments.map((i) => [
              i.name,
              devices.find((d) => d.id === i.deviceId)?.name || "—",
              <Badge>{i.capture}</Badge>,
              i.unit || "—",
              <div className="actions">
                <Btn
                  onClick={() =>
                    setInsForm({
                      mode: "edit",
                      id: i.id,
                      name: i.name,
                      deviceId: i.deviceId,
                      capture: i.capture,
                      unit: i.unit || "",
                    })
                  }
                >
                  编辑
                </Btn>
                <Btn
                  onClick={() =>
                    setConfirm({
                      title: "删除仪表",
                      text: `确认删除仪表「${i.name}」？`,
                      run: () => act({ type: "DELETE_INSTRUMENT", id: i.id }),
                    })
                  }
                >
                  删除
                </Btn>
              </div>,
            ])}
          />
        </Panel>
      )}

      {/* 区域：新增 / 编辑 */}
      {areaForm && (
        <Modal
          title={areaForm.id ? "编辑区域" : "新增区域"}
          onClose={() => setAreaForm(null)}
        >
          <Field label="区域名称">
            <input
              value={areaForm.name}
              placeholder="例如 二期罐区"
              onChange={(e) =>
                setAreaForm({ ...areaForm, name: e.target.value })
              }
            />
          </Field>
          <Note>
            改名后，该区域下设备的安装位置前缀会同步更新，不会掉到「未分区」。
          </Note>
          <div className="modal-actions">
            <Btn onClick={() => setAreaForm(null)}>取消</Btn>
            <Btn
              primary
              disabled={!areaForm.name.trim()}
              onClick={() => {
                const name = areaForm.name.trim();
                const ok = act(
                  areaForm.id
                    ? { type: "RENAME_AREA", id: areaForm.id, name }
                    : { type: "ADD_AREA", name },
                );
                if (ok) setAreaForm(null);
              }}
            >
              保存
            </Btn>
          </div>
        </Modal>
      )}

      {/* 设备：新增 / 编辑 */}
      {devForm && (
        <Modal
          title={devForm.mode === "edit" ? "编辑设备" : "新增设备"}
          onClose={() => setDevForm(null)}
        >
          <Field label="设备编码">
            <input
              value={devForm.id}
              disabled={devForm.mode === "edit"}
              placeholder="例如 V012"
              onChange={(e) => setDevForm({ ...devForm, id: e.target.value })}
            />
          </Field>
          <Field label="设备名称">
            <input
              value={devForm.name}
              placeholder="例如 V012 新增储罐"
              onChange={(e) => setDevForm({ ...devForm, name: e.target.value })}
            />
          </Field>
          <Field label="设备类型">
            <input
              value={devForm.type}
              placeholder="例如 储罐"
              onChange={(e) => setDevForm({ ...devForm, type: e.target.value })}
            />
          </Field>
          <Field label="所属区域">
            <select
              value={devForm.region}
              onChange={(e) =>
                setDevForm({ ...devForm, region: e.target.value })
              }
            >
              <option value="">（未指定）</option>
              {regionOpts.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="安装位置">
            <input
              value={devForm.locationDesc}
              placeholder="例如 二期罐区北侧"
              onChange={(e) =>
                setDevForm({ ...devForm, locationDesc: e.target.value })
              }
            />
          </Field>
          <div className="modal-actions">
            <Btn onClick={() => setDevForm(null)}>取消</Btn>
            <Btn
              primary
              disabled={!devForm.id.trim() || !devForm.name.trim()}
              onClick={() => {
                const ok = act({
                  type: devForm.mode === "edit" ? "UPDATE_DEVICE" : "ADD_DEVICE",
                  id: devForm.id.trim(),
                  name: devForm.name.trim(),
                  // 设备类型用独立字段，避免与动作名 Action.type 冲突
                  deviceType: devForm.type.trim(),
                  region: devForm.region,
                  locationDesc: devForm.locationDesc.trim(),
                });
                if (ok) setDevForm(null);
              }}
            >
              保存
            </Btn>
          </div>
        </Modal>
      )}

      {/* 仪表：新增 / 编辑 */}
      {insForm && (
        <Modal
          title={insForm.mode === "edit" ? "编辑仪表" : "新增仪表"}
          onClose={() => setInsForm(null)}
        >
          <Field label="仪表名称">
            <input
              value={insForm.name}
              placeholder="例如 出口压力表"
              onChange={(e) => setInsForm({ ...insForm, name: e.target.value })}
            />
          </Field>
          <Field label="所属设备">
            <select
              value={insForm.deviceId}
              onChange={(e) =>
                setInsForm({ ...insForm, deviceId: e.target.value })
              }
            >
              <option value="">（请选择）</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="采集方式">
            <select
              value={insForm.capture}
              onChange={(e) =>
                setInsForm({
                  ...insForm,
                  capture: e.target.value as CaptureKind,
                })
              }
            >
              {captureKinds.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="单位">
            <input
              value={insForm.unit}
              placeholder="读表类仪表才需要，例如 MPa"
              onChange={(e) => setInsForm({ ...insForm, unit: e.target.value })}
            />
          </Field>
          <div className="modal-actions">
            <Btn onClick={() => setInsForm(null)}>取消</Btn>
            <Btn
              primary
              disabled={!insForm.name.trim() || !insForm.deviceId}
              onClick={() => {
                const ok = act({
                  type:
                    insForm.mode === "edit"
                      ? "UPDATE_INSTRUMENT"
                      : "ADD_INSTRUMENT",
                  id: insForm.id,
                  name: insForm.name.trim(),
                  deviceId: insForm.deviceId,
                  capture: insForm.capture,
                  unit: insForm.unit.trim(),
                });
                if (ok) setInsForm(null);
              }}
            >
              保存
            </Btn>
          </div>
        </Modal>
      )}

      {/* 删除二次确认 */}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p>{confirm.text}</p>
          <div className="modal-actions">
            <Btn onClick={() => setConfirm(null)}>取消</Btn>
            <Btn
              primary
              onClick={() => {
                if (confirm.run() !== false) setConfirm(null);
              }}
            >
              确认删除
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
