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
import { Badge, Btn, Field, Modal, Note, Panel, Table } from "../components/UI";
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
 * 空表单（新增态）
 * @description id 留空，引擎保存时自动生成 REQ- 前缀 id；编码由用户填写（保存时校验唯一）
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
  const [pn, PN] = useViewState("requirements.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pageSize, SETPAGESIZE] = usePageSize("requirements.size");
  // 分页切片：当前页一律 clamp 到有效范围
  const pages = Math.max(1, Math.ceil(requirements.length / pageSize));
  const cur = Math.min(Math.max(1, pn), pages);
  const pageRows = requirements.slice((cur - 1) * pageSize, cur * pageSize);
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
   * 算法候选：库内按能力类型分组；**仅在填了库外算法时**才补「库外 / 手填」叶子，
   * 避免新增表单（算法为空）一打开就显示「库外 / 手填 / （空）」这种假路径
   */
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
      <Note>
        这里是平台维护<strong>算法模板</strong>的唯一入口（原「算法模板管理」与「巡检要求管理」已合并到本页）：
        一条模板包含<strong>编码、名称、说明、算法能力类型、默认采集方式、算法、判定方式（单位 / 阈值）</strong>。
        巡检目标台账只需选一条算法模板，判定口径与算法随模板带出。
        已落库的台账保留保存时的口径快照，不会被改写。
      </Note>
      <Panel
        title="算法模板 · 看什么 + 拿什么算 + 怎么判"
        extra={
          <Btn
            primary
            disabled={s.roleId !== "admin"}
            onClick={() => SETREQ(emptyRequirement())}
          >
            ＋ 新增算法模板
          </Btn>
        }
      >
        <Table
          heads={[
            "模板编码",
            "模板名称",
            "算法能力类型",
            "算法名称",
            "关联台账",
            "状态",
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
            <Badge tone={r.state === "启用" ? "blue" : "amber"}>{r.state}</Badge>,
            <div className="actions">
              <Btn
                disabled={s.roleId !== "admin"}
                onClick={() => SETREQ({ ...r })}
              >
                修改
              </Btn>
              <Btn disabled={s.roleId !== "admin"} onClick={() => toggleState(r)}>
                {r.state === "启用" ? "停用" : "启用"}
              </Btn>
            </div>,
          ])}
        />
        <Pager
          page={cur}
          count={requirements.length}
          size={pageSize}
          onChange={PN}
          onSize={(n) => {
            SETPAGESIZE(n);
            PN(1);
          }}
        />
        <p className="muted">
          关联台账 = 当前有多少巡检目标台账引用了本模板；停用后新台账不再可选，已有台账照旧运行。
        </p>
      </Panel>

      {req && (
        <Modal
          title={req.id ? "修改算法模板" : "新增算法模板"}
          wide
          onClose={() => SETREQ(null)}
          footer={
            <>
              <Btn onClick={() => SETREQ(null)}>取消</Btn>
              <Btn
                primary
                onClick={() => {
                  if (act({ type: "SAVE_REQUIREMENT", requirement: req }))
                    SETREQ(null);
                }}
              >
                保存算法模板
              </Btn>
            </>
          }
        >
          <h4>1、基础信息</h4>
          <div className="form-grid">
            <Field label="算法模板编码" required>
              <input
                value={req.code}
                placeholder="如 ALG-11"
                onChange={(e) => SETREQ({ ...req, code: e.target.value })}
              />
            </Field>
            <Field label="算法模板名称" required>
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
          <Field label="适用目标类型（可多选）" required>
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
          <Field label="算法" required>
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
              <Field label="单位">
                <input
                  value={req.unit || ""}
                  placeholder="如 MPa / ℃ / ppm"
                  onChange={(e) => SETREQ({ ...req, unit: e.target.value })}
                />
              </Field>
            </div>
          )}
          {req.judge === "期望状态" && (
            <Field label="期望状态">
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
              <select
                value={req.state}
                onChange={(e) =>
                  SETREQ({ ...req, state: e.target.value as "启用" | "停用" })
                }
              >
                <option>启用</option>
                <option>停用</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
