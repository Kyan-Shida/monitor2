/**
 * @file PointEdit.tsx
 * @description 添加 / 编辑巡检点（内置页）：一个巡检点在这里一次定义完。
 *   ① 巡检点身份：巡检点名称 + 选择地图 + 选择「地图中带有定位ID的点」
 *   ② 巡检项列表：每项 = 巡检项名称 + **业务巡检目标** + **机器操作内容**（原子动作 + 云台 / 视角参数），
 *      逐项「保存本项」；多个巡检项保存后共同组成这个巡检点。
 * @interaction 菜单「巡检点管理」→「＋ 添加巡检点」/ 行内「编辑巡检点」；
 *              引擎 action：SAVE_POINT；业务目标不够用时可就地「＋ 快速新建业务巡检目标」（ADD_BUSINESS_TARGET）
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Empty, Field, Modal, Note, Panel, Table } from "../components/UI";
import { MapImageCanvas, type ImageMarker } from "../components/MapImageCanvas";
import { atomicActions } from "../data/types";
import type {
  AtomicAction,
  BusinessTarget,
  InspectSpec,
  JudgeType,
  PointActionPlan,
} from "../data/types";
import { defaultRangeOfUnit } from "../data/alarmRules";
import { defaultRequirementOfInstrument } from "../data/deviceMaster";

/** 避障策略选项（到点后的通行策略） */
const AVOID = ["标准", "谨慎", "绕行"];

export function PointEdit({ id }: { id?: string }) {
  const { s, act } = useStore();
  const editing = id ? s.points.find((p) => p.id === id) : undefined;
  const [name, NAME] = useState(editing?.name || "");
  const [mapId, MAP] = useState(editing?.mapId || s.maps[0]?.id || "");
  const [targetId, TGT] = useState(editing?.targetId || "");
  /** 已保存的巡检项（多个巡检项组成一个巡检点） */
  const [items, ITEMS] = useState<InspectSpec[]>(editing?.inspectItems || []);
  /** 正在编辑的巡检项草稿；null 表示不在编辑态 */
  const [draft, DRAFT] = useState<InspectSpec | null>(null);
  const [err, ERR] = useState("");
  /** 「＋ 快速新建业务巡检目标」弹窗 */
  const [btOpen, BTO] = useState(false);
  const [bt, BT] = useState({
    instrumentId: "",
    requirementId: "",
    algorithm: "",
    judge: "数值范围" as JudgeType,
    unit: "",
    min: 0,
    max: 1,
    expected: "",
    criteria: "",
  });

  const bts = s.businessTargets || [];
  const m = s.maps.find((x) => x.id === mapId);
  /** 「地图中带有定位ID的点」：只有随地图文件带入定位ID的点才能绑巡检点 */
  const targets = (m?.targets || []).filter((t) => t.externalId);
  const noIdCount = (m?.targets || []).filter((t) => !t.externalId).length;
  const target = m?.targets.find((t) => t.id === targetId);
  const btOf = (bid: string) => bts.find((b) => b.id === bid);
  const insOf = (bid: string) => {
    const bid2 = btOf(bid)?.instrumentId;
    return s.instruments?.find((x) => x.id === bid2);
  };
  /** 业务目标一句话归属：区域 › 设备 › 仪表 · 巡检要求 */
  const labelOfBt = (bid: string) => {
    const b = btOf(bid);
    const ins = insOf(bid);
    const dev = s.devices?.find((d) => d.id === ins?.deviceId);
    const req = (s.requirements || []).find((r) => r.id === b?.requirementId);
    return `${dev?.region || "—"} › ${dev?.name || "—"} › ${ins?.name || "—"} · ${req?.name || ""}`;
  };
  /** 地图点位是否已被其它巡检点占用（一对一：一个定位ID点只绑一个巡检点） */
  const ownerOf = (tid: string) => {
    const t = m?.targets.find((x) => x.id === tid);
    if (!t?.pointId || t.pointId === editing?.id) return undefined;
    return s.points.find((p) => p.id === t.pointId);
  };
  // 图上只画"带定位ID"的点（可绑定的），避免点选了不可用的平台新增点
  const markers: ImageMarker[] = targets.map((t) => ({
    id: t.id,
    x: t.x,
    y: t.y,
    label: t.externalId || t.id,
    state:
      t.id === targetId || t.pointId === editing?.id
        ? "已确认"
        : t.pointId
          ? "待确认"
          : "孤立",
    source: t.source,
  }));

  const upd = (patch: Partial<InspectSpec>) =>
    DRAFT((d) => (d ? { ...d, ...patch } : d));
  const updPose = (patch: Partial<PointActionPlan>) =>
    DRAFT((d) => (d ? { ...d, pose: { ...d.pose, ...patch } } : d));

  /** 新开一条巡检项草稿（默认带一个原子动作，参数取保守值） */
  function newItem() {
    ERR("");
    const first = bts[0];
    DRAFT({
      id: "",
      name: "",
      targetId: first?.id || "",
      actions: ["拍照"],
      pose: {
        ptz: { pan: 0, tilt: 0, zoom: 1 },
        light: 40,
        dwellSec: 5,
        viewDir: "",
        avoidPolicy: "标准",
      },
    });
  }
  /** 「保存本项」：编辑态覆盖、新增态追加；保存后回到巡检项列表 */
  function saveItem() {
    if (!draft) return;
    if (!draft.name.trim()) return ERR("请填写巡检项名称");
    if (!draft.targetId) return ERR("请选择业务巡检目标（检什么、怎么判）");
    if (!draft.actions.length) return ERR("请至少选择一个原子动作");
    const rec: InspectSpec = {
      ...draft,
      id: draft.id || "IP-" + Date.now().toString(36),
    };
    ITEMS((old) =>
      old.some((x) => x.id === rec.id)
        ? old.map((x) => (x.id === rec.id ? rec : x))
        : [...old, rec],
    );
    ERR("");
    DRAFT(null);
  }
  /** 保存巡检点：逐项已保存的巡检项整体提交（多个巡检项组成一个巡检点） */
  function savePoint() {
    if (draft) return ERR("请先「保存本项」或「取消本项」，再保存巡检点");
    if (!name.trim()) return ERR("请填写巡检点名称");
    if (!targetId) return ERR("请选择地图中带有定位ID的点");
    if (!items.length) return ERR("请至少添加并保存一个巡检项");
    ERR("");
    const ok = act({
      type: "SAVE_POINT",
      pointId: editing?.id,
      mapId,
      targetId,
      name,
      inspectItems: items,
    });
    if (ok) go("annotation");
  }
  /** 打开快速新建业务目标：默认取已选巡检项的仪表 */
  function openBt() {
    const insId = insOf(draft?.targetId || "")?.id || s.instruments?.[0]?.id || "";
    const ins = s.instruments?.find((x) => x.id === insId);
    const rid = ins ? defaultRequirementOfInstrument(ins) : "";
    BT({
      instrumentId: insId,
      requirementId: rid,
      algorithm: "",
      judge: "数值范围",
      unit: ins?.unit || "",
      min: 0,
      max: 1,
      expected: "",
      criteria: "",
    });
    if (ins && rid) applyReq(rid, insId);
    BTO(true);
  }
  /** 选巡检要求：带出算法 / 判定 / 阈值 / 单位 / 判断标准 */
  function applyReq(rid: string, insId: string) {
    const req = (s.requirements || []).find((r) => r.id === rid);
    const ins = s.instruments?.find((x) => x.id === insId);
    const range =
      req?.judge === "数值范围"
        ? defaultRangeOfUnit(req.unit || ins?.unit) || { min: 0, max: 1 }
        : undefined;
    BT((o) => ({
      ...o,
      requirementId: rid,
      algorithm: req?.algorithm || "",
      judge: req?.judge || "数值范围",
      unit: req?.unit || ins?.unit || "",
      min: range?.min ?? 0,
      max: range?.max ?? 1,
      expected: req?.expected || "",
      criteria: req?.description || "",
    }));
  }
  /** 提交快速新建（人工新增、直接生效） */
  function saveBt() {
    const ok = act({
      type: "ADD_BUSINESS_TARGET",
      instrumentId: bt.instrumentId,
      requirementId: bt.requirementId,
      algorithm: bt.algorithm,
      judge: bt.judge,
      unit: bt.unit,
      min: Number(bt.min),
      max: Number(bt.max),
      expected: bt.expected,
      criteria: bt.criteria,
      needPhoto: true,
      needVideo: false,
      needReview: false,
      cycle: "每日",
      priority: "普通" as BusinessTarget["priority"],
      inspect: true,
    });
    if (ok) BTO(false);
  }

  return (
    <>
      <div className="context-bar">
        <b>{editing ? `编辑巡检点 · ${editing.name}` : "添加巡检点"}</b>
        <span>
          巡检点 = 名称 + 地图 + 地图点位（带定位ID）+ 多个巡检项；巡检项 = 名称 + 业务目标 + 机器操作内容
        </span>
        <div className="actions">
          <Btn onClick={() => go("annotation")}>返回巡检点列表</Btn>
        </div>
      </div>

      <div className="grid template-layout">
        <Panel
          title="① 巡检点身份"
          extra={<Badge>{editing ? editing.id : "新建"}</Badge>}
        >
          <Field label="巡检点名称">
            <input
              value={name}
              placeholder="例如 一期罐区 A 排巡检点"
              onChange={(e) => NAME(e.target.value)}
            />
          </Field>
          <Field label="选择地图">
            <select
              value={mapId}
              onChange={(e) => {
                MAP(e.target.value);
                TGT("");
              }}
            >
              {s.maps.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}（{x.region}）
                </option>
              ))}
            </select>
          </Field>
          <Field label="选择地图中带有定位ID的点">
            <select value={targetId} onChange={(e) => TGT(e.target.value)}>
              <option value="">请选择定位ID点</option>
              {targets.map((t) => {
                const owner = ownerOf(t.id);
                return (
                  <option key={t.id} value={t.id} disabled={!!owner}>
                    {`${t.externalId} · ${t.kind || "点位"}${
                      owner ? `（已被「${owner.name}」占用）` : ""
                    }`}
                  </option>
                );
              })}
            </select>
          </Field>
          {!targets.length && (
            <Note>
              该地图还没有<b>带定位ID的点位</b>：先到「地图管理 › 地图工作台」导入地图或补录定位ID，
              再回来绑定。{noIdCount > 0 && `（当前有 ${noIdCount} 个平台新增点缺少定位ID）`}
            </Note>
          )}
          {target && (
            <p className="muted">
              已绑定：<b>{target.externalId}</b> · 来源 {target.source || "—"} · 图上坐标{" "}
              {target.x}, {target.y}
            </p>
          )}
          <MapImageCanvas
            image={m?.image}
            markers={markers}
            selected={targetId}
            onSelect={(tid) => !ownerOf(tid) && TGT(tid)}
            height={260}
            showIds
          />
          <small className="muted">
            点击图上的定位ID点即可选中；已被其它巡检点占用的点不可选。
          </small>
        </Panel>

        <Panel
          title={`② 巡检项（${items.length} 项）`}
          extra={
            <Btn primary disabled={!!draft} onClick={newItem}>
              ＋ 添加巡检项
            </Btn>
          }
        >
          <p className="muted">
            一个停靠位上「一次要看几个东西」就在这里配：每个巡检项独立选
            <b>业务巡检目标</b>（检什么、怎么判），并独立编排
            <b>机器操作内容</b>（原子动作 + 云台 / 视角）。
          </p>
          <Table
            heads={["巡检项名称", "业务巡检目标", "原子动作", "云台 / 视角", "操作"]}
            rows={items.map((sp) => [
              <b>{sp.name}</b>,
              labelOfBt(sp.targetId),
              sp.actions.join(" / "),
              <>
                P{sp.pose.ptz.pan}° / T{sp.pose.ptz.tilt}° / Z{sp.pose.ptz.zoom}
                <small>
                  {[
                    sp.pose.viewDir,
                    sp.pose.light !== undefined ? `补光 ${sp.pose.light}%` : "",
                    sp.pose.dwellSec !== undefined ? `停留 ${sp.pose.dwellSec}s` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "未设"}
                </small>
              </>,
              <div className="actions">
                <Btn disabled={!!draft} onClick={() => DRAFT({ ...sp })}>
                  编辑
                </Btn>
                <Btn
                  disabled={!!draft}
                  onClick={() => ITEMS((old) => old.filter((x) => x.id !== sp.id))}
                >
                  删除
                </Btn>
              </div>,
            ])}
          />
          {!items.length && !draft && (
            <Empty>
              还没有巡检项。点「＋ 添加巡检项」——巡检项 = 名称 + 业务目标 + 机器操作内容。
            </Empty>
          )}

          {draft && (
            <>
              <Note>
                正在编辑巡检项：填好后点「保存本项」加入本巡检点；多个巡检项共同组成一个巡检点。
              </Note>
              <Field label="巡检项名称">
                <input
                  value={draft.name}
                  placeholder="例如 压力读数 / 泵体滴漏"
                  onChange={(e) => upd({ name: e.target.value })}
                />
              </Field>
              <Field label="业务巡检目标（检什么 · 怎么判）">
                <div className="actions">
                  <select
                    value={draft.targetId}
                    onChange={(e) => {
                      const bid = e.target.value;
                      const b = btOf(bid);
                      const req = (s.requirements || []).find(
                        (r) => r.id === b?.requirementId,
                      );
                      const ins = insOf(bid);
                      upd({
                        targetId: bid,
                        // 名称留空时按"巡检要求（退了用仪表名）"给个默认值，可改
                        name: draft.name || req?.name || ins?.name || "",
                      });
                    }}
                  >
                    <option value="">请选择业务巡检目标</option>
                    {bts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {labelOfBt(b.id)}
                        {b.inspect ? "" : "（已关闭是否巡检）"}
                      </option>
                    ))}
                  </select>
                  <Btn onClick={openBt}>＋ 快速新建业务巡检目标</Btn>
                </div>
              </Field>
              {!bts.length && (
                <Note>
                  还没有业务巡检目标：业务目标 = 仪表 + 巡检要求 + 算法 + 阈值 + 判断标准。
                  请先在「业务巡检目标」里建，或点上方「＋ 快速新建」。
                </Note>
              )}
              <Field label="机器操作内容 · 原子动作（到点后做什么）">
                <div className="actions">
                  {atomicActions.map((a: AtomicAction) => (
                    <label key={a} className="inline-filter">
                      <input
                        type="checkbox"
                        checked={draft.actions.includes(a)}
                        onChange={(e) =>
                          upd({
                            actions: e.target.checked
                              ? [...draft.actions, a]
                              : draft.actions.filter((x) => x !== a),
                          })
                        }
                      />
                      <span>{a}</span>
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="机器操作内容 · 云台（可通过操作云台编辑参数）">
                <div className="ptz-row">
                  {(
                    [
                      ["pan", "水平", -180, 180],
                      ["tilt", "俯仰", -90, 90],
                      ["zoom", "变焦", 1, 30],
                    ] as const
                  ).map(([k, label, min, max]) => (
                    <label key={k} className="inline-filter">
                      <span>{label}</span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        aria-label={`${label}滑杆`}
                        value={draft.pose.ptz[k]}
                        onChange={(e) =>
                          updPose({
                            ptz: {
                              ...draft.pose.ptz,
                              [k]: Number(e.target.value),
                            },
                          })
                        }
                      />
                      <input
                        type="number"
                        min={min}
                        max={max}
                        aria-label={label}
                        value={draft.pose.ptz[k]}
                        onChange={(e) =>
                          updPose({
                            ptz: {
                              ...draft.pose.ptz,
                              [k]: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="机器操作内容 · 视角与到点执行">
                <div className="actions">
                  <label className="inline-filter">
                    <span>观察方向：</span>
                    <input
                      value={draft.pose.viewDir || ""}
                      placeholder="例如 正对表盘"
                      onChange={(e) => updPose({ viewDir: e.target.value })}
                    />
                  </label>
                  <label className="inline-filter">
                    <span>补光：</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      aria-label="补光"
                      value={draft.pose.light ?? 0}
                      onChange={(e) =>
                        updPose({ light: Number(e.target.value) })
                      }
                    />
                    <span>{draft.pose.light ?? 0}%</span>
                  </label>
                  <label className="inline-filter">
                    <span>升降：</span>
                    <input
                      type="number"
                      step="0.1"
                      aria-label="升降高度"
                      value={draft.pose.lift ?? 0}
                      onChange={(e) => updPose({ lift: Number(e.target.value) })}
                    />
                  </label>
                  <label className="inline-filter">
                    <span>停留：</span>
                    <input
                      type="number"
                      aria-label="停留秒数"
                      value={draft.pose.dwellSec ?? 5}
                      onChange={(e) =>
                        updPose({ dwellSec: Number(e.target.value) })
                      }
                    />
                    <span>秒</span>
                  </label>
                  <label className="inline-filter">
                    <span>避障：</span>
                    <select
                      aria-label="避障策略"
                      value={draft.pose.avoidPolicy || "标准"}
                      onChange={(e) => updPose({ avoidPolicy: e.target.value })}
                    >
                      {AVOID.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label className="inline-filter">
                    <span>预置位：</span>
                    <input
                      value={draft.pose.preset || ""}
                      placeholder="例如 P-03"
                      onChange={(e) => updPose({ preset: e.target.value })}
                    />
                  </label>
                </div>
              </Field>
              <div className="actions">
                <Btn primary onClick={saveItem}>
                  保存本项
                </Btn>
                <Btn
                  onClick={() => {
                    DRAFT(null);
                    ERR("");
                  }}
                >
                  取消本项
                </Btn>
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="actions toolbar-inline">
        <Btn primary disabled={!!draft} onClick={savePoint}>
          {editing ? "保存巡检点" : "创建巡检点"}
        </Btn>
        <Btn onClick={() => go("annotation")}>返回巡检点列表</Btn>
        <small className="muted">
          保存后巡检点进入「待验证」；通过「地图标注工作台」的自主验证后转「已启用」，
          再由任务模板 / 临时任务引用。
        </small>
      </div>
      {err && (
        <p role="alert" className="reference-upload-error">
          {err}
        </p>
      )}

      {btOpen && (
        <Modal
          title="快速新建业务巡检目标"
          drawer
          drawerWidth={620}
          onClose={() => BTO(false)}
          footer={
            <>
              <Btn onClick={() => BTO(false)}>取消</Btn>
              <Btn
                primary
                disabled={
                  !bt.instrumentId || !bt.requirementId || !bt.algorithm.trim()
                }
                onClick={saveBt}
              >
                创建并生效
              </Btn>
            </>
          }
        >
          <Note>
            业务巡检目标 = 业务目标与要求 + 仪表 + 巡检要求 + 算法 + 阈值 + 判断标准 +
            <b>告警设置</b>。此处为现场补录入口，建完提交即人工新增、直接生效（不进入批量审核）。
            <br />
            新建默认<b>开启告警（重要级，通知设备岗）</b>；告警开关 / 等级 / 通知只改「业务巡检目标」里的
            「告警设置」——巡检点本身不配置告警。若原有业务目标不合适，请到「业务巡检目标」里就地调整。
          </Note>
          <Field label="检测目标（仪表）">
            <select
              value={bt.instrumentId}
              onChange={(e) => {
                const insId = e.target.value;
                const ins = s.instruments?.find((x) => x.id === insId);
                const rid = ins ? defaultRequirementOfInstrument(ins) : "";
                BT((o) => ({ ...o, instrumentId: insId }));
                if (rid) applyReq(rid, insId);
              }}
            >
              <option value="">请选择仪表</option>
              {(s.instruments || []).map((x) => {
                const dev = s.devices?.find((d) => d.id === x.deviceId);
                return (
                  <option key={x.id} value={x.id}>
                    {dev?.region || "—"} › {dev?.name || "—"} › {x.name}（
                    {x.capture}
                    {x.unit ? ` · ${x.unit}` : ""}）
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="巡检要求（决定看什么）">
            <select
              value={bt.requirementId}
              onChange={(e) => applyReq(e.target.value, bt.instrumentId)}
            >
              {(s.requirements || []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}（{r.kind}）
                </option>
              ))}
            </select>
          </Field>
          <p className="muted">
            {(s.requirements || []).find((r) => r.id === bt.requirementId)?.description}
          </p>
          <Field label="算法 / AI 表达方式">
            <input
              value={bt.algorithm}
              placeholder="例如 表计读数识别 v1.2"
              onChange={(e) => BT({ ...bt, algorithm: e.target.value })}
            />
          </Field>
          <Field label="判定方式">
            <select
              value={bt.judge}
              onChange={(e) => BT({ ...bt, judge: e.target.value as JudgeType })}
            >
              {(["数值范围", "期望状态", "有无目标", "等级评分"] as JudgeType[]).map(
                (j) => (
                  <option key={j}>{j}</option>
                ),
              )}
            </select>
          </Field>
          {bt.judge === "数值范围" && (
            <Field label="阈值（判断标准）">
              <div className="actions">
                <input
                  type="number"
                  step="0.01"
                  aria-label="下限"
                  value={bt.min}
                  onChange={(e) => BT({ ...bt, min: Number(e.target.value) })}
                />
                <span>–</span>
                <input
                  type="number"
                  step="0.01"
                  aria-label="上限"
                  value={bt.max}
                  onChange={(e) => BT({ ...bt, max: Number(e.target.value) })}
                />
                <input
                  aria-label="单位"
                  placeholder="单位"
                  value={bt.unit}
                  onChange={(e) => BT({ ...bt, unit: e.target.value })}
                />
              </div>
            </Field>
          )}
          {bt.judge === "期望状态" && (
            <Field label="期望状态">
              <input
                value={bt.expected}
                placeholder="例如 开启"
                onChange={(e) => BT({ ...bt, expected: e.target.value })}
              />
            </Field>
          )}
          <Field label="判断标准补充说明">
            <textarea
              rows={2}
              value={bt.criteria}
              placeholder="例如 以罐体上半部最高温为准"
              onChange={(e) => BT({ ...bt, criteria: e.target.value })}
            />
          </Field>
        </Modal>
      )}
    </>
  );
}
