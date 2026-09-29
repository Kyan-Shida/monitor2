import { useState, useRef, useLayoutEffect } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Btn, Badge, Panel, Field, Note, Table, Modal } from "../components/UI";
import { MapCanvas } from "../components/MapCanvas";

export function Annotation({ id, embedded = false }: { id?: string; embedded?: boolean }) {
  const { s, act } = useStore();
  const workspace = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [height, setHeight] = useState(520);
  const [records, setRecords] = useState(false);
  const [preview, setPreview] = useState(false);
  useLayoutEffect(() => {
    const el = workspace.current;
    if (!el) return;
    const resize = () => setHeight(Math.max(220, window.innerHeight - el.getBoundingClientRect().top - (embedded ? 118 : 58)));
    resize();
    const observer = new ResizeObserver(resize);
    if (el.parentElement) observer.observe(el.parentElement);
    window.addEventListener("resize", resize);
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); };
  }, [embedded]);
  const m = s.maps.find((m) => m.id === id) || s.maps[0];
  const first = s.points.find((p) => p.targetId === m.targets[0]?.id);
  const [target, T] = useState(m.targets[0]?.id || ""),
    [name, N] = useState(first?.name || ""),
    [device, D] = useState("V001 原料储罐"),
    [item, I] = useState("压力读数"),
    [req, Q] = useState(
      first?.requirement || "身份唯一，表盘清晰，完整采集检测数据",
    ),
    [rid, R] = useState("R02");
  const candidate = m.targets.find((t) => t.id === target),
    p = s.points.find((p) => p.targetId === target && p.mapId === m.id);
  const pts = s.points.filter((p) => p.mapId === m.id);
  async function uploadImage(file?: File) {
    if (!file || !candidate) return;
    const targetId = candidate.id;
    const mapId = m.id;
    setUploadError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 500 * 1024) {
      setUploadError("请选择 500 KB 以内的 JPG、PNG 或 WebP 图片。");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("读取失败"));
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      if (act({ type: "UPLOAD_REFERENCE", mapId, targetId, name: file.name, dataUrl })) setPreview(true);
    } catch { setUploadError("图片无法读取，请换一张有效图片后重试。"); }
    finally { setUploading(false); }
  }
  function select(t: string) {
    setUploadError("");
    T(t);
    const p = s.points.find((p) => p.targetId === t);
    N(p?.name || "");
    D(p?.device || "V001 原料储罐");
    I(
      p?.item ||
        (m.targets.find((x) => x.id === t)?.kind === "阀门"
          ? "阀门状态"
          : "压力读数"),
    );
    Q(p?.requirement || "目标身份唯一，采集结果清晰");
  }
  return (
    <>
      {!embedded && <div className="context-bar">
        <select
          value={m.id}
          onChange={(e) => {
            go("annotation", e.target.value);
            T("");
          }}
        >
          {s.maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <span>
          m{m.version} / 点位集合 p{m.pointSet}
        </span>
        <Badge>{m.state}</Badge>
        <Btn primary onClick={() => go("maps", m.id, "workflow")}>进入地图上线工作台</Btn>
        <Btn primary onClick={() => go("maps", m.id, "detail")}>
          发布检查 →
        </Btn>
      </div>
      }
      <div ref={workspace} className="annotation-grid annotation-fit" style={{height}}>
        <Panel
          title="候选目标与业务点位"
          extra={<span>{m.targets.length} 个</span>}
        >
          <div className="target-list">
            {m.targets
              .filter((t) => t.state !== "已剔除")
              .map((t) => (
                <button
                  className={target === t.id ? "selected" : ""}
                  key={t.id}
                  onClick={() => select(t.id)}
                >
                  <b>
                    {t.kind} · {t.id.slice(-6)}
                  </b>
                  <span>
                    {s.points.find((p) => p.id === t.pointId)?.name ||
                      "业务身份待确认"}
                  </span>
                  <Badge>{t.state}</Badge>
                </button>
              ))}
          </div>
          <Btn onClick={() => act({ type: "ADD_TARGET", mapId: m.id })}>
            ＋ 人工新增目标
          </Btn>
          <p className="muted">也可双击地图补充目标位置。</p>
        </Panel>
        <div className="annotation-scene">
          <Panel title={preview ? "候选目标参考图像" : "点位标注画布"} extra={<div className="actions"><Btn onClick={() => setPreview(!preview)}>{preview ? "查看地图" : "参考图像"}</Btn><Btn disabled={!candidate || uploading} onClick={() => upload.current?.click()}>{uploading ? "上传中…" : candidate?.referenceImage ? "替换参考图像" : "上传参考图像"}</Btn><Btn onClick={() => setRecords(true)}>版本与验证记录</Btn></div>}>
            <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" aria-label="上传参考图像" hidden onChange={event => { void uploadImage(event.target.files?.[0]); event.target.value = ""; }} />
            {uploadError && <p role="alert" className="reference-upload-error">{uploadError}</p>}
            {preview ? <div className="annotation-reference">
              {candidate?.referenceImage ? <><img src={candidate.referenceImage.dataUrl} alt={`${p?.name || candidate.id}的人工参考图像`} /><small>人工上传 · {candidate.referenceImage.name} · {new Date(candidate.referenceImage.uploadedAt).toLocaleString("zh-CN")}</small></> : <div className="empty">暂无参考图像，请选择目标后上传现场照片。</div>}
              <small>用于辅助确认目标身份，不作为巡检结果。演示图片仅保存在当前浏览器（单张 ≤ 500 KB）。</small>
            </div> : (
            <MapCanvas
              points={pts}
              targets={m.targets}
              selected={target}
              onSelect={select}
              onAdd={(x, y) => act({ type: "ADD_TARGET", mapId: m.id, x, y })}
            />
            )}
          </Panel>
        </div>
        <Panel title="业务身份与检测要求">
          {candidate ? (
            <>
              <p>
                {candidate.kind} · {candidate.id}
              </p>
              {p && (
                <p>
                  <Badge>{p.state}</Badge> 点位 v{p.version}
                </p>
              )}
              <Field label="业务点位名称">
                <input
                  value={name}
                  placeholder={p?.name || "例如 V001 出口压力表"}
                  onChange={(e) => N(e.target.value)}
                />
              </Field>
              <Field label="所属设备">
                <select value={device} onChange={(e) => D(e.target.value)}>
                  <option>V001 原料储罐</option>
                  <option>V002 缓冲罐</option>
                </select>
              </Field>
              <Field label="对象 / 检测项">
                <select value={item} onChange={(e) => I(e.target.value)}>
                  <option>压力读数</option>
                  <option>阀门状态</option>
                  <option>表面温度</option>
                </select>
              </Field>
              <Field label="采集质量与业务要求">
                <textarea
                  rows={4}
                  value={req}
                  onChange={(e) => Q(e.target.value)}
                />
              </Field>
              <Btn
                primary
                onClick={() =>
                  act({
                    type: "ANNOTATE",
                    mapId: m.id,
                    targetId: target,
                    pointId: p?.id,
                    name: name || p?.name,
                    device,
                    object: item === "压力读数" ? "出口压力表" : item,
                    item,
                    unit:
                      item === "压力读数"
                        ? "MPa"
                        : item === "表面温度"
                          ? "℃"
                          : "",
                    requirement: req,
                  })
                }
              >
                保存业务标注
              </Btn>
              <Btn
                disabled={!!p}
                onClick={() =>
                  act({ type: "DISCARD_TARGET", mapId: m.id, targetId: target })
                }
              >
                剔除误识别
              </Btn>
              {!embedded && <>
              <hr />
              <Field label="自主验证机器人">
                <select value={rid} onChange={(e) => R(e.target.value)}>
                  {s.robots.map((r) => (
                    <option key={r.id}>{r.id}</option>
                  ))}
                </select>
              </Field>
              <Btn
                disabled={!p}
                onClick={() =>
                  act({ type: "VALIDATE", id: p?.id, robotId: rid })
                }
              >
                模拟自主试巡检验证
              </Btn>
              <p className="muted">
                {p?.validated ||
                  "当前版本必须先同步至验证机器人。验证通过后启用点位。"}
              </p></>}
            </>
          ) : (
            <Note>从左侧或地图选择候选目标。</Note>
          )}
        </Panel>
      </div>
      {records && <Modal title="点位版本与验证记录" onClose={() => setRecords(false)}>
        <Table
          heads={["业务点位", "设备 / 检测项", "版本", "状态", "验证证据"]}
          rows={pts.map((p) => [
            p.name,
            `${p.device} / ${p.item}`,
            `v${p.version}`,
            <Badge>{p.state}</Badge>,
            p.validated || "待验证",
          ])}
        />
      </Modal>}
    </>
  );
}
