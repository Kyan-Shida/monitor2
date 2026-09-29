import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Annotation } from "../pages/Annotation";
import { Badge, Btn, Note, Panel, Table } from "./UI";

/** One map, one workflow: trial deployment belongs to validation preparation. */
export function MapOnboarding({ mapId }: { mapId: string }) {
  const { s, act } = useStore();
  const m = s.maps.find(x => x.id === mapId)!;
  const points = s.points.filter(p => p.mapId === m.id && p.state !== "停用");
  const robots = s.robots.filter(r => r.region === m.region);
  const [step, setStep] = useState(m.state === "已发布" ? 4 : points.length ? 1 : 0);
  const [rid, setRid] = useState(robots.find(r => r.state === "空闲")?.id || robots[0]?.id || "");
  const r = robots.find(x => x.id === rid);
  const aligned = (robot: typeof r) => !!robot && robot.mapId === m.id && robot.mapVersion === m.version && robot.pointSet === m.pointSet;
  const sy = s.syncs.find(x => x.mapId === m.id && x.robotId === rid && x.mapVersion === m.version && x.pointSet === m.pointSet);
  const verified = points.filter(p => p.state === "已启用").length;
  const ready = !!points.length && verified === points.length;
  const labels = ["资料导入", "业务标注", "巡检点验证", "正式发布", "机器人同步"];
  const facts = [m.cloud && m.video ? "原始资料已归档" : "原始资料待补齐", `${points.length} 个业务点位`, `${verified} / ${points.length} 已通过`, m.state, `${robots.filter(aligned).length} / ${robots.length} 版本一致`];
  return <>
    <div className="context-bar"><b>{m.name} · 上线工作台</b><span>m{m.version} / p{m.pointSet}</span><Badge>{m.state}</Badge><Btn onClick={() => go("maps", m.id, "detail")}>地图档案</Btn></div>
    <nav className="onboarding-steps" aria-label="地图上线步骤">{labels.map((label, i) => <button key={label} className={step === i ? "active" : ""} aria-current={step === i ? "step" : undefined} onClick={() => setStep(i)}><b>{i + 1} · {label}</b><small>{facts[i]}</small></button>)}</nav>
    {step === 0 && <Panel title="1 · 核对导入资料"><Table heads={["资料", "当前文件"]} rows={[["机器人地图包", m.file], ["原始点云", m.cloud || "待补齐"], ["原始视频", m.video || "待补齐"], ["采集来源", m.source]]}/><div className="onboarding-archive-footer"><Btn onClick={() => go("maps", m.id, "archive")}>查看资料档案</Btn><span>演示环境仅登记文件信息 · 下一步完成业务标注</span></div></Panel>}
    {step === 1 && <Annotation key={m.id} id={m.id} embedded />}
    {step === 2 && <>
      <Panel title="3 · 验证准备与机器人版本" extra={<Badge>试验版本仅用于验证</Badge>}>
        <Note>先准备试验版本并同步到验证机器人，再逐点模拟自主寻址和采集验证。全部通过后才能正式发布。</Note>
        <div className="actions"><select aria-label="验证机器人" value={rid} onChange={e => setRid(e.target.value)}>{robots.map(r => <option key={r.id} value={r.id}>{r.name} · {r.state}</option>)}</select><Btn disabled={!points.length || m.state !== "草稿"} onClick={() => act({type:"PUBLISH", id:m.id, trial:true})}>准备试验版本</Btn></div>
        {syncControls()}
      </Panel>
      <Panel title="自主试巡检验证 · Mock 回执"><Table heads={["业务点位 / 检测项", "验证状态", "验证证据 / 失败原因", "操作"]} rows={points.map(p => [<>{p.name}<small>{p.item}</small></>, <Badge>{p.state}</Badge>, p.validationFailure || p.validated || (r && !r.capabilities.includes(p.kind) ? "当前机器人缺少该检测项能力，请更换机器人" : "待验证：目标身份、可达性与采集质量"), <div className="actions"><Btn disabled={m.state === "已发布" || !aligned(r) || r?.state !== "空闲" || !r.capabilities.includes(p.kind)} onClick={() => act({type:"VALIDATE", id:p.id, robotId:rid})}>模拟通过回执</Btn><Btn disabled={m.state === "已发布" || !aligned(r) || r?.state !== "空闲" || !r.capabilities.includes(p.kind)} onClick={() => act({type:"VALIDATE", id:p.id, robotId:rid, fail:true})}>模拟失败回执</Btn></div>])}/><Note>{ready ? "所有有效点位已验证，可以正式发布。" : `还有 ${points.length - verified} 个点位待通过。失败后返回业务标注修正，再重新准备试验版本、同步和验证。`}</Note></Panel>
    </>}
    {step === 3 && <Panel title="4 · 正式发布检查"><Table heads={["检查项", "结果"]} rows={[["原始点云及视频", m.cloud && m.video ? "完整" : "待补齐"], ["点位验证", `${verified} / ${points.length} 通过`], ["发布版本", `m${m.version} / p${m.pointSet}`]]}/><Note>正式发布后保留历史任务快照。下一步核对使用机器人的实际激活版本。</Note><Btn primary disabled={!ready || !m.cloud || !m.video || m.state === "已发布"} onClick={() => {if(act({type:"PUBLISH", id:m.id})) setStep(4);}}>正式发布，进入同步</Btn></Panel>}
    {step === 4 && <Panel title="5 · 机器人同步与上线结果"><Note>{m.state === "已发布" ? "逐台核对实际激活版本。验证机器人若已激活同一版本，无需重复传输。" : "当前尚未正式发布，请先完成验证和发布。"}</Note><select aria-label="同步机器人" value={rid} onChange={e => setRid(e.target.value)}>{robots.map(r => <option key={r.id} value={r.id}>{r.name} · {r.state}</option>)}</select>{syncControls()}<Table heads={["机器人", "实际激活版本", "上线结论"]} rows={robots.map(r => [r.name, `m${r.mapVersion} / p${r.pointSet}`, <Badge>{m.state === "已发布" && aligned(r) ? "地图上线完成" : "待完成上线"}</Badge>])}/><small>地图上线完成表示地图版本条件满足；实际任务仍需检查能力、电量和机器人状态。</small></Panel>}
    <div className="context-bar"><span>当前步骤：{labels[step]}</span><Btn disabled={step === 0} onClick={() => setStep(step - 1)}>上一步</Btn>{step < 4 && <Btn primary onClick={() => setStep(step + 1)}>下一步：{labels[step + 1]}</Btn>}{step === 4 && <Btn onClick={() => go("maps")}>返回地图列表</Btn>}</div>
  </>;
  function syncControls() {
    return <div className="onboarding-sync"><p>实际版本：{r ? `m${r.mapVersion} / p${r.pointSet}` : "未选择机器人"} · <Badge>{aligned(r) ? "版本已一致" : sy?.state || "待同步"}</Badge></p><div className="actions"><Btn disabled={!r || m.state === "草稿" || aligned(r) || (step === 4 && m.state !== "已发布") || (!!sy && !["失败", "已同步"].includes(sy.state))} onClick={() => act({type:"SYNC", mapId:m.id, robotId:rid})}>下发当前版本</Btn>{sy && !["失败", "已同步"].includes(sy.state) && <Btn primary onClick={() => act({type:"SYNC_STEP", id:sy.id})}>{sy.state === "传输中" ? "模拟传输完成" : sy.state === "校验中" ? "模拟校验通过" : "模拟激活回执"}</Btn>}</div>{sy?.reason && <p className="muted">{sy.reason}</p>}{r && r.state !== "空闲" && <Note>机器人当前{r.state}，须空闲后才能激活版本和验证点位。</Note>}</div>;
}

}
