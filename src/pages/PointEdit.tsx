/**
 * @file PointEdit.tsx
 * @description 添加 / 编辑巡检点（内置页）：一个巡检点在这里一次定义完。
 *   ① 巡检点身份：巡检点名称 + 选择地图 + 选择「地图中带有定位ID的点」
 *   ② 巡检项列表：每项 = 巡检项名称 + **巡检目标台账** + **机器操作内容**（原子动作 + 云台 / 视角参数），
 *      逐项「保存本项」；多个巡检项保存后共同组成这个巡检点。
 * @interaction 菜单「巡检点管理」→「＋ 添加巡检点」/ 行内「编辑巡检点」；
 *              引擎 action：SAVE_POINT；业务目标不够用时可就地「＋ 快速新建巡检目标台账」（ADD_BUSINESS_TARGET）
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Empty, Field, Modal, Note, Panel, Table } from "../components/UI";
import { MapImageCanvas, type ImageMarker } from "../components/MapImageCanvas";
import { InspectItemDrawer } from "../components/InspectItemDrawer";
import type {
  BusinessTarget,
  InspectSpec,
  JudgeType,
} from "../data/types";
import { defaultRangeOfUnit } from "../data/alarmRules";
import { defaultRequirementOfInstrument } from "../data/deviceMaster";
import { targetsOf } from "../data/mapCalibration";

export function PointEdit({ id }: { id?: string }) {
  const { s, act } = useStore();
  const editing = id ? s.points.find((p) => p.id === id) : undefined;
  const [name, NAME] = useState(editing?.name || "");
  const [mapId, MAP] = useState(editing?.mapId || s.maps[0]?.id || "");
  const [targetId, TGT] = useState(editing?.targetId || "");
  /**
   * PT-02：标定用机器人（选在**巡检点层面**，不是每个巡检项里选）。
   * 数据流是「机器人 → 平台」上行：点「从机器人获取」实时抓取当前位姿，抓取后可手工微调。
   */
  const [bindRobot, BINDROBOT] = useState(editing?.calibrateRobot || "");
  /** 抓取到 / 手工微调后的停靠位姿（粗参考，本体到场后由本地算法微调） */
  const [pose, POSE] = useState<{ x: number; y: number; yaw: number } | undefined>(
    editing?.pose,
  );
  /** 已保存的巡检项（多个巡检项组成一个巡检点） */
  const [items, ITEMS] = useState<InspectSpec[]>(editing?.inspectItems || []);
  /** 正在编辑的巡检项草稿；null 表示不在编辑态 */
  const [draft, DRAFT] = useState<InspectSpec | null>(null);
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
  /** 巡检点是否已被其它巡检点占用（一对一：一个定位ID点只绑一个巡检点） */
  const ownerOf = (tid: string) => {
    const t = mapTargets.find((x) => x.id === tid);
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
    if (!draft.targetId) return ERR("请选择巡检目标台账（检什么、怎么判）");
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
      // PT-02：标定机器人与抓取到的位姿（粗参考）随巡检点保存
      calibrateRobot: bindRobot || undefined,
      pose,
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
          {/* PT-01（V1.3 修订）：取消中间术语层，统一为「标定点 / 巡检点」两级口径 */}
          <b>标定点</b> = 地图位置 + 定位ID（仅时空信息，无业务）；
          <b>巡检点</b> = 名称 + 标定点 + 多个巡检项（空间信息 + 业务信息）；
          巡检项 = 名称 + 业务目标 + 机器操作内容
        </span>
        <div className="actions">
          <Btn primary disabled={!!draft} onClick={savePoint}>
            {editing ? "保存巡检点" : "创建巡检点"}
          </Btn>
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
          <div className="point-section-h">标定与停靠位姿</div>
          {/* PT-02：标定机器人选在巡检点层面；「获取」从机器人上行抓取当前位姿，抓取后可手动微调 */}
          <Field label="标定机器人（用于抓取位姿 / 云台参数）">
            <select
              value={bindRobot}
              onChange={(e) => BINDROBOT(e.target.value)}
            >
              <option value="">请选择机器人</option>
              {s.robots.map((rb) => (
                <option key={rb.id} value={rb.id}>
                  {rb.id} · {rb.name} · {rb.state}
                </option>
              ))}
            </select>
          </Field>
          <div className="actions">
            <Btn
              disabled={!bindRobot}
              title="从机器人获取当前位姿与上装参数（机器人 → 平台上行）"
              onClick={() => {
                const rb = s.robots.find((x) => x.id === bindRobot);
                if (!rb) return;
                // 演示：抓取机器人当前位置作为停靠位姿（粗参考），抓取后可在下方手工微调
                POSE({
                  x: Math.round(rb.x),
                  y: Math.round(rb.y),
                  yaw: 0,
                });
                ERR("");
              }}
            >
              从机器人获取位姿
            </Btn>
            {pose && (
              <span className="muted">
                已获取：X {pose.x} / Y {pose.y} / Yaw {pose.yaw}°（粗参考，可微调）
              </span>
            )}
          </div>
          {pose && (
            <div className="actions">
              <label className="inline-filter">
                <span>Yaw°</span>
                <input
                  type="number"
                  value={pose.yaw}
                  onChange={(e) =>
                    POSE({ ...pose, yaw: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          )}
          <div className="point-section-h">绑定定位点</div>
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
            <b>巡检目标台账</b>（检什么、怎么判），并独立编排
            <b>机器操作内容</b>（原子动作 + 云台 / 视角）。
          </p>
          <Table
            heads={["巡检项名称", "巡检目标台账", "原子动作", "云台 / 视角", "操作"]}
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

        </Panel>
      </div>

      <Panel
        title="③ 地图选点（点击定位ID点完成绑定）"
        className="point-edit-map"
      >
        <MapImageCanvas
          image={m?.image}
          markers={markers}
          selected={targetId}
          onSelect={(tid) => !ownerOf(tid) && TGT(tid)}
          height={340}
          showIds
        />
        <small className="muted">
          点击图上的定位ID点即可选中；已被其它巡检点占用的点不可选。
        </small>
      </Panel>

      <details className="point-footnote">
        <summary>说明：定位ID 与标定参数口径</summary>
        <Note>
          定位 ID 来源：随<b>巡检点标定文件</b>导入（采集时与点云地图<b>同批产出、分开上传</b>）。
          它只是<b>来源绑定键</b>——用来把标定点挂到地图位置上，<b>不是本巡检点的业务主键</b>：
          平台巡检点主键另行生成、稳定不变；跨地图 / 跨版本的真正定位依据是
          <b>统一坐标 XYZ + 姿态 + 上装参数</b>。地图重传 / 更新后按定位 ID 自动匹配，
          匹配不上则按坐标辅助 + 人工确认重绑。
        </Note>
        <Note>
          位姿 / 云台 / 上装（焦距、光圈、升降、补光）参数均为<b>粗参考</b>：本体到场后由机器人本地算法微调对准，
          不保证填了即百分百对准。
        </Note>
      </details>

      {draft && (
        <InspectItemDrawer
          draft={draft}
          onChange={upd}
          onSave={saveItem}
          onCancel={() => {
            DRAFT(null);
            ERR("");
          }}
          businessTargets={bts}
          labelOfBt={labelOfBt}
          onOpenBt={openBt}
        />
      )}

      {/* 保存 / 返回按钮已移至顶部 context-bar；此处仅保留状态提示 */}
      <small className="muted">
        保存后巡检点进入「待验证」；通过「地图标注工作台」的自主验证后转「已启用」，
        再由任务模板 / 临时任务引用。
      </small>
      {err && (
        <p role="alert" className="reference-upload-error">
          {err}
        </p>
      )}

      {btOpen && (
        <Modal
          title="快速新建巡检目标台账"
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
            巡检目标台账 = 业务目标与要求 + 仪表 + 巡检要求 + 算法 + 阈值 + 判断标准 +
            <b>告警设置</b>。此处为现场补录入口，建完提交即人工新增、直接生效（不进入批量审核）。
            <br />
            新建默认<b>开启告警（重要级，通知设备岗）</b>；告警开关 / 等级 / 通知只改「巡检目标台账」里的
            「告警设置」——巡检点本身不配置告警。若原有业务目标不合适，请到「巡检目标台账」里就地调整。
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
