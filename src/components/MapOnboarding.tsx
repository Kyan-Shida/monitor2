/**
 * @file MapOnboarding.tsx
 * @description 地图上线工作台（4 步，简化版）：上传底图 → 标注点位 → 定版发布 → 机器人同步。
 *              平台**不区分试验版 / 正式版**：定版即当前内容；直接同步也会自动定版。
 *              设备清单 / 逻辑点 / 试采 / 示教等业务编排下沉到各自页面，工作台只提供跳转链接。
 * @interaction 被 Maps.tsx 的 workflow tab 渲染；第 2 步内嵌 Annotation 做点位标注
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Annotation } from "../pages/Annotation";
import { MapBaseUpload } from "./MapBaseUpload";
import { MapImageCanvas } from "./MapImageCanvas";
import { Badge, Btn, Note, Panel, Table } from "./UI";

/** One map, one workflow: trial deployment belongs to validation preparation. */
export function MapOnboarding({ mapId }: { mapId: string }) {
  const { s, act } = useStore();
  const m = s.maps.find((x) => x.id === mapId)!;
  const points = s.points.filter((p) => p.mapId === m.id && p.state !== "停用");
  const robots = s.robots.filter((r) => r.region === m.region);
  const [step, setStep] = useState(m.state === "已发布" ? 2 : points.length ? 1 : 0);
  const [rid, setRid] = useState(robots.find((r) => r.state === "空闲")?.id || robots[0]?.id || "");
  const r = robots.find((x) => x.id === rid);
  const aligned = (robot: (typeof robots)[number] | undefined) =>
    !!robot && robot.mapId === m.id && robot.mapVersion === m.version && robot.pointSet === m.pointSet;
  const sy = s.syncs.find(
    (x) => x.mapId === m.id && x.robotId === rid && x.mapVersion === m.version && x.pointSet === m.pointSet,
  );
  const verified = points.filter((p) => p.state === "已启用").length;
  const planned = points.filter((p) => p.actionPlan).length;
  /** 4 步：地图页只负责"底图 + 点位"，其余业务在各自页面 */
  const labels = ["上传底图", "标注点位", "定版发布", "机器人同步"];
  const facts = [
    m.image ? "底图已上传" : "底图待上传",
    `${points.length} 个点位`,
    m.state,
    `${robots.filter(aligned).length} / ${robots.length} 版本一致`,
  ];
  return (
    <>
      <div className="context-bar">
        <b>{m.name} · 上线工作台</b>
        <span>m{m.version} / p{m.pointSet}</span>
        <Badge>{m.state}</Badge>
        <Btn onClick={() => go("map-detail", m.id)}>地图详情</Btn>
      </div>
      <nav className="onboarding-steps" aria-label="地图上线步骤">
        {labels.map((label, i) => (
          <button
            key={label}
            className={step === i ? "active" : ""}
            aria-current={step === i ? "step" : undefined}
            onClick={() => setStep(i)}
          >
            <b>
              {i + 1} · {label}
            </b>
            <small>{facts[i]}</small>
          </button>
        ))}
      </nav>

      {step === 0 && (
        <Panel title="1 · 上传地图底图" extra={<Badge>{m.image ? "底图已上传" : "底图待上传"}</Badge>}>
          <MapBaseUpload mapId={m.id} />
          <MapImageCanvas
            image={m.image}
            markers={m.targets
              .filter((t) => t.state !== "已剔除")
              .map((t) => ({ id: t.id, x: t.x, y: t.y, label: t.kind, kind: t.kind, state: t.state }))}
            height={400}
          />
          <Note>
            上传一张巡检地图图片即可开始；底图与点位构成"地图"本身。坐标标定等高级项在
            <b>「地图管理 › 建图与坐标」</b>的折叠区（后置）。
          </Note>
        </Panel>
      )}

      {step === 1 && <Annotation key={m.id} id={m.id} embedded />}

      {step === 2 && (
        <Panel title="3 · 定版检查">
          <Table
            heads={["检查项", "结果"]}
            rows={[
              ["地图底图", m.image ? "已上传" : "待补齐"],
              ["巡检点", `${points.length} 个（${verified} 已启用）`],
              ["巡检项 / 视角", `${planned} / ${points.length} 已编排（在「编辑巡检点」维护）`],
              ["当前内容版本", `m${m.version} / p${m.pointSet}`],
            ]}
          />
          <Note>
            平台不区分"试验版 / 正式版"：定版就是把当前内容发布为可下发版本，历史任务快照保持不变。
            也可以在「地图下发」时自动定版。
          </Note>
          <Btn
            primary
            disabled={m.state === "已发布"}
            onClick={() => {
              if (act({ type: "PUBLISH", id: m.id })) setStep(3);
            }}
          >
            定版当前内容，进入同步
          </Btn>
        </Panel>
      )}

      {step === 3 && (
        <Panel title="4 · 机器人同步与上线结果">
          <Note>
            {m.state === "已发布"
              ? "逐台核对实际激活版本。验证机器人若已激活同一版本，无需重复传输。"
              : "当前内容尚未定版；直接同步会自动定版为当前版本。"}
          </Note>
          <select aria-label="同步机器人" value={rid} onChange={(e) => setRid(e.target.value)}>
            {robots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.state}
              </option>
            ))}
          </select>
          {syncControls()}
          <Table
            heads={["机器人", "实际激活版本", "上线结论"]}
            rows={robots.map((r) => [
              r.name,
              `m${r.mapVersion} / p${r.pointSet}`,
              <Badge>{m.state === "已发布" && aligned(r) ? "地图上线完成" : "待完成上线"}</Badge>,
            ])}
          />
          <small>地图上线完成表示地图版本条件满足；实际任务仍需检查能力、电量和机器人状态。</small>
        </Panel>
      )}

      <div className="context-bar">
        <span>当前步骤：{labels[step]}</span>
        <Btn disabled={step === 0} onClick={() => setStep(step - 1)}>
          上一步
        </Btn>
        {step < labels.length - 1 && (
          <Btn primary onClick={() => setStep(step + 1)}>
            下一步：{labels[step + 1]}
          </Btn>
        )}
        {/* 业务编排下沉到各自页面：工作台只提供入口，不内嵌 */}
        <span className="muted">相关页面：</span>
        <Btn onClick={() => go("equipment")}>设备主数据</Btn>
        <Btn onClick={() => go("annotation")}>巡检点管理</Btn>
        <Btn onClick={() => go("point-annotate", m.id)}>地图标注工作台</Btn>
      </div>
    </>
  );

  /** 同步控区块：下发当前版本 / 分步推进 / 版本一致性提示 */
  function syncControls() {
    return (
      <div className="onboarding-sync">
        <p>
          实际版本：{r ? `m${r.mapVersion} / p${r.pointSet}` : "未选择机器人"} ·{" "}
          <Badge>{aligned(r) ? "版本已一致" : sy?.state || "待同步"}</Badge>
        </p>
        <div className="actions">
          <Btn
            disabled={
              !r ||
              aligned(r) ||
              (!!sy && !["失败", "已同步"].includes(sy.state))
            }
            onClick={() => act({ type: "SYNC", mapId: m.id, robotId: rid })}
          >
            下发当前版本
          </Btn>
          {sy && !["失败", "已同步"].includes(sy.state) && (
            <Btn primary onClick={() => act({ type: "SYNC_STEP", id: sy.id })}>
              {sy.state === "传输中" ? "模拟传输完成" : sy.state === "校验中" ? "模拟校验通过" : "模拟激活回执"}
            </Btn>
          )}
        </div>
        {sy?.reason && <p className="muted">{sy.reason}</p>}
        {r && r.state !== "空闲" && <Note>机器人当前{r.state}，须空闲后才能激活版本。</Note>}
      </div>
    );
  }
}
