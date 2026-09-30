/**
 * @file MapWorkbench.tsx
 * @description 地图工作台（地图管理内嵌抽屉）：用于管理单张地图的「巡航点」。
 *              支持在底图上点击新增、在清单中编辑坐标/类型/定位号（人工新增点）、
 *              删除人工新增点，以及保存后自动将地图置为草稿。
 *              轨迹相关功能本期不涉及。
 * @interaction Maps.tsx → 地图详情 →「地图工作台」抽屉
 */
import { useState } from "react";
import { useStore } from "../data/store";
import type { Candidate } from "../data/types";
import { Badge, Btn, Empty, Note, Panel, Table } from "./UI";
import { MapBaseUpload } from "./MapBaseUpload";
import { MapImageCanvas } from "./MapImageCanvas";

/** 巡航点可选类型 */
const CRUISE_KINDS = ["可见光", "红外", "气体", "声音", "仪表", "阀门"];

const newId = () =>
  "O" + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5).toUpperCase();

export function MapWorkbench({ mapId }: { mapId: string }) {
  const { s, act } = useStore();
  const m = s.maps.find((x) => x.id === mapId);
  /** 当前正在编辑的巡航点 ID（行内编辑） */
  const [editingId, EDIT] = useState<string>("");
  /** 编辑表单缓冲 */
  const [form, FORM] = useState<Partial<Candidate>>({});
  /** 本地草稿：复制当前地图的巡航点集合 */
  const [draft, SETDRAFT] = useState<Candidate[]>(() =>
    m ? structuredClone(m.targets) : [],
  );
  /** 地图上选中的标记 ID */
  const [selected, SELECT] = useState<string>("");
  /** 新增点位的默认类型 */
  const [newKind, KIND] = useState("仪表");
  if (!m) return <Note>地图不存在。</Note>;

  /** 是否有未保存的本地修改（含行内编辑） */
  const dirty =
    editingId !== "" || JSON.stringify(draft) !== JSON.stringify(m.targets);

  const startEdit = (t: Candidate) => {
    EDIT(t.id);
    FORM({
      externalId: t.externalId || "",
      kind: t.kind,
      x: t.x,
      y: t.y,
    });
  };

  const applyForm = (id: string, draftList: Candidate[]): Candidate[] =>
    draftList.map((t) => {
      if (t.id !== id) return t;
      const x = Number(form.x);
      const y = Number(form.y);
      return {
        ...t,
        externalId:
          t.source === "平台新增"
            ? String(form.externalId || "").trim() || t.id
            : t.externalId,
        kind: String(form.kind || t.kind),
        x: Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : t.x,
        y: Number.isFinite(y) ? Math.max(0, Math.min(100, y)) : t.y,
      };
    });

  const saveRow = (id: string) => {
    SETDRAFT((prev) => applyForm(id, prev));
    EDIT("");
    FORM({});
  };

  const remove = (id: string) => {
    const t = draft.find((x) => x.id === id);
    if (!t || t.source === "地图导入") return;
    if (t.pointId) {
      alert("该巡航点已关联业务点位，请先解绑或删除业务点位后再删除。");
      return;
    }
    SETDRAFT((prev) => prev.filter((x) => x.id !== id));
    if (selected === id) SELECT("");
  };

  const addAt = (x: number, y: number) => {
    const id = newId();
    SETDRAFT((prev) => [
      ...prev,
      {
        id,
        source: "平台新增",
        externalId: id,
        kind: newKind,
        x,
        y,
        state: "已确认",
      },
    ]);
    SELECT(id);
  };

  const saveAll = () => {
    const toSave = editingId ? applyForm(editingId, draft) : draft;
    if (act({ type: "SAVE_MAP_TARGETS", mapId: m.id, targets: toSave })) {
      EDIT("");
      FORM({});
      // 保存成功后刷新本地草稿，避免再次提示 dirty
      SETDRAFT(structuredClone(toSave));
    }
  };

  const reset = () => {
    SETDRAFT(structuredClone(m.targets));
    EDIT("");
    FORM({});
    SELECT("");
  };

  return (
    <>
      <Note>
        该地图随文件自带 <b>{m.targets.filter((t) => t.source !== "平台新增").length}</b>{" "}
        个定位ID（保留原样）。您可在此新增、编辑坐标、删除人工新增的巡航点；
        保存后地图将变为<b>草稿</b>，需重新下发定版。
      </Note>
      <Panel title="底图" extra={<span>{m.image ? "已上传" : "未上传"}</span>}>
        <MapBaseUpload mapId={m.id} />
      </Panel>
      <Panel
        title="地图内容"
        extra={
          <div className="actions">
            <label className="inline-filter">
              <span>新增点位类型：</span>
              <select value={newKind} onChange={(e) => KIND(e.target.value)}>
                {CRUISE_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
          </div>
        }
      >
        <MapImageCanvas
          image={m.image}
          height={380}
          selected={selected}
          onSelect={(id) => SELECT(id)}
          onAdd={addAt}
          markers={draft.map((t) => ({
            id: t.id,
            x: t.x,
            y: t.y,
            label: t.externalId ? `${t.externalId} · ${t.kind}` : `${t.id} · ${t.kind}`,
            kind: t.kind,
            state: t.state,
            source: t.source,
          }))}
        />
        <p className="muted">在图面上点击即可新增一个巡航点（来源记为「平台新增」）。</p>
      </Panel>
      <Panel
        title="巡航点清单"
        extra={
          <div className="actions">
            <Btn disabled={!dirty} onClick={reset}>
              重置
            </Btn>
            <Btn primary disabled={!dirty} onClick={saveAll}>
              保存
            </Btn>
          </div>
        }
      >
        {draft.length ? (
          <Table
            heads={["ID / 定位号", "类型", "坐标 (x,y)", "来源", "状态", "操作"]}
            rows={draft.map((t) => {
              const isEditing = editingId === t.id;
              const label = t.externalId || t.id;
              const bound = !!t.pointId;
              return isEditing
                ? [
                    <input
                      type="text"
                      value={form.externalId}
                      disabled={t.source === "地图导入"}
                      title={
                        t.source === "地图导入"
                          ? "地图导入的定位号保持原样"
                          : "人工新增点可修改定位号"
                      }
                      onChange={(e) =>
                        FORM((f) => ({ ...f, externalId: e.target.value }))
                      }
                    />,
                    <select
                      value={form.kind}
                      onChange={(e) => FORM((f) => ({ ...f, kind: e.target.value }))}
                    >
                      {CRUISE_KINDS.map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>,
                    <div className="coords">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={form.x}
                        onChange={(e) => FORM((f) => ({ ...f, x: +e.target.value }))}
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={form.y}
                        onChange={(e) => FORM((f) => ({ ...f, y: +e.target.value }))}
                      />
                    </div>,
                    t.source,
                    <Badge>{t.state}</Badge>,
                    <div className="actions">
                      <Btn onClick={() => saveRow(t.id)}>保存</Btn>
                      <Btn onClick={() => { EDIT(""); FORM({}); }}>取消</Btn>
                    </div>,
                  ]
                : [
                    <b>{label}</b>,
                    t.kind,
                    `(${t.x}, ${t.y})`,
                    t.source,
                    <Badge>{t.state}</Badge>,
                    <div className="actions">
                      <Btn onClick={() => startEdit(t)}>编辑</Btn>
                      <Btn
                        disabled={t.source === "地图导入" || bound}
                        title={
                          t.source === "地图导入"
                            ? "地图导入点保持原样，不可删除"
                            : bound
                              ? "已关联业务点位，请先解绑"
                              : "删除该巡航点"
                        }
                        onClick={() => remove(t.id)}
                      >
                        删除
                      </Btn>
                    </div>,
                  ];
            })}
          />
        ) : (
          <Empty>该地图暂无巡航点，在底图上点击即可新增。</Empty>
        )}
      </Panel>
    </>
  );
}
