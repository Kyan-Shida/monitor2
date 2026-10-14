/**
 * @file InspectItemEdit.tsx
 * @description 添加 / 编辑巡检项（内置页）：由「添加 / 编辑巡检点」页的「＋ 添加巡检项」或行内「编辑」进入。
 *   编辑界面直接复用 `components/InspectItemDrawer` 的 **inline** 形态（原弹窗装不下，改为整页），
 *   草稿经 sessionStorage 与巡检点编辑页共享，保存后回到巡检点编辑页继续。
 * @interaction pages/PointEdit.tsx（草稿键 pointDraftKey）、components/InspectItemDrawer.tsx
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { InspectItemDrawer } from "../components/InspectItemDrawer";
import { Btn, Note } from "../components/UI";
import { businessTargetLabelOf } from "../data/businessTargetCrumb";
import { pointDraftKey } from "../data/pointEditDraft";
import type { InspectSpec } from "../data/types";

/**
 * 巡检项编辑内置页
 * @param id 所属巡检点 id；"new" / 缺省 = 正在新建的巡检点
 */
export function InspectItemEdit({ id }: { id?: string } = {}) {
  const { s } = useStore();
  /** 巡检点 id（"new" = 新建中的巡检点）：决定与巡检点编辑页共享哪一份会话草稿 */
  const pointId = id || "new";
  const key = pointDraftKey(pointId);
  const [draft, DRAFT] = useViewState<InspectSpec | null>(`${key}.draft`, null);
  const [, ITEMS] = useViewState<InspectSpec[]>(`${key}.items`, []);
  const [err, ERR] = useState("");
  const bts = s.businessTargets || [];

  const upd = (patch: Partial<InspectSpec>) =>
    DRAFT((d) => (d ? { ...d, ...patch } : d));

  /** 保存本项：编辑态覆盖、新增态追加，然后回巡检点编辑页 */
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
    go("point-edit", pointId);
  }
  /** 取消本项：丢弃草稿并回巡检点编辑页 */
  function cancel() {
    DRAFT(null);
    ERR("");
    go("point-edit", pointId);
  }

  // 草稿缺失（直接深链进来）：给出回到巡检点编辑页的出口，不做静默空白
  if (!draft)
    return (
      <div className="inner-page">
        <div className="context-bar">
          <b>添加巡检项</b>
          <div className="actions">
            <Btn onClick={() => go("point-edit", pointId)}>返回巡检点</Btn>
          </div>
        </div>
        <Note>
          未找到巡检项草稿：请返回「添加 / 编辑巡检点」，通过「＋
          添加巡检项」或行内「编辑」进入。
        </Note>
      </div>
    );

  return (
    <div className="inner-page">
      {/* 页面顶栏：标题 + 保存本项都在这里（原来动作条压在内容区底部，够不着） */}
      <div className="context-bar">
        <b>
          {draft.id
            ? `编辑巡检项 · ${draft.name.trim() || "未命名"}`
            : "添加巡检项"}
        </b>
        <div className="actions">
          <Btn onClick={cancel}>取消</Btn>
          <Btn primary onClick={saveItem}>
            保存本项
          </Btn>
        </div>
      </div>
      {err && (
        <p role="alert" className="reference-upload-error">
          {err}
        </p>
      )}
      <InspectItemDrawer
        bare
        draft={draft}
        onChange={upd}
        onSave={saveItem}
        onCancel={cancel}
        businessTargets={bts}
        labelOfBt={(bid) => businessTargetLabelOf(s, bid)}
        onOpenBt={() =>
          // 去台账编辑内置页补录，保存后原路返回本页（草稿仍在会话里）
          go("business-target-edit", "new", undefined, {
            page: "inspect-item-edit",
            id: pointId,
          })
        }
      />
    </div>
  );
}
