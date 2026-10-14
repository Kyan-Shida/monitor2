/**
 * @file PointEdit.tsx
 * @description 添加 / 编辑巡检点（内置页）：一个巡检点在这里一次定义完。
 *   页面分两栏：**左栏固定不动（sticky 吸顶），右栏可上下拉动**
 *   左栏 ① 来源信息（只读 · 自动带出）｜ ② 巡检点身份：巡检点名称 + 「地图中带有定位ID的点」
 *   右栏 ③ 地图选点：在底图上点击定位ID点完成绑定
 *        ④ 巡检项列表：每项 = 巡检项名称 + **巡检目标台账** + **机器操作内容**（原子动作 + 云台 / 视角参数），
 *          逐项「保存本项」；多个巡检项保存后共同组成这个巡检点。
 * @interaction 菜单「巡检点管理」→「＋ 添加巡检点」/ 行内「编辑巡检点」；
 *              引擎 action：SAVE_POINT；业务目标不够用时可就地「＋ 快速新建巡检目标台账」（ADD_BUSINESS_TARGET）
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { Badge, Btn, Empty, Field, Modal, Note, Panel, Table } from "../components/UI";
import { MapImageCanvas, type ImageMarker } from "../components/MapImageCanvas";
import { businessTargetLabelOf } from "../data/businessTargetCrumb";
import { clearPointDraft, pointDraftKey } from "../data/pointEditDraft";
import type {
  BusinessTarget,
  InspectSpec,
  JudgeType,
} from "../data/types";
import { defaultRangeOfUnit } from "../data/alarmRules";
import { defaultRequirementOfInstrument } from "../data/deviceMaster";
import { targetsOf } from "../data/mapCalibration";

export function PointEdit({ id, field }: { id?: string; field?: boolean }) {
  const { s, act } = useStore();
  const editing = id ? s.points.find((p) => p.id === id) : undefined;
  /**
   * 表单状态存会话草稿（与「添加 / 编辑巡检项」内置页共享同一组键）：
   * 跳去内置页编辑巡检项再返回时，名称 / 地图 / 定位点 / 已保存的巡检项都不丢
   */
  const key = pointDraftKey(id);
  const [name, NAME] = useViewState(`${key}.name`, editing?.name || "");
  const [mapId, MAP] = useViewState(
    `${key}.map`,
    editing?.mapId || s.maps[0]?.id || "",
  );
  const [targetId, TGT] = useViewState(`${key}.target`, editing?.targetId || "");
  /** 已保存的巡检项（多个巡检项组成一个巡检点） */
  const [items, ITEMS] = useViewState<InspectSpec[]>(
    `${key}.items`,
    editing?.inspectItems || [],
  );
  /** 正在编辑的巡检项草稿：由巡检项内置页读写；null = 不在编辑态 */
  const [draft, DRAFT] = useViewState<InspectSpec | null>(`${key}.draft`, null);
  const [err, ERR] = useState("");
  /** 「＋ 快速新建巡检目标台账」弹窗 */
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
  /**
   * 该地图的巡检点（**来源绑定键**：来自采集时产出的「巡检点标定文件」，
   * 独立存放于 data/mapCalibration.ts，不在地图上）
   */
  const mapTargets = targetsOf(s, mapId || "");
  /** 「带定位ID的点」：只有标定文件里带定位ID的点才能绑巡检点 */
  const targets = mapTargets.filter((t) => t.externalId);
  const noIdCount = mapTargets.filter((t) => !t.externalId).length;
  const target = mapTargets.find((t) => t.id === targetId);
  /** 统一坐标：优先取绑定标定点的世界坐标，其次取巡检点已存档坐标（左栏「来源信息」回显） */
  const worldOf = target?.world || editing?.world;
  const btOf = (bid: string) => bts.find((b) => b.id === bid);
  const insOf = (bid: string) => {
    const bid2 = btOf(bid)?.instrumentId;
    return s.instruments?.find((x) => x.id === bid2);
  };
  /** 业务目标一句话归属（与巡检项内置页共用同一表达） */
  const labelOfBt = (bid: string) => businessTargetLabelOf(s, bid);
  /** 巡检点是否已被其它巡检点占用（一对一：一个定位ID点只绑一个巡检点） */
  const ownerOf = (tid: string) => {
    const t = mapTargets.find((x) => x.id === tid);
    if (!t?.pointId || t.pointId === editing?.id) return undefined;
    return s.points.find((p) => p.id === t.pointId);
  };
  // 图上只画"带定位ID"的点（可绑定的），避免点选了不可用的平台新增点
  const markers: ImageMarker[] = targets.map((t) => ({
    id: t.id,
    x: t.world ? t.world.x : t.x,
    y: t.world ? t.world.y : t.y,
    label: t.externalId || t.id,
    state:
      t.id === targetId || t.pointId === editing?.id
        ? "已确认"
        : t.pointId
          ? "待确认"
          : "孤立",
    source: t.source,
  }));

  /**
   * 打开「添加 / 编辑巡检项」内置页
   * @description 草稿写进会话（`${key}.draft`），内置页保存后写回 `${key}.items` 并返回本页
   * @param sp 要编辑的巡检项；缺省 = 新开一条（默认带一个原子动作，参数取保守值）
   */
  function openItem(sp?: InspectSpec) {
    ERR("");
    DRAFT(
      sp
        ? { ...sp }
        : {
            id: "",
            name: "",
            targetId: bts[0]?.id || "",
            actions: ["拍照"],
            pose: {
              ptz: { pan: 0, tilt: 0, zoom: 1 },
              light: 40,
              dwellSec: 5,
              viewDir: "",
              avoidPolicy: "标准",
            },
          },
    );
    go("inspect-item-edit", id || "new");
  }
  /**
   * 巡检项排序：与相邻项交换位置（列表顺序即机器人执行顺序）
   * @param i 当前项下标
   * @param delta -1 上移 / 1 下移
   */
  function moveItem(i: number, delta: number) {
    ITEMS((old) => {
      const j = i + delta;
      if (j < 0 || j >= old.length) return old;
      const next = [...old];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
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
      // 标定机器人与停靠位姿已不在本页维护：编辑时保留原值
      calibrateRobot: editing?.calibrateRobot,
      pose: editing?.pose,
    });
    if (ok) {
      // 保存成功：清掉本次会话草稿，避免下次进入看到旧内容
      clearPointDraft(id);
      go("annotation");
    }
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
        <div className="actions">
          <Btn primary disabled={!!draft} onClick={savePoint}>
            {editing ? "保存巡检点" : "创建巡检点"}
          </Btn>
        </div>
      </div>

      {err && (
        <p role="alert" className="reference-upload-error">
          {err}
        </p>
      )}

      {/*
        页面分区（左栏固定 · 右栏可上下拉动）：
          左栏（吸顶不动）：① 来源信息（只读 · 自动带出）｜ ② 巡检点身份
          右栏（随页面上下滚动）：③ 地图选点 ｜ ④ 巡检项列表
      */}
      <div className="point-edit-split">
        <aside className="point-edit-side">
          <Panel
            className="point-edit-source"
            title="来源信息"
            extra={<span className="muted">只读 · 自动带出</span>}
          >
            <div className="point-edit-kv">
              <span>来源地图</span>
              <b>{m?.name || "—"}</b>
              <span>绑定标定点</span>
              <b>{target ? `${target.externalId} · ${target.source || "—"}` : "—"}</b>
              <span>标定机器人</span>
              <b>{editing?.calibrateRobot || "—"}</b>
              <span>统一坐标</span>
              <b>{worldOf ? `X ${worldOf.x} / Y ${worldOf.y} / Z ${worldOf.z}` : "—"}</b>
            </div>
          </Panel>

          <Panel
            className="point-edit-identity"
            title="巡检点身份"
            extra={<Badge>{editing ? editing.id : "新建"}</Badge>}
          >
            <Field label="巡检点名称">
              <input
                value={name}
                placeholder="例如 一期罐区 A 排巡检点"
                onChange={(e) => NAME(e.target.value)}
              />
            </Field>
            <div className="point-section-h">绑定定位点</div>
            <Field label="选择地图中带有定位ID的点">
              <select value={targetId} disabled={!!editing} onChange={(e) => TGT(e.target.value)}>
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
                该地图还没有<b>带定位ID的标定点</b>：先到「巡检点管理 › 巡检点导入」导入标定文件，
                再回来绑定。{noIdCount > 0 && `（当前有 ${noIdCount} 个平台新增点缺少定位ID）`}
              </Note>
            )}
            {target && (
              <p className="muted">
                已绑定标定点：<b>{target.externalId}</b> · 来源 {target.source || "—"} · 底图投影{" "}
                {target.x}, {target.y}
                {editing?.world && (
                  <>
                    {" "}
                    · 统一坐标 XYZ（{editing.world.x}, {editing.world.y}, {editing.world.z}）米
                  </>
                )}
              </p>
            )}
          </Panel>
        </aside>

        <div className="point-edit-main">
          <Panel
            className="point-edit-map"
            title="地图选点（点击定位ID点完成绑定）"
          >
            <MapImageCanvas
              image={m?.image}
              markers={markers}
              selected={targetId}
              onSelect={editing ? undefined : (tid) => !ownerOf(tid) && TGT(tid)}
              height={340}
              showIds
            />
            <small className="muted">
              点击图上的定位ID点即可选中；已被其它巡检点占用的点不可选。
            </small>
          </Panel>

          <Panel
            className="point-edit-items"
            title={`巡检项（${items.length} 项）`}
            extra={
              <Btn primary onClick={() => openItem()}>
                ＋ 添加巡检项
              </Btn>
            }
          >
            <Table
              heads={["#", "巡检项名称", "巡检目标台账", "原子动作", "云台 PTZ", "操作"]}
              rows={items.map((sp, i) => [
                <span className="muted">{i + 1}</span>,
                <b>{sp.name}</b>,
                labelOfBt(sp.targetId),
                sp.actions.join(" / "),
                `P${sp.pose.ptz.pan}° / T${sp.pose.ptz.tilt}° / Z${sp.pose.ptz.zoom}`,
                <div className="actions">
                  {/* 排序：巡检项顺序 = 机器人执行顺序，首尾禁用对应方向 */}
                  <Btn disabled={i === 0} onClick={() => moveItem(i, -1)}>
                    上移
                  </Btn>
                  <Btn
                    disabled={i === items.length - 1}
                    onClick={() => moveItem(i, 1)}
                  >
                    下移
                  </Btn>
                  <Btn onClick={() => openItem(sp)}>编辑</Btn>
                  <Btn
                    onClick={() => ITEMS((old) => old.filter((x) => x.id !== sp.id))}
                  >
                    删除
                  </Btn>
                </div>,
              ])}
            />
            {!items.length && (
              <Empty>
                还没有巡检项。点「＋ 添加巡检项」——巡检项 = 名称 + 业务目标 + 机器操作内容。
              </Empty>
            )}
          </Panel>
        </div>
      </div>

      {/* 巡检项编辑已改为内置页（inspect-item-edit）：此处只保留「快速新建台账」弹窗 */}
      {btOpen && (
        <Modal
          title="快速新建巡检目标台账"
          wide
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
            巡检目标台账 = 仪表 + 巡检要求 + 算法 + 告警模板。
            此处为现场补录入口，建完提交即人工新增、直接生效。
            <br />
            新建默认<b>二级告警（通知设备岗）</b>；判定异常即告警，平台没有"告警开关"，
            告警等级 / 通知 / 关联告警模板统一在「巡检目标台账 › 3、告警规则」维护。
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
              {(s.requirements || [])
                // 这里是仪表类目标（挂仪表）：只列适用于仪表的巡检要求
                .filter((r) => (r.targetKinds || ["仪表"]).includes("仪表"))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}（{r.kind}）
                  </option>
                ))}
            </select>
          </Field>
          <p className="muted">
            {(s.requirements || []).find((r) => r.id === bt.requirementId)?.description}
          </p>
          {/* 算法值来自「后台管理 › 工厂基础数据 › 算法」，不再手填（打通联动） */}
          <Field label="算法 / AI 表达方式（来源：后台管理 › 算法）">
            <select
              value={bt.algorithm}
              onChange={(e) => BT({ ...bt, algorithm: e.target.value })}
            >
              <option value="">请选择算法</option>
              {[
                ...(s.algoConfigs || [])
                  .filter((a) => a.state !== "停用")
                  .map((a) => a.name),
                ...(bt.algorithm &&
                !(s.algoConfigs || []).some((a) => a.name === bt.algorithm)
                  ? [bt.algorithm]
                  : []),
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
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
