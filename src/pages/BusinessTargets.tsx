/**
 * @file BusinessTargets.tsx
 * @description 巡检目标台账 = **仪表 + 巡检要求 + 算法 + 阈值 + 判断标准**。
 *              核心前提：「仪表本身只是资产，不能直接巡检」——必须叠加巡检要求才可执行。
 *              列表 + 新增/编辑抽屉（两步：① 选检测目标（区域 → 设备 → 仪表）② 配业务逻辑与算法）。
 * @interaction 菜单「资源与地图 › 点位与对象 › 巡检目标台账」（`points` 槽位）；
 *              「巡检点管理 › 添加巡检点」的巡检项从这里选（也可就地快速新建）；
 *              引擎 action：ADD_BUSINESS_TARGET / UPDATE_BUSINESS_TARGET
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { useViewState } from "../data/navigation";
import { Badge, Btn, Empty, Field, Modal, Note, Panel, Steps, Table } from "../components/UI";
import { Pager } from "../components/Business";
import { defaultRangeOfUnit } from "../data/alarmRules";
import { defaultRequirementOfInstrument } from "../data/deviceMaster";
import type { BusinessTarget, Instrument, JudgeType } from "../data/types";

/** 判定方式（与 JudgeType 对齐） */
const JUDGES: JudgeType[] = ["数值范围", "期望状态", "有无目标", "等级评分"];
/** 巡检频次选项 */
const CYCLES = ["每班", "每日", "每周", "每月"];
/** 告警等级（决定告警分级与工单 SLA） */
const ALARM_LEVELS = ["一般", "重要", "紧急"];
/** 告警通知对象（岗位字典） */
const NOTIFY_ROLES = ["设备岗", "巡检调度岗", "结果复核岗", "值班长"];
/** 告警触发条件默认说明（一期只支持单次判定） */
const ALARM_TRIGGER = "单次超限即告警（一期不支持连续多次）";
/** 列表每页条数 */
const PAGE_SIZE = 10;

/** 判断标准一句话（列表与抽屉共用同一表达） */
function judgeText(b: {
  judge: JudgeType;
  min?: number;
  max?: number;
  unit?: string;
  expected?: string;
}) {
  if (b.judge === "数值范围") return `${b.min ?? "—"}–${b.max ?? "—"} ${b.unit || ""}`.trim();
  if (b.judge === "期望状态") return `期望 ${b.expected || "—"}`;
  if (b.judge === "有无目标") return "无 → 正常；有 → 异常";
  return "按等级评分，低分需复核";
}

export function BusinessTargets() {
  const { s, act } = useStore();
  const [kw, KW] = useViewState("bt.q", ""),
    [areaF, AF] = useViewState("bt.area", "全部"),
    [devF, DF] = useViewState("bt.device", "全部"),
    [inspectF, IF] = useViewState("bt.inspect", "全部"),
    [pager, PG] = useViewState("bt.page", 1);
  const [open, OPEN] = useState(false);
  const [step, STEP] = useState(0);
  /** 编辑中的巡检目标台账 id；空串表示新增 */
  const [editId, EDIT] = useState("");
  /** 抽屉第一步选中的仪表 id */
  const [pick, PICK] = useState("");
  const [form, FORM] = useState({
    goal: "",
    require: "",
    requirementId: "",
    algorithm: "",
    judge: "数值范围" as JudgeType,
    unit: "",
    min: 0,
    max: 1,
    expected: "",
    criteria: "",
    /** 告警设置（平台唯一入口；巡检点不配置告警） */
    alarmOn: true,
    alarmLevel: "重要",
    alarmTrigger: ALARM_TRIGGER,
    alarmNotify: ["设备岗"] as string[],
    needPhoto: true,
    needVideo: false,
    needReview: false,
    cycle: "每日",
    priority: "普通" as BusinessTarget["priority"],
    inspect: true,
  });

  const targets = s.businessTargets || [];
  const instruments = s.instruments || [];
  const requirements = s.requirements || [];
  const instrumentOf = (id: string) => instruments.find((x) => x.id === id);
  const deviceOf = (instrumentId: string) =>
    s.devices?.find((d) => d.id === instrumentOf(instrumentId)?.deviceId);
  /** 区域 › 设备 › 仪表：把检测目标回溯到工厂树上的归属 */
  const crumb = (instrumentId: string) => {
    const ins = instrumentOf(instrumentId);
    const dev = deviceOf(instrumentId);
    return {
      area: dev?.region || "—",
      device: dev?.name || "—",
      instrument: ins?.name || "—",
      ins,
      dev,
    };
  };
  const targetCountOf = (instrumentId: string) =>
    targets.filter((b) => b.instrumentId === instrumentId).length;

  /** 切换巡检要求：把模板默认的算法 / 判定 / 阈值 / 采集要求填进表单 */
  function applyRequirement(rid: string, ins?: Instrument) {
    const req = requirements.find((r) => r.id === rid);
    const range =
      req?.judge === "数值范围"
        ? defaultRangeOfUnit(req.unit || ins?.unit) || { min: 0, max: 1 }
        : undefined;
    FORM((old) => ({
      ...old,
      requirementId: rid,
      // 业务要求默认取巡检要求的说明（可改写）
      require: req?.description || old.require,
      algorithm: req?.algorithm || "",
      judge: req?.judge || "数值范围",
      unit: req?.unit || ins?.unit || "",
      min: range?.min ?? 0,
      max: range?.max ?? 1,
      expected: req?.expected || "",
      criteria: req?.description || "",
      needPhoto: req?.needPhoto ?? true,
      needVideo: req?.needVideo ?? false,
      needReview: req?.needReview ?? false,
      cycle: req?.cycle || "每日",
    }));
  }
  /** 打开新增抽屉：默认选中该仪表的"默认巡检要求"（采集方式 + 单位决定看什么） */
  function openAdd() {
    EDIT("");
    PICK("");
    STEP(0);
    FORM({
      goal: "",
      require: "",
      requirementId: "",
      algorithm: "",
      judge: "数值范围",
      unit: "",
      min: 0,
      max: 1,
      expected: "",
      criteria: "",
      alarmOn: true,
      alarmLevel: "重要",
      alarmTrigger: ALARM_TRIGGER,
      alarmNotify: ["设备岗"],
      needPhoto: true,
      needVideo: false,
      needReview: false,
      cycle: "每日",
      priority: "普通",
      inspect: true,
    });
    const first = instruments[0];
    if (first) applyRequirement(defaultRequirementOfInstrument(first), first);
    OPEN(true);
  }
  /** 打开编辑抽屉：直接进第二步，仪表只读 */
  function openEdit(b: BusinessTarget) {
    EDIT(b.id);
    PICK(b.instrumentId);
    FORM({
      goal: b.goal || "",
      require: b.require || "",
      requirementId: b.requirementId,
      algorithm: b.algorithm,
      judge: b.judge,
      unit: b.unit || "",
      min: b.min ?? 0,
      max: b.max ?? 1,
      expected: b.expected || "",
      criteria: b.criteria || "",
      alarmOn: b.alarm?.on ?? true,
      alarmLevel: b.alarm?.level || "重要",
      alarmTrigger: b.alarm?.trigger || ALARM_TRIGGER,
      alarmNotify: b.alarm?.notify || ["设备岗"],
      needPhoto: b.needPhoto,
      needVideo: b.needVideo,
      needReview: b.needReview,
      cycle: b.cycle,
      priority: b.priority,
      inspect: b.inspect,
    });
    STEP(1);
    OPEN(true);
  }
  /** 保存：新增走 ADD，编辑走 UPDATE */
  function save() {
    const payload = {
      goal: form.goal,
      require: form.require,
      requirementId: form.requirementId,
      algorithm: form.algorithm,
      judge: form.judge,
      unit: form.unit,
      min: Number(form.min),
      max: Number(form.max),
      expected: form.expected,
      criteria: form.criteria,
      // 告警设置（平台唯一入口）
      alarm: {
        on: form.alarmOn,
        level: form.alarmLevel as "一般" | "重要" | "紧急",
        trigger: form.alarmTrigger,
        notify: form.alarmNotify,
      },
      needPhoto: form.needPhoto,
      needVideo: form.needVideo,
      needReview: form.needReview,
      cycle: form.cycle,
      priority: form.priority,
      inspect: form.inspect,
    };
    const ok = editId
      ? act({ type: "UPDATE_BUSINESS_TARGET", id: editId, ...payload })
      : act({ type: "ADD_BUSINESS_TARGET", instrumentId: pick, ...payload });
    if (ok) OPEN(false);
  }

  const areas = ["全部", ...new Set((s.devices || []).map((d) => d.region || "—"))];
  const devices = [
    "全部",
    ...new Set(
      (s.devices || [])
        .filter((d) => areaF === "全部" || (d.region || "—") === areaF)
        .map((d) => d.name),
    ),
  ];
  const keyword = kw.trim();
  const list = targets.filter((b) => {
    const c = crumb(b.instrumentId);
    const req = requirements.find((r) => r.id === b.requirementId);
    if (areaF !== "全部" && c.area !== areaF) return false;
    if (devF !== "全部" && c.device !== devF) return false;
    if (inspectF !== "全部" && (b.inspect ? "参与巡检" : "已关闭") !== inspectF)
      return false;
    return (
      !keyword ||
      (b.id + b.algorithm + (req?.name || "") + c.area + c.device + c.instrument).includes(
        keyword,
      )
    );
  });
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(pager || 1, pages);
  const rows = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  /** 抽屉第一步的候选检测目标（= 仪表），支持区域 / 设备 / 关键词筛选 */
  const pickList = instruments.filter((x) => {
    const dev = s.devices?.find((d) => d.id === x.deviceId);
    if (areaF !== "全部" && (dev?.region || "—") !== areaF) return false;
    if (devF !== "全部" && dev?.name !== devF) return false;
    return !keyword || (x.name + (dev?.name || "") + (dev?.region || "")).includes(keyword);
  });
  const picked = instrumentOf(pick);

  return (
    <>
      <div className="metric-strip">
        <div>
          <span>巡检目标台账</span>
          <strong>{targets.length}</strong>
        </div>
        <div>
          <span>参与巡检</span>
          <strong>{targets.filter((b) => b.inspect).length}</strong>
        </div>
        <div>
          <span>已配算法</span>
          <strong>{new Set(targets.map((b) => b.algorithm)).size}</strong>
        </div>
        <div>
          <span>需人工复核</span>
          <strong>{targets.filter((b) => b.needReview).length}</strong>
        </div>
      </div>
      <div className="toolbar">
        <div className="actions">
          <label className="inline-filter">
            <span>区域：</span>
            <select value={areaF} onChange={(e) => AF(e.target.value)}>
              {areas.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="inline-filter">
            <span>设备：</span>
            <select value={devF} onChange={(e) => DF(e.target.value)}>
              {devices.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="inline-filter">
            <span>是否巡检：</span>
            <select value={inspectF} onChange={(e) => IF(e.target.value)}>
              {["全部", "参与巡检", "已关闭"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <input
            placeholder="搜索目标 / 仪表 / 设备 / 算法"
            value={kw}
            onChange={(e) => KW(e.target.value)}
          />
        </div>
        <Btn primary onClick={openAdd}>
          ＋ 添加巡检目标台账
        </Btn>
      </div>
      <Panel
        title="巡检目标台账列表"
        extra={<span>{list.length} 条</span>}
      >
        <p className="muted">
          仪表本身只是资产、<b>不能直接巡检</b>；叠加巡检要求（看什么）+ 算法（AI
          表达方式）+ 阈值 + 判断标准后，才是可执行的巡检目标台账。
        </p>
        <Table
          heads={[
            "仪表（区域 › 设备 › 仪表）",
            "巡检要求 / 算法",
            "判断标准",
            "采集与复核",
            "频次 / 优先级",
            "是否巡检",
            "操作",
          ]}
          rows={rows.map((b) => {
            const c = crumb(b.instrumentId);
            const req = requirements.find((r) => r.id === b.requirementId);
            return [
              <>
                <b>{c.instrument}</b>
                <small>
                  {c.area} › {c.device} · {b.id}
                </small>
              </>,
              <>
                {req?.name || b.requirementId}
                <small>
                  {req?.kind} · {b.algorithm}
                </small>
              </>,
              <>
                {judgeText(b)}
                <small>{b.criteria}</small>
              </>,
              <>
                {[
                  b.needPhoto ? "拍照" : "",
                  b.needVideo ? "录像" : "",
                  b.needReview ? "人工复核" : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "仅自动判定"}
                <small>
                  告警：{b.alarm?.on === false ? "关闭（只记录结果）" : (b.alarm?.level || "重要")}
                  {b.alarm?.notify?.length ? ` · 通知 ${b.alarm.notify.join("、")}` : ""}
                </small>
              </>,
              <>
                {b.cycle}
                <small>
                  <Badge>{b.priority}</Badge>
                </small>
              </>,
              <label className="inline-filter">
                <input
                  type="checkbox"
                  checked={b.inspect}
                  onChange={(e) =>
                    act({
                      type: "UPDATE_BUSINESS_TARGET",
                      id: b.id,
                      inspect: e.target.checked,
                    })
                  }
                />
                <span>{b.inspect ? "参与" : "已关闭"}</span>
              </label>,
              <Btn onClick={() => openEdit(b)}>编辑</Btn>,
            ];
          })}
        />
        {!rows.length && <Empty>没有符合条件的巡检目标台账，点「＋ 添加巡检目标台账」新建。</Empty>}
        <Pager page={cur} count={list.length} size={PAGE_SIZE} onChange={PG} />
      </Panel>

      {open && (
        <Modal
          title={editId ? "编辑巡检目标台账" : "添加巡检目标台账"}
          drawer
          drawerWidth={920}
          onClose={() => OPEN(false)}
          footer={
            <>
              <Btn onClick={() => OPEN(false)}>取消</Btn>
              {step === 1 && (
                <Btn disabled={!!editId} onClick={() => STEP(0)}>
                  上一步：换检测目标
                </Btn>
              )}
              {step === 0 ? (
                <Btn primary disabled={!pick} onClick={() => STEP(1)}>
                  下一步：配业务逻辑
                </Btn>
              ) : (
                <Btn
                  primary
                  disabled={!form.requirementId || !form.algorithm.trim()}
                  onClick={save}
                >
                  {editId ? "保存修改" : "创建巡检目标台账"}
                </Btn>
              )}
            </>
          }
        >
          <Steps
            items={["选检测目标", "配业务逻辑与算法"]}
            current={step}
          />
          {step === 0 ? (
            <>
              <Note>
                从<b>设备主数据</b>的检测目标里选一台仪表。选中即确定它在工厂树上的归属：
                区域 → 设备 → 仪表。
              </Note>
              <div className="actions toolbar-inline">
                <label className="inline-filter">
                  <span>区域：</span>
                  <select value={areaF} onChange={(e) => AF(e.target.value)}>
                    {areas.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label className="inline-filter">
                  <span>设备：</span>
                  <select value={devF} onChange={(e) => DF(e.target.value)}>
                    {devices.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <input
                  placeholder="搜索仪表 / 设备"
                  value={kw}
                  onChange={(e) => KW(e.target.value)}
                />
              </div>
              <Table
                heads={["选择", "区域", "设备", "仪表", "采集方式 / 单位", "已有目标"]}
                rows={pickList.map((x) => {
                  const dev = s.devices?.find((d) => d.id === x.deviceId);
                  return [
                    <input
                      type="radio"
                      name="instrument"
                      aria-label={`选择 ${x.name}`}
                      checked={pick === x.id}
                      onChange={() => {
                        PICK(x.id);
                        applyRequirement(defaultRequirementOfInstrument(x), x);
                      }}
                    />,
                    dev?.region || "—",
                    dev?.name || "—",
                    <b>{x.name}</b>,
                    <>
                      {x.capture}
                      <small>{x.unit || "无量纲"}</small>
                    </>,
                    targetCountOf(x.id) ? `${targetCountOf(x.id)} 条` : "—",
                  ];
                })}
              />
              {!pickList.length && <Empty>没有匹配的仪表，请调整筛选条件。</Empty>}
            </>
          ) : (
            <>
              <Note>
                已选仪表：
                <b>
                  {crumb(pick).area} › {crumb(pick).device} › {crumb(pick).instrument}
                </b>
                {!editId && "（如需更换，点底部「上一步」）"}
              </Note>
              <Field label="业务目标（这条目标要达成什么）">
                <input
                  value={form.goal}
                  placeholder="例如 确认出口压力表读数在正常范围内（留空按仪表与判定方式自动生成）"
                  onChange={(e) => FORM({ ...form, goal: e.target.value })}
                />
              </Field>
              <Field label="业务要求（对采集与判定的具体要求）">
                <textarea
                  rows={2}
                  value={form.require}
                  placeholder="例如 每班读取一次表盘数值，遮挡时补拍后再判"
                  onChange={(e) => FORM({ ...form, require: e.target.value })}
                />
              </Field>
              <Field label="巡检要求（决定看什么）">
                <select
                  value={form.requirementId}
                  onChange={(e) => applyRequirement(e.target.value, picked)}
                >
                  {requirements.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}（{r.kind}）
                    </option>
                  ))}
                </select>
              </Field>
              <p className="muted">
                {requirements.find((r) => r.id === form.requirementId)?.description}
              </p>
              <Field label="算法 / AI 表达方式">
                <input
                  value={form.algorithm}
                  placeholder="例如 表计读数识别 v1.2"
                  onChange={(e) => FORM({ ...form, algorithm: e.target.value })}
                />
              </Field>
              <Field label="判定方式">
                <select
                  value={form.judge}
                  onChange={(e) =>
                    FORM({ ...form, judge: e.target.value as JudgeType })
                  }
                >
                  {JUDGES.map((j) => (
                    <option key={j}>{j}</option>
                  ))}
                </select>
              </Field>
              {form.judge === "数值范围" && (
                <Field label="阈值（判断标准）">
                  <div className="actions">
                    <input
                      type="number"
                      step="0.01"
                      aria-label="下限"
                      value={form.min}
                      onChange={(e) => FORM({ ...form, min: Number(e.target.value) })}
                    />
                    <span>–</span>
                    <input
                      type="number"
                      step="0.01"
                      aria-label="上限"
                      value={form.max}
                      onChange={(e) => FORM({ ...form, max: Number(e.target.value) })}
                    />
                    <input
                      aria-label="单位"
                      placeholder="单位"
                      value={form.unit}
                      onChange={(e) => FORM({ ...form, unit: e.target.value })}
                    />
                  </div>
                </Field>
              )}
              {form.judge === "期望状态" && (
                <Field label="期望状态">
                  <input
                    value={form.expected}
                    placeholder="例如 开启"
                    onChange={(e) => FORM({ ...form, expected: e.target.value })}
                  />
                </Field>
              )}
              <Field label="判断标准补充说明">
                <textarea
                  rows={2}
                  value={form.criteria}
                  placeholder="例如 以罐体上半部最高温为准"
                  onChange={(e) => FORM({ ...form, criteria: e.target.value })}
                />
              </Field>
              <div className="alarm-setting">
                <div className="split">
                  <h4>告警设置</h4>
                  <Badge>平台唯一入口</Badge>
                </div>
                <p className="muted">
                  巡检点不配置告警：判定阈值就是上面的<b>上下限 / 期望状态</b>，
                  告警开关、等级与通知只在这里设置，点位按此生效。
                </p>
                <div className="actions">
                  <label className="inline-filter">
                    <input
                      type="checkbox"
                      checked={form.alarmOn}
                      onChange={(e) =>
                        FORM({ ...form, alarmOn: e.target.checked })
                      }
                    />
                    <span>超限时产生告警</span>
                  </label>
                  <label className="inline-filter">
                    <span>告警等级：</span>
                    <select
                      value={form.alarmLevel}
                      onChange={(e) =>
                        FORM({ ...form, alarmLevel: e.target.value })
                      }
                    >
                      {ALARM_LEVELS.map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <Field label="触发条件说明">
                  <input
                    value={form.alarmTrigger}
                    placeholder="例如 单次超限即告警"
                    onChange={(e) =>
                      FORM({ ...form, alarmTrigger: e.target.value })
                    }
                  />
                </Field>
                <Field label="通知对象">
                  <div className="actions">
                    {NOTIFY_ROLES.map((r) => (
                      <label key={r} className="inline-filter">
                        <input
                          type="checkbox"
                          checked={form.alarmNotify.includes(r)}
                          onChange={(e) =>
                            FORM({
                              ...form,
                              alarmNotify: e.target.checked
                                ? [...form.alarmNotify, r]
                                : form.alarmNotify.filter((x) => x !== r),
                            })
                          }
                        />
                        <span>{r}</span>
                      </label>
                    ))}
                  </div>
                </Field>
              </div>
              <Field label="采集与复核要求">
                <div className="actions">
                  {(
                    [
                      ["needPhoto", "需要拍照"],
                      ["needVideo", "需要录像"],
                      ["needReview", "需要人工复核"],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="inline-filter">
                      <input
                        type="checkbox"
                        checked={form[k]}
                        onChange={(e) => FORM({ ...form, [k]: e.target.checked })}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="巡检频次 / 优先级">
                <div className="actions">
                  <select
                    value={form.cycle}
                    onChange={(e) => FORM({ ...form, cycle: e.target.value })}
                  >
                    {CYCLES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <select
                    value={form.priority}
                    onChange={(e) =>
                      FORM({
                        ...form,
                        priority: e.target.value as BusinessTarget["priority"],
                      })
                    }
                  >
                    {["普通", "高", "紧急"].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                  <label className="inline-filter">
                    <input
                      type="checkbox"
                      checked={form.inspect}
                      onChange={(e) => FORM({ ...form, inspect: e.target.checked })}
                    />
                    <span>参与巡检</span>
                  </label>
                </div>
              </Field>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
