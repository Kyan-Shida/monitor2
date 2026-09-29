/**
 * @file MapSurveyPanel.tsx
 * @description 建图与坐标（阶段①②）：坐标标定、图层管理、现场踩点（含离线打点与同步）、
 *              轨迹录制、版本与待校准差异比对（最小版）
 * @interaction 被 Maps.tsx 的「建图与坐标」tab 渲染；写入走 engine 的
 *              CALIBRATE_FRAMES / SET_MAP_LAYERS / SURVEY_CAPTURE / SURVEY_SYNC / TRACK_RECORD
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Empty, Field, Note, Panel, Table } from "./UI";
import { MapImageCanvas } from "./MapImageCanvas";
import { MapBaseUpload } from "./MapBaseUpload";

/** 图层清单（与 types.ts 的 MapLayerFlags 对应） */
const LAYERS = ["底图", "障碍物层", "点云层", "业务区域层", "巡检点层", "路线层"] as const;
/** 踩点 / 轨迹的点位类型 */
const POINT_TYPES = ["停靠点", "观察点", "充电桩", "待机点"];
/** 轨迹采样类型 */
const TRACK_KINDS = ["停靠点", "转弯点", "充电桩", "待机点"];

export function MapSurveyPanel({ mapId }: { mapId: string }) {
  const { s, act } = useStore();
  const m = s.maps.find((x) => x.id === mapId)!;
  const surveys = (s.siteSurveys || []).filter((x) => x.mapId === m.id);
  const tracks = (s.trackSamples || []).filter((x) => x.mapId === m.id);
  const pts = s.points.filter((p) => p.mapId === m.id);
  const pending = surveys.filter((x) => x.offline && !x.synced);

  // 坐标标定表单
  const [res, SETRES] = useState(String(m.frames?.resolution ?? ""));
  const [ox, SETOX] = useState(String(m.frames?.origin?.x ?? 0));
  const [oy, SETOY] = useState(String(m.frames?.origin?.y ?? 0));
  const [oyaw, SETYAW] = useState(String(m.frames?.origin?.yaw ?? 0));
  const [rot, SETROT] = useState(String(m.frames?.rotateDeg ?? 0));

  // 现场踩点表单
  const [pointType, SETPT] = useState("停靠点");
  const [deviceCode, SETDC] = useState("");
  const [target, SETTG] = useState("");
  const [viewDir, SETVD] = useState("");
  const [preset, SETPR] = useState("");
  const [remark, SETRM] = useState("");
  const [offline, SETOFF] = useState(false);

  // 轨迹采样类型
  const [tkKind, SETTK] = useState("停靠点");

  /** 可能失效 / 待校准的点位（阶段⑧差异比对的最小版信号） */
  const risky = pts.filter((p) => p.calibrate === "待校准" || p.state === "待重新验证");

  return (
    <>
      <Panel title="坐标标定（阶段②）" extra={<Badge>{m.frames?.calibState || "未标定"}</Badge>}>
        <Note>
          未完成标定前不允许落点。分辨率（米/像素）、原点坐标与旋转角用于「屏幕 ↔ 世界坐标」换算；
          云台/相机外参在阶段②C 深水区接入。
        </Note>
        <div className="filter-bar">
          <Field label="分辨率（米/像素）">
            <input value={res} onChange={(e) => SETRES(e.target.value)} placeholder="0.05" />
          </Field>
          <Field label="原点 X">
            <input value={ox} onChange={(e) => SETOX(e.target.value)} />
          </Field>
          <Field label="原点 Y">
            <input value={oy} onChange={(e) => SETOY(e.target.value)} />
          </Field>
          <Field label="原点 yaw(°)">
            <input value={oyaw} onChange={(e) => SETYAW(e.target.value)} />
          </Field>
          <Field label="旋转角(°)">
            <input value={rot} onChange={(e) => SETROT(e.target.value)} />
          </Field>
        </div>
        <div className="actions">
          <Btn
            primary
            onClick={() =>
              act({
                type: "CALIBRATE_FRAMES",
                mapId: m.id,
                frames: {
                  resolution: Number(res) || undefined,
                  origin: { x: Number(ox) || 0, y: Number(oy) || 0, yaw: Number(oyaw) || 0 },
                  rotateDeg: Number(rot) || 0,
                },
              })
            }
          >
            保存标定
          </Btn>
        </div>
      </Panel>

      <Panel title="底图上传与点位标注（阶段①）" extra={<span>{m.image ? "已上传底图" : "未上传"}</span>}>
        <MapBaseUpload mapId={m.id} />
        <MapImageCanvas
          image={m.image}
          markers={m.targets
            .filter((t) => t.state !== "已剔除")
            .map((t) => ({ id: t.id, x: t.x, y: t.y, label: t.kind, kind: t.kind, state: t.state }))}
          onAdd={(x, y) => act({ type: "ADD_TARGET", mapId: m.id, x, y })}
          showIds
          height={420}
        />
        <Note>
          上传底图后即可在图上点击标注点位。点位所属设备、检测项、云台动作等业务信息，在
          <b>「设备与点位」</b>相关页面维护；地图页只负责"底图 + 点位"。
        </Note>
      </Panel>

      <details className="advanced">
        <summary>高级（后置）：坐标标定 / 图层 / 现场踩点 / 轨迹 / 版本差异</summary>

      <Panel title="图层管理（阶段②）">
        <div className="actions">
          {LAYERS.map((k) => {
            const on = m.layers?.[k] !== false; // 缺省视为可用
            return (
              <Btn
                key={k}
                primary={on}
                onClick={() => act({ type: "SET_MAP_LAYERS", mapId: m.id, layers: { [k]: !on } })}
              >
                {on ? "✓ " : "✗ "}
                {k}
              </Btn>
            );
          })}
        </div>
        <p className="muted">缺省视为可用；点击切换该图层的显示。</p>
      </Panel>

      <Panel title="现场踩点（阶段①）" extra={<span>{surveys.length} 条 · 待同步 {pending.length}</span>}>
        <Note>跟随机器人现场打点；无网络时选「离线打点」，联网后点「同步离线踩点」。</Note>
        <div className="filter-bar">
          <Field label="点位类型">
            <select value={pointType} onChange={(e) => SETPT(e.target.value)}>
              {POINT_TYPES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="设备编码">
            <input value={deviceCode} onChange={(e) => SETDC(e.target.value)} placeholder="如 V001" />
          </Field>
          <Field label="检测目标">
            <input value={target} onChange={(e) => SETTG(e.target.value)} placeholder="如 出口压力表" />
          </Field>
          <Field label="观察方向">
            <input value={viewDir} onChange={(e) => SETVD(e.target.value)} placeholder="正对 / 俯视…" />
          </Field>
          <Field label="云台预置位">
            <input value={preset} onChange={(e) => SETPR(e.target.value)} placeholder="预置位 1" />
          </Field>
          <Field label="备注">
            <input value={remark} onChange={(e) => SETRM(e.target.value)} />
          </Field>
          <Field label="离线打点">
            <select value={offline ? "是" : "否"} onChange={(e) => SETOFF(e.target.value === "是")}>
              <option>否</option>
              <option>是</option>
            </select>
          </Field>
        </div>
        <div className="actions">
          <Btn
            primary
            onClick={() =>
              act({
                type: "SURVEY_CAPTURE",
                mapId: m.id,
                pointType,
                deviceCode,
                target,
                viewDir,
                ptzPreset: preset,
                remark,
                offline,
              })
            }
          >
            记录踩点
          </Btn>
          <Btn disabled={!pending.length} onClick={() => act({ type: "SURVEY_SYNC", mapId: m.id })}>
            同步离线踩点（{pending.length}）
          </Btn>
        </div>
        {!surveys.length ? (
          <Empty>暂无踩点记录</Empty>
        ) : (
          <Table
            heads={["类型", "设备编码", "检测目标", "观察方向", "云台预置位", "备注", "同步状态"]}
            rows={surveys.map((x) => [
              x.pointType,
              x.deviceCode || "—",
              x.target || "—",
              x.viewDir || "—",
              x.ptzPreset || "—",
              x.remark || "—",
              x.offline && !x.synced ? <Badge>离线待同步</Badge> : <Badge>已同步</Badge>,
            ])}
          />
        )}
      </Panel>

      <Panel title="轨迹录制（阶段①）" extra={<span>{tracks.length} 个采样点</span>}>
        <Note>踩点阶段同步录制轨迹（停靠 / 转弯 / 充电桩 / 待机），用于阶段⑦生成初始巡检路线。</Note>
        <div className="filter-bar">
          <Field label="采样类型">
            <select value={tkKind} onChange={(e) => SETTK(e.target.value)}>
              {TRACK_KINDS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="actions">
          <Btn
            onClick={() =>
              act({
                type: "TRACK_RECORD",
                mapId: m.id,
                kind: tkKind,
                x: Math.round(10 + Math.random() * 80),
                y: Math.round(10 + Math.random() * 80),
              })
            }
          >
            记录轨迹点
          </Btn>
        </div>
        {!tracks.length ? (
          <Empty>暂无轨迹采样</Empty>
        ) : (
          <Table
            heads={["序号", "类型", "坐标"]}
            rows={[...tracks].sort((x, y) => x.seq - y.seq).map((x) => [`#${x.seq}`, x.kind, `${x.x}, ${x.y}`])}
          />
        )}
      </Panel>

      <Panel title="版本与待校准差异（最小版，阶段⑧预置）">
        <Table heads={["版本变更日志"]} rows={m.history.map((h) => [h])} />
        {!risky.length ? (
          <Note>当前无「可能失效 / 待校准」点位。</Note>
        ) : (
          <Table
            heads={["可能失效 / 待校准点位", "设备 / 检测项", "状态", "操作"]}
            rows={risky.map((p) => [
              <b>{p.name}</b>,
              <>
                {p.device}
                <small>{p.item}</small>
              </>,
              <Badge>{p.calibrate || p.state}</Badge>,
              <Btn onClick={() => go("point", p.id)}>查看</Btn>,
            ])}
          />
        )}
      </Panel>
      </details>
    </>
  );
}
