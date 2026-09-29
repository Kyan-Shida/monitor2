/**
 * @file Annotation.tsx
 * @description 地图标注工作台（内置页 `point-annotate`）：候选目标确认 / 图面双击打点 / 试采与自主验证；
 *              被「地图上线工作台」第 1 步内嵌。
 * @interaction 巡检点的日常维护走「巡检点管理 › 添加/编辑巡检点」；本页负责地图侧的标注与验证，
 *              以及试采、示教回填（`VALIDATE` / `TRIAL_RUN` 等只在页内触发）
 */
import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Btn, Badge, Panel, Field, Note, Table, Modal } from "../components/UI";
import { MapImageCanvas } from "../components/MapImageCanvas";
import { MapBaseUpload } from "../components/MapBaseUpload";
import { rulesOf } from "../data/alarmRules";
import {
  deviceOf,
  defaultInspectItemName,
} from "../data/deviceMaster";
import type { Point, State } from "../data/types";

/**
 * 由已有点位还原"一次停靠看什么"
 * @description 点位 → logicalIds → 逻辑点 itemIds → 巡检项 target，据此还原多选状态；
 *              逻辑点缺失时回落到点位自身的 object（旧数据兼容）
 * @param s 状态
 * @param p 物理点位
 * @returns 该点位覆盖的检测目标名列表
 */
const objectsOfPoint = (s: State, p?: Point): string[] => {
  if (!p) return [];
  const ids = p.logicalIds || [];
  const names = ids
    .map((lid) => s.logicalPoints?.find((x) => x.id === lid))
    .flatMap((lp) => lp?.itemIds || [])
    .map((iid) => s.devices?.flatMap((d) => d.items).find((it) => it.id === iid)?.target)
    .filter(Boolean) as string[];
  return names.length ? [...new Set(names)] : [p.object];
};

export function Annotation({ id, embedded = false }: { id?: string; embedded?: boolean }) {
  const { s, act } = useStore();
  const workspace = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [height, setHeight] = useState(520);
  const [records, setRecords] = useState(false);
  const [preview, setPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  /** 快速新建设备表单 */
  const [nd, ND] = useState({
    id: "",
    name: "",
    type: "储罐",
    locationDesc: "",
    target: "",
    unit: "",
  });
  useLayoutEffect(() => {
    const el = workspace.current;
    if (!el) return;
    const resize = () => setHeight(Math.max(220, window.innerHeight - el.getBoundingClientRect().top - (embedded ? 118 : 58)));
    resize();
    const observer = new ResizeObserver(resize);
    if (el.parentElement) observer.observe(el.parentElement);
    window.addEventListener("resize", resize);
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); };
  }, [embedded]);
  const m = s.maps.find((m) => m.id === id) || s.maps[0];
  const first = s.points.find((p) => p.targetId === m.targets[0]?.id);
  /** 可标注的设备：必须已通过审核且在用（设备主数据是"巡检什么"的唯一来源） */
  const usable = (s.devices || []).filter(
    (d) => d.reviewState === "已通过" && d.state !== "停用",
  );
  const [target, T] = useState(m.targets[0]?.id || ""),
    [name, N] = useState(first?.name || ""),
    [device, D] = useState(""),
    /** 「看什么」多选：检测目标名列表，一次停靠可覆盖多个 */
    [objects, OBJ] = useState<string[]>([]),
    [item, I] = useState(""),
    [req, Q] = useState(
      first?.requirement || "身份唯一，表盘清晰，完整采集检测数据",
    ),
    [rid, R] = useState("R02"),
    /** 「怎么看」：到位后的动作编排（与标注同一入口保存，不另开页面） */
    [ptz, PTZ] = useState({ pan: 0, tilt: 0, zoom: 3 }),
    [viewDir, VD] = useState("正对目标"),
    [preset, PS] = useState(""),
    [avoid, AV] = useState("绕行优先"),
    [light, LT] = useState(40),
    [lift, LF] = useState(0),
    [dwell, DW] = useState(6),
    [taught, TAUGHT] = useState(false);
  const dev = deviceOf(s, device);
  const candidate = m.targets.find((t) => t.id === target),
    p = s.points.find((p) => p.targetId === target && p.mapId === m.id);
  const pts = s.points.filter((p) => p.mapId === m.id);
  /** 「判定」：判定规则随点位走（就地确认，不跳页重定义） */
  const rule = p ? rulesOf(s).find((r) => r.pointId === p.id) : undefined;
  const itemDefault = objects[0] ? defaultInspectItemName(objects[0]) : "";
  useEffect(() => {
    if (m.targets[0]) select(target || m.targets[0].id);
    // 仅在地图切换时重载一次右栏内容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id]);
  async function uploadImage(file?: File) {
    if (!file || !candidate) return;
    const targetId = candidate.id;
    const mapId = m.id;
    setUploadError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 500 * 1024) {
      setUploadError("请选择 500 KB 以内的 JPG、PNG 或 WebP 图片。");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("读取失败"));
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      if (act({ type: "UPLOAD_REFERENCE", mapId, targetId, name: file.name, dataUrl })) setPreview(true);
    } catch { setUploadError("图片无法读取，请换一张有效图片后重试。"); }
    finally { setUploading(false); }
  }
  /**
   * 切换候选目标：把该目标已有点位的设备 / 检测目标 / 动作编排全部读回右栏
   * @param t 候选目标 id
   */
  function select(t: string) {
    setUploadError("");
    T(t);
    const cur = s.points.find((q) => q.targetId === t);
    N(cur?.name || "");
    const d = cur ? deviceOf(s, cur.device) : usable[0];
    D(d?.id || "");
    OBJ(cur ? objectsOfPoint(s, cur) : d?.items[0] ? [d.items[0].target] : []);
    I(cur?.item || "");
    Q(cur?.requirement || "目标身份唯一，采集结果清晰");
    const ap = cur?.actionPlan;
    PTZ(ap?.ptz || { pan: 0, tilt: 0, zoom: 3 });
    VD(ap?.viewDir || "正对目标");
    PS(ap?.preset || "");
    AV(ap?.avoidPolicy || "绕行优先");
    LT(ap?.light ?? 40);
    LF(ap?.lift ?? 0);
    DW(ap?.dwellSec ?? 6);
    TAUGHT(!!cur?.taught);
  }
  /** 切换某个检测目标的勾选状态 */
  const toggleObject = (t: string) =>
    OBJ((old) => (old.includes(t) ? old.filter((x) => x !== t) : [...old, t]));
  /**
   * 示教回填：按当前图上目标位置推算一组取景参数
   * @description 真实实现应由机器人回传当前云台 / 位姿；原型按目标相对位置生成示意值
   */
  function teach() {
    const c = m.targets.find((t) => t.id === target);
    PTZ({
      pan: Math.round(((c?.x || 50) - 50) * 1.2),
      tilt: Math.round((50 - (c?.y || 50)) * 0.9),
      zoom: 3,
    });
    TAUGHT(true);
  }
  const canSave = !!dev && objects.length > 0 && !!name.trim();
  return (
    <>
      {!embedded && <div className="context-bar">
        <select
          value={m.id}
          onChange={(e) => {
            // 本工作台已降级为内置页（point-annotate），地图切换需留在本页内
            go("point-annotate", e.target.value);
            T("");
          }}
        >
          {s.maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <span>
          m{m.version} / 点位集合 p{m.pointSet}
        </span>
        <Badge>{m.state}</Badge>
        <Btn primary onClick={() => go("map-detail", m.id, "workbench")}>
          地图工作台
        </Btn>
        <Btn onClick={() => go("map-detail", m.id)}>地图详情 →</Btn>
      </div>
      }
      <div ref={workspace} className="annotation-grid annotation-fit" style={{height}}>
        <Panel
          title="候选目标与业务点位"
          extra={<span>{m.targets.length} 个</span>}
        >
          <div className="target-list">
            {m.targets
              .filter((t) => t.state !== "已剔除")
              .map((t) => (
                <button
                  className={target === t.id ? "selected" : ""}
                  key={t.id}
                  onClick={() => select(t.id)}
                >
                  <b>
                    {t.kind} · {t.id.slice(-6)}
                  </b>
                  <span>
                    {s.points.find((p) => p.id === t.pointId)?.name ||
                      "业务身份待确认"}
                  </span>
                  <Badge>{t.state}</Badge>
                </button>
              ))}
          </div>
          <Btn onClick={() => act({ type: "ADD_TARGET", mapId: m.id })}>
            ＋ 人工新增目标
          </Btn>
          <p className="muted">也可双击地图补充目标位置。</p>
        </Panel>
        <div className="annotation-scene">
          <Panel title={preview ? "候选目标参考图像" : "点位标注画布"} extra={<div className="actions"><Btn onClick={() => setPreview(!preview)}>{preview ? "查看地图" : "参考图像"}</Btn><Btn disabled={!candidate || uploading} onClick={() => upload.current?.click()}>{uploading ? "上传中…" : candidate?.referenceImage ? "替换参考图像" : "上传参考图像"}</Btn><MapBaseUpload mapId={m.id} /><Btn onClick={() => setRecords(true)}>版本与验证记录</Btn></div>}>
            <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" aria-label="上传参考图像" hidden onChange={event => { void uploadImage(event.target.files?.[0]); event.target.value = ""; }} />
            {uploadError && <p role="alert" className="reference-upload-error">{uploadError}</p>}
            {preview ? <div className="annotation-reference">
              {candidate?.referenceImage ? <><img src={candidate.referenceImage.dataUrl} alt={`${p?.name || candidate.id}的人工参考图像`} /><small>人工上传 · {candidate.referenceImage.name} · {new Date(candidate.referenceImage.uploadedAt).toLocaleString("zh-CN")}</small></> : <div className="empty">暂无参考图像，请选择目标后上传现场照片。</div>}
              <small>用于辅助确认目标身份，不作为巡检结果。演示图片仅保存在当前浏览器（单张 ≤ 500 KB）。</small>
            </div> : (
            <MapImageCanvas
              image={m.image}
              markers={m.targets
                .filter((t) => t.state !== "已剔除")
                .map((t) => ({ id: t.id, x: t.x, y: t.y, label: t.kind, kind: t.kind, state: t.state }))}
              selected={target}
              onSelect={select}
              onAdd={(x, y) => act({ type: "ADD_TARGET", mapId: m.id, x, y })}
              showIds
            />
            )}
          </Panel>
        </div>
        {/* 点位详情：四段把"一个点位"一次定义完，无需再去其他页面（v3 定案） */}
        <Panel title="点位详情（一次定义完）">
          {candidate ? (
            <>
              <p>
                {candidate.kind} · {candidate.id}
                {p && <> <Badge>{p.state}</Badge> 点位 v{p.version}</>}
              </p>

              <div className="ana-h">① 身份</div>
              <Field label="业务点位名称">
                <input
                  value={name}
                  placeholder={p?.name || "例如 V001 出口压力表"}
                  onChange={(e) => N(e.target.value)}
                />
              </Field>
              <Field label="所属设备（来自设备主数据）">
                <select value={device} onChange={(e) => D(e.target.value)}>
                  <option value="">请选择设备</option>
                  {usable.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              {dev ? (
                <p className="muted">
                  {dev.type} · {dev.id}
                  {dev.locationDesc ? ` · ${dev.locationDesc}` : ""} · 检测目标{" "}
                  {dev.items.length} 个
                </p>
              ) : (
                <p className="muted">
                  设备不在主数据中。请选择已有设备，或就地快速新建（人工新增，直接生效）。
                </p>
              )}
              <div className="actions">
                <Btn onClick={() => setCreating(true)}>＋ 快速新建设备</Btn>
                <Btn onClick={() => go("equipment")}>设备主数据（导入 / 审核）</Btn>
              </div>

              <div className="ana-h">② 看什么（可多选，一次停靠覆盖多个目标）</div>
              {dev ? (
                <div className="pick-list">
                  {dev.items.map((it) => (
                    <label
                      key={it.id}
                      className={"pick" + (objects.includes(it.target) ? " on" : "")}
                    >
                      <input
                        type="checkbox"
                        checked={objects.includes(it.target)}
                        onChange={() => toggleObject(it.target)}
                      />
                      <b>{it.target}</b>
                      <small>
                        {it.kind}
                        {it.unit ? ` · ${it.unit}` : ""} · {it.cycle}
                        {it.inspect ? "" : " · 已关闭巡检"}
                      </small>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="muted">请先选择设备。</p>
              )}
              <p className="muted">
                本点位覆盖 {objects.length} 个检测目标
                {objects.length > 1 ? " · 一次停靠完成" : ""}
              </p>
              <Field label="检测项（读什么数，默认按目标推导，可改）">
                <input
                  value={item}
                  placeholder={itemDefault}
                  onChange={(e) => I(e.target.value)}
                />
              </Field>

              <div className="ana-h">③ 怎么看（到位后的动作编排）</div>
              <Field label="观察方向">
                <input value={viewDir} onChange={(e) => VD(e.target.value)} />
              </Field>
              <div className="ptz-row">
                {(["pan", "tilt", "zoom"] as const).map((k) => (
                  <label key={k} className="inline-filter">
                    <span>{k === "pan" ? "水平" : k === "tilt" ? "俯仰" : "变焦"}</span>
                    <input
                      type="range"
                      min={k === "zoom" ? 1 : -90}
                      max={k === "zoom" ? 20 : 90}
                      value={ptz[k]}
                      onChange={(e) => PTZ({ ...ptz, [k]: Number(e.target.value) })}
                    />
                    <b>{ptz[k]}</b>
                  </label>
                ))}
              </div>
              <div className="ptz-row">
                <label className="inline-filter">
                  <span>补光</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={light}
                    onChange={(e) => LT(Number(e.target.value))}
                  />
                </label>
                <label className="inline-filter">
                  <span>升降杆</span>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={lift}
                    onChange={(e) => LF(Number(e.target.value))}
                  />
                </label>
                <label className="inline-filter">
                  <span>停留(s)</span>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={dwell}
                    onChange={(e) => DW(Number(e.target.value))}
                  />
                </label>
              </div>
              <Field label="避障策略 / 云台预置位">
                <div className="actions">
                  <select value={avoid} onChange={(e) => AV(e.target.value)}>
                    <option>绕行优先</option>
                    <option>原地等待</option>
                    <option>上报并跳过</option>
                  </select>
                  <input
                    value={preset}
                    placeholder="预置位，如 预置位 1"
                    onChange={(e) => PS(e.target.value)}
                  />
                </div>
              </Field>
              <div className="actions">
                <Btn onClick={teach}>记录当前位姿（示教回填）</Btn>
                {taught && <Badge>已示教</Badge>}
              </div>

              <div className="ana-h">④ 判定（沿用规则，可就地覆盖）</div>
              {rule ? (
                <div className="judge">
                  <b>{rule.name}</b>
                  <span>
                    {rule.type === "数值范围"
                      ? `${rule.min}–${rule.max} ${rule.unit}（含边界）`
                      : `期望 ${rule.expected}`}
                  </span>
                  <span>
                    等级 {rule.level} · {rule.enabled ? "启用" : "停用"} · 规则 v
                    {rule.version}
                  </span>
                </div>
              ) : (
                <p className="muted">
                  保存点位后自动生成判定规则（阈值随点位走，可在「采集结果与告警规则」就地覆盖）。
                </p>
              )}

              <Field label="采集质量与业务要求">
                <textarea
                  rows={3}
                  value={req}
                  onChange={(e) => Q(e.target.value)}
                />
              </Field>
              <Btn
                primary
                disabled={!canSave}
                onClick={() =>
                  act({
                    type: "ANNOTATE",
                    mapId: m.id,
                    targetId: target,
                    pointId: p?.id,
                    name: name.trim(),
                    device,
                    objects,
                    item: item || undefined,
                    requirement: req,
                    actionPlan: {
                      ptz,
                      viewDir,
                      preset,
                      avoidPolicy: avoid,
                      light,
                      lift,
                      dwellSec: dwell,
                    },
                    taught,
                  })
                }
              >
                保存业务标注
              </Btn>
              {!canSave && (
                <p className="muted">
                  保存前请补齐：点位名称、所属设备、至少一个检测目标。
                </p>
              )}
              <Btn
                disabled={!!p}
                onClick={() =>
                  act({ type: "DISCARD_TARGET", mapId: m.id, targetId: target })
                }
              >
                剔除误识别
              </Btn>
              {!embedded && <>
              <hr />
              <Field label="自主验证机器人">
                <select value={rid} onChange={(e) => R(e.target.value)}>
                  {s.robots.map((r) => (
                    <option key={r.id}>{r.id}</option>
                  ))}
                </select>
              </Field>
              <Btn
                disabled={!p}
                onClick={() =>
                  act({ type: "VALIDATE", id: p?.id, robotId: rid })
                }
              >
                模拟自主试巡检验证
              </Btn>
              <p className="muted">
                {p?.validated ||
                  "当前版本必须先同步至验证机器人。验证通过后启用点位。"}
              </p></>}
            </>
          ) : (
            <Note>从左侧或地图选择候选目标。</Note>
          )}
        </Panel>
      </div>
      {records && <Modal title="点位版本与验证记录" onClose={() => setRecords(false)}>
        <Table
          heads={["业务点位", "设备 / 检测项", "版本", "状态", "验证证据"]}
          rows={pts.map((p) => [
            p.name,
            `${p.device} / ${p.item}`,
            `v${p.version}`,
            <Badge>{p.state}</Badge>,
            p.validated || "待验证",
          ])}
        />
      </Modal>}
      {creating && (
        <Modal
          title="快速新建设备（人工新增 · 直接生效）"
          onClose={() => setCreating(false)}
          footer={
            <>
              <Btn onClick={() => setCreating(false)}>取消</Btn>
              <Btn
                primary
                disabled={
                  !nd.id.trim() || !nd.name.trim() || !nd.target.trim()
                }
                onClick={() => {
                  const code = nd.id.trim();
                  const ok = act({
                    type: "IMPORT_DEVICES",
                    approved: true,
                    devices: [
                      {
                        id: code,
                        name: nd.name.trim(),
                        type: nd.type,
                        regionCode: "R-A03",
                        locationDesc: nd.locationDesc,
                        items: [
                          {
                            id: `II-${code}-1`,
                            target: nd.target.trim(),
                            kind: "可见光",
                            unit: nd.unit,
                            inspect: true,
                            cycle: "每日",
                            priority: "普通",
                          },
                        ],
                      },
                    ],
                  });
                  if (ok) {
                    D(code);
                    OBJ([nd.target.trim()]);
                    I(defaultInspectItemName(nd.target.trim()));
                    setCreating(false);
                  }
                }}
              >
                创建并选中
              </Btn>
            </>
          }
        >
          <Field label="设备编码（唯一，字母 / 数字）">
            <input
              value={nd.id}
              placeholder="例如 V010"
              onChange={(e) => ND({ ...nd, id: e.target.value })}
            />
          </Field>
          <Field label="设备名称">
            <input
              value={nd.name}
              placeholder="例如 V010 新增储罐"
              onChange={(e) => ND({ ...nd, name: e.target.value })}
            />
          </Field>
          <Field label="设备类型">
            <input
              value={nd.type}
              onChange={(e) => ND({ ...nd, type: e.target.value })}
            />
          </Field>
          <Field label="安装位置">
            <input
              value={nd.locationDesc}
              placeholder="例如 一期罐区北侧"
              onChange={(e) => ND({ ...nd, locationDesc: e.target.value })}
            />
          </Field>
          <Field label="首个检测目标">
            <input
              value={nd.target}
              placeholder="例如 液位计"
              onChange={(e) => ND({ ...nd, target: e.target.value })}
            />
          </Field>
          <Field label="单位（数值类必填）">
            <input
              value={nd.unit}
              placeholder="例如 m"
              onChange={(e) => ND({ ...nd, unit: e.target.value })}
            />
          </Field>
          <Note>
            人工新增的设备直接生效、不走批量审核，仅用于现场补录；批量维护与审核请到设备主数据页。
          </Note>
        </Modal>
      )}
    </>
  );
}
