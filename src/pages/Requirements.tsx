/**
 * @file Requirements.tsx
 * @description 后台管理 › 算法模板：平台维护「看什么 / 怎么采 / 拿什么算 / 什么算异常」的唯一入口。
 *              由原「算法模板管理」+「巡检要求管理」两页合并而来（保留原文件名与路由 id，少动引用）。
 *              一条算法模板 = 编码 + 名称 + 说明 + 算法能力类型 + 默认采集方式 + 适用目标类型
 *                + 算法 + 判定方式（单位 / 期望状态）+ 状态。
 *              存储里仍保留 `deploy`（默认云端），但本页不做展示与维护（按产品要求本期不做部署位置）。
 * @interaction 路由 `requirements`（后台管理）；引擎动作 SAVE_REQUIREMENT；引用方「巡检目标台账」
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { usePageSize, useViewState } from "../data/navigation";
import { Pager } from "../components/Business";
import {
  Badge,
  Btn,
  Drawer,
  Field,
  Switch,
  Panel,
  Table,
} from "../components/UI";
import { fmtDateTime } from "../data/types";
import {
  DeleteConfirm,
  type DeleteConfirmState,
} from "../components/ListDelete";
import { FilterPanel } from "../components/FilterPanel";
import {
  ALGO_LIBRARY,
  captureKinds,
  requirementKinds,
  type CaptureKind,
  type JudgeType,
  type Requirement,
  type RequirementKind,
} from "../data/types";
import { Cascader, type CascaderOption } from "../components/Cascader";

/** 适用目标类型（TGT-01 口径）：仪表 / 环境 / 区域 */
const TARGET_KINDS: Requirement["targetKinds"] = ["仪表", "环境", "区域"];
/** 判定方式清单 */
const JUDGE_TYPES: JudgeType[] = ["数值范围", "期望状态", "有无目标", "等级评分"];
/**
 * 算法候选（平台算法库 ALGO_LIBRARY）：一级 = 适配的检测类型，二级 = 算法名（带部署位置）
 * @description 算法数据表里有十几个算法，平铺下拉太长，按能力类型分组后逐级选
 */
const ALGO_OPTIONS: CascaderOption[] = (() => {
  const byKind = new Map<string, CascaderOption[]>();
  ALGO_LIBRARY.filter((a) => a.state !== "停用").forEach((a) => {
    (a.adapt.length ? a.adapt : ["其他"]).forEach((k) => {
      const list = byKind.get(k) || [];
      list.push({ value: a.name, label: `${a.name}（${a.deploy}）` });
      byKind.set(k, list);
    });
  });
  return [...byKind].map(([kind, children]) => ({
    value: `k:${kind}`,
    label: kind,
    children,
  }));
})();
/** 库内算法名集合：判断当前值是否在库内（不在则补「库外」兜底叶子） */
const ALGO_NAMES = new Set(ALGO_LIBRARY.map((a) => a.name));

/**
 * 生成下一个模板编码（ALG-01 / ALG-02 …）
 * @description 编码是系统的唯一标识，由平台按现有最大值顺延分配，用户不可改
 */
const nextRequirementCode = (list: Requirement[]) => {
  const max = list.reduce((n, r) => {
    const m = /^ALG-(\d+)$/.exec(r.code || "");
    return m ? Math.max(n, Number(m[1])) : n;
  }, 0);
  return `ALG-${String(max + 1).padStart(2, "0")}`;
};

/**
 * 空表单（新增态）
 * @description id 留空，引擎保存时自动生成 REQ- 前缀 id；编码打开表单时由系统配额
 */
const emptyRequirement = (): Requirement => ({
  id: "",
  code: "",
  name: "",
  kind: "可见异常",
  description: "",
  targetKinds: ["仪表"],
  capture: "可见光",
  detectKind: "外观",
  algorithm: "",
  judge: "数值范围",
  unit: "",
  min: 0,
  max: 1,
  expected: "",
  deploy: "云端",
  state: "启用",
  needPhoto: true,
  needVideo: false,
  needReview: false,
  cycle: "每日",
});

export function Requirements() {
  const { s, act } = useStore();
  const requirements = s.requirements || [];
  const targets = s.businessTargets || [];
  const [req, SETREQ] = useState<Requirement | null>(null);
  /** 二次确认：列表启停与表单保存共用同一个确认弹窗 */
  const [confirm, setConfirm] = useState<DeleteConfirmState | null>(null);
  /** 表单字段级校验：key = 字段名，value = 原因 */
  const [formErr, setFormErr] = useState<Record<string, string>>({});
  /** 打开表单（顺带清掉上一次留下的红字） */
  const openForm = (next: Requirement) => {
    setFormErr({});
    SETREQ(next);
  };
  const [kw, KW] = useViewState("requirements.kw", "");
  const [kindF, KF] = useViewState("requirements.kind", "全部");
  const [stateF, SF] = useViewState("requirements.state", "全部");
  /** 筛选面板展开态：条件默认收起，点「筛选」才显示 */
  const [filterOpen, SETFILTEROPEN] = useState(false);
  /** 筛选草稿：点「查询」才写回生效值 */
  const [draft, SETDRAFT] = useState<Record<string, string>>({
    kw,
    kind: kindF,
    state: stateF,
  });
  const [pn, PN] = useViewState("requirements.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pageSize, SETPAGESIZE] = usePageSize("requirements.size");
  const keyword = kw.trim();
  const filtered = requirements.filter(
    (r) =>
      (kindF === "全部" || r.kind === kindF) &&
      (stateF === "全部" || r.state === stateF) &&
      (!keyword ||
        r.code.includes(keyword) ||
        r.name.includes(keyword) ||
        (r.algorithm || "").includes(keyword)),
  );
  // 分页切片：筛选后页数可能变少，当前页一律 clamp 到有效范围
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(Math.max(1, pn), pages);
  const pageRows = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  /**
   * 算法模板被引用的处数 = 巡检目标台账按 requirementId 引用
   * @description 引用数 = 改动影响面；被引用后只影响后续新台账，已落库的台账保留当时快照
   */
  const refCountOf = (id: string) =>
    targets.filter((t) => t.requirementId === id).length;
  /** 启用 / 停用：停用后不再出现在巡检目标台账的算法模板候选里 */
  const toggleState = (r: Requirement) =>
    act({
      type: "SAVE_REQUIREMENT",
      requirement: { ...r, state: r.state === "启用" ? "停用" : "启用" },
    });
  /**
   * 启停二次确认：列表状态列的唯一入口（与地图列表同款开关 + 确认弹窗）
   * @description 停用会从台账候选里消失，且可能已有台账引用，改之前把影响面说清楚
   */
  const askToggle = (r: Requirement) => {
    const off = r.state === "启用";
    const refs = refCountOf(r.id);
    setConfirm({
      title: off ? "停用算法模板" : "启用算法模板",
      okText: off ? "确认停用" : "确认启用",
      text: off ? (
        <>
          停用后「<b>{r.name}</b>」不再出现在巡检目标台账的算法模板候选里。
          {refs ? `已有 ${refs} 处台账引用它，这些台账照旧运行，不受影响。` : ""}
        </>
      ) : (
        <>
          启用后「<b>{r.name}</b>」重新出现在巡检目标台账的算法模板候选里。
        </>
      ),
      run: () => toggleState(r),
    });
  };
  /**
   * 算法候选：库内按能力类型分组；**仅在填了库外算法时**才补「库外 / 手填」叶子，
   * 避免新增表单（算法为空）一打开就显示「库外 / 手填 / （空）」这种假路径
   */
  /**
   * 保存前的前端校验（与引擎同口径）
   * @description 不通过就**不弹确认框**，把原因直接标在字段上；
   *              否则会出现「确认了却没保存」——引擎拦下来只弹一条 toast，用户看不到是哪项的问题
   */
  const validateForm = (r: Requirement) => {
    const err: Record<string, string> = {};
    if (!r.name.trim()) err.name = "请填写算法模板名称";
    if (!r.targetKinds.length) err.targetKinds = "请至少选择一个适用目标类型";
    if (!r.algorithm.trim()) err.algorithm = "请选择算法";
    if (r.judge === "数值范围") {
      if (!r.unit?.trim()) err.unit = "数值范围判定需填写单位";
      if (!Number.isFinite(r.min)) err.min = "请填写下限";
      if (!Number.isFinite(r.max)) err.max = "请填写上限";
      else if (Number.isFinite(r.min) && r.max <= r.min)
        err.max = "上限须大于下限";
    }
    if (r.judge === "期望状态" && !r.expected?.trim())
      err.expected = "请填写期望状态";
    return err;
  };
  const algoChoices: CascaderOption[] = !req?.algorithm || ALGO_NAMES.has(req.algorithm)
    ? ALGO_OPTIONS
    : [
        ...ALGO_OPTIONS,
        {
          value: "custom",
          label: "库外 / 手填",
          children: [
            { value: req?.algorithm || "", label: req?.algorithm || "（空）" },
          ],
        },
      ];

  return (
    <>
      <Panel
        title="算法模板"
        extra={
          <div className="actions">
            <Btn onClick={() => SETFILTEROPEN(!filterOpen)}>
              {filterOpen ? "收起筛选" : "筛选"}
            </Btn>
            <Btn
              primary
              disabled={s.roleId !== "admin"}
              // 编码由系统顺延分配，打开表单时就填好，用户不用管
              onClick={() =>
                openForm({
                  ...emptyRequirement(),
                  code: nextRequirementCode(requirements),
                })
              }
            >
              ＋ 新增算法模板
            </Btn>
          </div>
        }
      >
        {filterOpen && (
          <FilterPanel
            fields={[
              { key: "kw", label: "关键词", placeholder: "编码 / 名称 / 算法名" },
              {
                key: "kind",
                label: "算法能力类型",
                options: ["全部", ...requirementKinds],
              },
              { key: "state", label: "状态", options: ["全部", "启用", "停用"] },
            ]}
            value={draft}
            onChange={SETDRAFT}
            onSearch={() => {
              KW(draft.kw ?? "");
              KF(draft.kind ?? "全部");
              SF(draft.state ?? "全部");
              PN(1);
            }}
            onReset={() => {
              SETDRAFT({ kw: "", kind: "全部", state: "全部" });
              KW("");
              KF("全部");
              SF("全部");
              PN(1);
            }}
          />
        )}
        <Table
          heads={[
            "模板编码",
            "模板名称",
            "算法能力类型",
            "算法名称",
            "关联台账",
            "状态",
            "更新时间",
            "操作",
          ]}
          rows={pageRows.map((r) => [
            <span>{r.code}</span>,
            <b>{r.name}</b>,
            <Badge>{r.kind}</Badge>,
            <span>{r.algorithm}</span>,
            <Badge tone={refCountOf(r.id) ? "blue" : undefined}>
              {refCountOf(r.id)} 处
            </Badge>,
            // 状态 = 开关：一眼看出是否启用，点一下弹二次确认
            <Switch
              checked={r.state === "启用"}
              disabled={s.roleId !== "admin"}
              label={`${r.name} 启用状态`}
              onChange={() => askToggle(r)}
            />,
            <span className="muted">{fmtDateTime(r.updatedAt)}</span>,
            <div className="actions">
              <Btn
                disabled={s.roleId !== "admin"}
                onClick={() => openForm({ ...r })}
              >
                修改
              </Btn>
            </div>,
          ])}
        />
        <Pager
          page={cur}
          count={filtered.length}
          size={pageSize}
          onChange={PN}
          onSize={(n) => {
            SETPAGESIZE(n);
            PN(1);
          }}
        />
      </Panel>

      {req && (
        <Drawer
          title={req.id ? "修改算法模板" : "新增算法模板"}
          subtitle={req.code || undefined}
          onClose={() => SETREQ(null)}
          footer={
            <>
              <Btn onClick={() => SETREQ(null)}>取消</Btn>
              <Btn
                primary
                onClick={() => {
                  // 先本地校验：不通过就把原因标在字段上，不弹确认框
                  const err = validateForm(req);
                  setFormErr(err);
                  if (Object.keys(err).length) {
                    requestAnimationFrame(() => {
                      document
                        .querySelector(".drawer-body .field.has-err")
                        ?.scrollIntoView({ block: "center", behavior: "smooth" });
                    });
                    return;
                  }
                  const refs = req.id ? refCountOf(req.id) : 0;
                  setConfirm({
                    title: req.id ? "保存算法模板修改" : "新增算法模板",
                    okText: "确认保存",
                    text: req.id ? (
                      refs ? (
                        <>
                          「<b>{req.name}</b>」已被 {refs} 处巡检目标引用。
                          已建台账保留保存时的口径，本次改动只影响之后新建的台账。
                        </>
                      ) : (
                        <>
                          保存后「<b>{req.name || "未命名模板"}</b>」
                          的内容与判定口径立即生效。
                        </>
                      )
                    ) : (
                      <>
                        保存后「<b>{req.name || "未命名模板"}</b>」
                        会出现在巡检目标台账的算法模板候选里。
                      </>
                    ),
                    run: () => {
                      const ok = act({
                        type: "SAVE_REQUIREMENT",
                        requirement: req,
                      });
                      if (ok) SETREQ(null);
                      return ok;
                    },
                  });
                }}
              >
                保存算法模板
              </Btn>
            </>
          }
        >
          <h4>1、基础信息</h4>
          <div className="form-grid">
            {/* 编码是系统的唯一标识：由平台顺延分配，不允许用户改 */}
            <Field label="算法模板编码">
              <input value={req.code} disabled readOnly />
            </Field>
            <Field label="算法模板名称" required error={formErr.name}>
              <input
                value={req.name}
                placeholder="如 看区域气体浓度"
                onChange={(e) => SETREQ({ ...req, name: e.target.value })}
              />
            </Field>
          </div>
          <Field label="模板说明">
            <input
              value={req.description || ""}
              placeholder="适用场景 / 原理 / 注意事项，如 沿参照物锚点泵吸采样，读取区域可燃气体浓度"
              onChange={(e) => SETREQ({ ...req, description: e.target.value })}
            />
          </Field>

          <h4>2、能力与适配边界</h4>
          <div className="form-grid">
            <Field label="算法能力类型" required>
              <select
                value={req.kind}
                onChange={(e) =>
                  SETREQ({ ...req, kind: e.target.value as RequirementKind })
                }
              >
                {requirementKinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            <Field label="默认采集方式" required>
              <select
                value={req.capture}
                onChange={(e) =>
                  SETREQ({ ...req, capture: e.target.value as CaptureKind })
                }
              >
                {captureKinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            label="适用目标类型（可多选）"
            required
            error={formErr.targetKinds}
          >
            <div className="check-row">
              {TARGET_KINDS.map((k) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    checked={req.targetKinds.includes(k)}
                    onChange={(e) =>
                      SETREQ({
                        ...req,
                        targetKinds: e.target.checked
                          ? [...req.targetKinds, k]
                          : req.targetKinds.filter((x) => x !== k),
                      })
                    }
                  />
                  {k}
                </label>
              ))}
            </div>
          </Field>

          <h4>3、算法调用与判定逻辑</h4>
          <Field label="算法" required error={formErr.algorithm}>
            {/* 候选来自平台算法库：按算法能力类型分组，逐级选到具体算法 */}
            <Cascader
              options={algoChoices}
              value={req.algorithm}
              onChange={(v) => SETREQ({ ...req, algorithm: v })}
              placeholder="请选择算法"
            />
          </Field>
          <Field label="判定方式" required>
            <select
              value={req.judge}
              onChange={(e) =>
                SETREQ({ ...req, judge: e.target.value as JudgeType })
              }
            >
              {JUDGE_TYPES.map((j) => (
                <option key={j}>{j}</option>
              ))}
            </select>
          </Field>
          {/* 判定方式决定下半部分口径：数值范围需单位 + 上下限；期望状态需期望状态 */}
          {req.judge === "数值范围" && (
            <div className="form-grid">
              <Field label="单位" required error={formErr.unit}>
                <input
                  value={req.unit || ""}
                  placeholder="如 MPa / ℃ / ppm"
                  onChange={(e) => SETREQ({ ...req, unit: e.target.value })}
                />
              </Field>
              <Field label="下限（含）" required error={formErr.min}>
                <input
                  type="number"
                  value={Number.isFinite(req.min) ? req.min : ""}
                  placeholder="如 0"
                  onChange={(e) =>
                    SETREQ({
                      ...req,
                      min: e.target.value === "" ? NaN : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="上限（含）" required error={formErr.max}>
                <input
                  type="number"
                  value={Number.isFinite(req.max) ? req.max : ""}
                  placeholder="如 1"
                  onChange={(e) =>
                    SETREQ({
                      ...req,
                      max: e.target.value === "" ? NaN : Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
          )}
          {req.judge === "期望状态" && (
            <Field label="期望状态" required error={formErr.expected}>
              <input
                value={req.expected || ""}
                placeholder="如 开启 / 无异常"
                onChange={(e) => SETREQ({ ...req, expected: e.target.value })}
              />
            </Field>
          )}

          <h4>4、状态</h4>
          <div className="form-grid">
            <Field label="状态">
              <div className="switch-row">
                <Switch
                  checked={req.state === "启用"}
                  label="启用状态"
                  onChange={(next) =>
                    SETREQ({ ...req, state: next ? "启用" : "停用" })
                  }
                />
                {req.state}
              </div>
            </Field>
          </div>
        </Drawer>
      )}

      {/* 列表启停 / 表单保存的二次确认（同一个弹窗，按钮文案随动作变） */}
      <DeleteConfirm state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
