/**
 * @file SpaceManage.tsx
 * @description 空间管理（资源与地图 › 空间）：把「地图管理的纯 SLAM 地图」与「巡检点管理的业务逻辑」
 *              在空间维度上缝合起来，让机器狗拿到的是可执行的一份空间描述：
 *              ① 厂区全局坐标系概览；② 碎片地图配准（局部坐标系 → 厂区全局）；
 *              ③ 巡检点全局坐标；④ 全局 ↔ 局部坐标转换；⑤ 地图拓扑与跨图切换点；⑥ 版本绑定与校验
 * @interaction 由 App.tsx 按路由 `space` 渲染；读 store 的 maps / points / robots / syncs / routes / mapSwitchPoints，
 *              写入走 engine 的 CALIBRATE_FRAMES 与 MAP_SWITCH_ADD / _REMOVE / _STATE
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { usePageSize, useViewState } from "../data/navigation";
import { Badge, Btn, Drawer, Empty, Field, Panel, Table } from "../components/UI";
import { Pager } from "../components/Business";
import { FilterPanel } from "../components/FilterPanel";
import { mapVer } from "../data/versionLabel";
import {
  coordText,
  distanceOf,
  isRegistered,
  localToWorld,
  worldToLocal,
  type Vec3,
} from "../data/geo";
import type { MapAsset } from "../data/types";

/**
 * 求地图拓扑的连通分量
 * @description 已启用的跨图切换点视作一张图到另一张图的一条边；
 *              连通分量回答的是"这堆碎片地图能不能串起来走"，
 *              分成多块意味着机器人无法仅靠这些切换点跨过去。
 * @param maps 全部地图
 * @param edges 跨图切换点集合
 * @returns 连通分量列表（每项为该分量里的地图名）
 */
function componentsOf(maps: MapAsset[], edges: { fromMapId: string; toMapId: string; state: string }[]) {
  const parent = new Map<string, string>();
  maps.forEach((m) => parent.set(m.id, m.id));
  const find = (x: string): string => {
    while (parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  edges
    .filter((e) => e.state === "启用" && parent.has(e.fromMapId) && parent.has(e.toMapId))
    .forEach((e) => {
      const ra = find(e.fromMapId);
      const rb = find(e.toMapId);
      if (ra !== rb) parent.set(ra, rb);
    });
  const byRoot = new Map<string, string[]>();
  maps.forEach((m) => {
    const r = find(m.id);
    byRoot.set(r, [...(byRoot.get(r) || []), m.name]);
  });
  return [...byRoot.values()].sort((a, b) => b.length - a.length);
}

export function SpaceManage() {
  const { s, act } = useStore();
  const switches = s.mapSwitchPoints || [];

  /** 碎片地图配准：当前编辑的地图；非空即为展开弹窗 */
  const [frameMap, SETFRAME] = useState("");
  const [res, SETRES] = useState("");
  const [ox, SETOX] = useState("0");
  const [oy, SETOY] = useState("0");
  const [oyaw, SETYAW] = useState("0");
  const [rot, SETROT] = useState("0");

  /** 跨图切换点：新增弹窗开关与表单 */
  const [switchOpen, SETSW] = useState(false);
  const [swName, SETSN] = useState("");
  const [swFrom, SETSF] = useState("");
  const [swTo, SETST] = useState("");
  const [fx, SETFX] = useState("0");
  const [fy, SETFY] = useState("0");
  const [tx, SETTX] = useState("0");
  const [ty, SETTY] = useState("0");

  /** 坐标转换器：目标地图、换算方向、输入坐标 */
  const [convMap, SETCM] = useState("");
  const [dir, SETDIR] = useState<"全局→局部" | "局部→全局">("全局→局部");
  const [cx, SETCX] = useState("0");
  const [cy, SETCY] = useState("0");
  const [cz, SETCZ] = useState("0");

  const [pointMapF, SETPMF] = useViewState("space.point.map", "全部");
  const [onlyMissing, SETONLY] = useViewState("space.point.missing", false);
  const [pointPage, SETPP] = useViewState("space.point.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pointPageSize, SETPOINTPS] = usePageSize("space.point.size");
  /** 巡检点全局坐标列表筛选：展开态 + 草稿条件（点「查询」才写回生效值，与设备台账同款） */
  const [ptFilterOpen, SETPTFILTER] = useState(false);
  const [ptDraft, PTDRAFT] = useState({
    map: pointMapF,
    missing: onlyMissing ? "是" : "否",
  });
  /** 已生效的筛选条件数（「筛选」按钮上的计数） */
  const ptFilterCount = (pointMapF !== "全部" ? 1 : 0) + (onlyMissing ? 1 : 0);
  /** 展开筛选面板：用当前生效值填充草稿 */
  function togglePtFilter() {
    if (!ptFilterOpen)
      PTDRAFT({ map: pointMapF, missing: onlyMissing ? "是" : "否" });
    SETPTFILTER(!ptFilterOpen);
  }
  /** 查询：草稿写回生效值并收起面板（列表回到第 1 页） */
  function applyPtFilter() {
    SETPMF(ptDraft.map);
    SETONLY(ptDraft.missing === "是");
    SETPP(1);
    SETPTFILTER(false);
  }
  /** 重置：清空草稿并立即生效 */
  function resetPtFilter() {
    PTDRAFT({ map: "全部", missing: "否" });
    SETPMF("全部");
    SETONLY(false);
    SETPP(1);
  }

  /** 每张图的巡检点数量与已写入全局坐标的数量 */
  const pointStat = (mapId: string) => {
    const pts = s.points.filter((p) => p.mapId === mapId);
    return { total: pts.length, withWorld: pts.filter((p) => !!p.world).length };
  };

  /** 厂区全局坐标系的覆盖范围：由已写入全局坐标的巡检点反推包围盒 */
  const worlds = s.points.map((p) => p.world).filter(Boolean) as Vec3[];
  const extent = worlds.length
    ? {
        minX: Math.min(...worlds.map((w) => w.x)),
        maxX: Math.max(...worlds.map((w) => w.x)),
        minY: Math.min(...worlds.map((w) => w.y)),
        maxY: Math.max(...worlds.map((w) => w.y)),
      }
    : undefined;
  const registered = s.maps.filter((m) => isRegistered(m.frames)).length;
  const components = componentsOf(s.maps, switches);

  /** 打开某张图的配准弹窗：表单回填当前标定值 */
  function editFrame(m: MapAsset) {
    SETFRAME(m.id);
    SETRES(m.frames?.resolution != null ? String(m.frames.resolution) : "");
    SETOX(String(m.frames?.origin?.x ?? 0));
    SETOY(String(m.frames?.origin?.y ?? 0));
    SETYAW(String(m.frames?.origin?.yaw ?? 0));
    SETROT(String(m.frames?.rotateDeg ?? 0));
  }

  const pointRows = s.points.filter(
    (p) =>
      (pointMapF === "全部" || p.mapId === pointMapF) &&
      (!onlyMissing || !p.world),
  );
  const pointPages = Math.max(1, Math.ceil(pointRows.length / pointPageSize));
  const curPointPage = Math.min(pointPage || 1, pointPages);
  const pagedPoints = pointRows.slice(
    (curPointPage - 1) * pointPageSize,
    curPointPage * pointPageSize,
  );

  const cm = s.maps.find((x) => x.id === convMap) || s.maps[0];
  const convInput: Vec3 = {
    x: Number(cx) || 0,
    y: Number(cy) || 0,
    z: Number(cz) || 0,
  };
  const convOut: Vec3 | undefined = cm
    ? dir === "全局→局部"
      ? worldToLocal(convInput, cm.frames)
      : localToWorld(convInput, cm.frames)
    : undefined;

  return (
    <>
      <Panel
        title="厂区全局坐标系"
        extra={
          <span>
            {s.maps.length} 张地图 · 已配准 {registered}
          </span>
        }
      >
        <Table
          heads={["项目", "取值"]}
          rows={[
            [
              "已写入全局坐标的巡检点",
              <span>
                {worlds.length} / {s.points.length}
              </span>,
            ],
            [
              "全局覆盖范围（由巡检点反推）",
              extent
                ? `X ${extent.minX} ~ ${extent.maxX} 米 · Y ${extent.minY} ~ ${extent.maxY} 米`
                : "—",
            ],
            [
              "地图连通分量",
              components.length
                ? components.map((c) => c.join(" / ")).join(" ｜ ")
                : "—",
            ],
            [
              "跨图切换点",
              <span>
                {switches.length} 条（启用{" "}
                {switches.filter((x) => x.state === "启用").length}）
              </span>,
            ],
          ]}
        />
      </Panel>

      <Panel
        title="碎片地图配准（局部坐标系 → 厂区全局）"
        extra={<span>{registered} / {s.maps.length} 已配准</span>}
      >
        <Table
          heads={[
            "地图",
            "区域",
            "分辨率（米/像素）",
            "全局原点 X / Y / yaw",
            "旋转(°)",
            "标定状态",
            "巡检点",
            "操作",
          ]}
          rows={s.maps.map((m) => {
            const st = pointStat(m.id);
            return [
              <b>{m.name}</b>,
              m.region,
              m.frames?.resolution != null ? String(m.frames.resolution) : "—",
              m.frames?.origin
                ? `${m.frames.origin.x} / ${m.frames.origin.y} / ${m.frames.origin.yaw ?? 0}`
                : "—",
              String(m.frames?.rotateDeg ?? 0),
              <Badge>{m.frames?.calibState || "未标定"}</Badge>,
              <span>
                {st.withWorld} / {st.total}
              </span>,
              <Btn onClick={() => editFrame(m)}>配准</Btn>,
            ];
          })}
        />
      </Panel>

      <Panel
        className="panel-filters-wrap"
        title="巡检点全局坐标"
        extra={
          <div className="actions">
            <span className="panel-count">{pointRows.length} 个</span>
            {/* 筛选：条件默认收起，点「筛选」才展开（与设备台账同款） */}
            <Btn onClick={togglePtFilter}>
              {ptFilterOpen ? "收起筛选" : "筛选"}
              {ptFilterCount ? `（${ptFilterCount}）` : ""}
            </Btn>
          </div>
        }
      >
        {ptFilterOpen && (
          <FilterPanel
            fields={[
              {
                key: "map",
                label: "来源地图",
                options: ["全部", ...s.maps.map((m) => m.id)],
              },
              {
                key: "missing",
                label: "仅看未写入全局坐标",
                options: ["否", "是"],
              },
            ]}
            value={ptDraft}
            onChange={(next) => PTDRAFT({ ...ptDraft, ...next })}
            onSearch={applyPtFilter}
            onReset={resetPtFilter}
          />
        )}
        <Table
          heads={[
            "巡检点",
            "来源地图",
            "底图投影(%)",
            "局部坐标(米)",
            "全局坐标(米)",
            "坐标口径",
          ]}
          rows={pagedPoints.map((p) => {
            const map = s.maps.find((m) => m.id === p.mapId);
            const ok = isRegistered(map?.frames);
            const local = p.world
              ? worldToLocal(p.world, map?.frames)
              : undefined;
            return [
              <b>{p.name}</b>,
              map?.name || p.mapId,
              `${p.x} / ${p.y}`,
              local ? coordText(local) : "—",
              p.world ? coordText(p.world) : "—",
              !p.world ? (
                <Badge tone="amber">未写入</Badge>
              ) : ok ? (
                <Badge tone="green">全局权威</Badge>
              ) : (
                <Badge tone="amber">图未配准</Badge>
              ),
            ];
          })}
        />
        <Pager
          page={curPointPage}
          count={pointRows.length}
          size={pointPageSize}
          onChange={SETPP}
          onSize={(n) => {
            SETPOINTPS(n);
            SETPP(1);
          }}
        />
      </Panel>

      <Panel
        title="全局 ↔ 局部坐标转换"
        extra={
          <span>
            {dir} · {cm?.name || "—"}
          </span>
        }
      >
        <div className="filter-bar">
          <label className="inline-filter">
            <span>目标地图：</span>
            <select value={cm?.id || ""} onChange={(e) => SETCM(e.target.value)}>
              {s.maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-filter">
            <span>换算方向：</span>
            <select
              value={dir}
              onChange={(e) => SETDIR(e.target.value as typeof dir)}
            >
              <option>全局→局部</option>
              <option>局部→全局</option>
            </select>
          </label>
          <Field label="X">
            <input value={cx} onChange={(e) => SETCX(e.target.value)} />
          </Field>
          <Field label="Y">
            <input value={cy} onChange={(e) => SETCY(e.target.value)} />
          </Field>
          <Field label="Z">
            <input value={cz} onChange={(e) => SETCZ(e.target.value)} />
          </Field>
        </div>
        <Table
          heads={["项目", "取值"]}
          rows={[
            [
              dir === "全局→局部" ? "输入（厂区全局）" : "输入（地图局部）",
              coordText(convInput),
            ],
            [
              dir === "全局→局部" ? "输出（地图局部）" : "输出（厂区全局）",
              convOut ? coordText(convOut) : "—",
            ],
            [
              "该图变换参数",
              cm?.frames?.origin
                ? `平移 X ${cm.frames.origin.x} / Y ${cm.frames.origin.y} 米 · 旋转 ${cm.frames.rotateDeg ?? 0}°`
                : "未配准（按恒等变换处理）",
            ],
            [
              "与图原点距离",
              convOut
                ? `${distanceOf(convOut, { x: 0, y: 0, z: 0 })} 米`
                : "—",
            ],
          ]}
        />
      </Panel>

      <Panel
        title="地图拓扑与跨图切换点"
        extra={
          <Btn primary disabled={s.maps.length < 2} onClick={() => SETSW(true)}>
            ＋ 新增切换点
          </Btn>
        }
      >
        {!switches.length ? (
          <Empty>暂无跨图切换点</Empty>
        ) : (
          <Table
            heads={[
              "切换点",
              "来源地图",
              "目标地图",
              "来源位置(%)",
              "接驳位置(%)",
              "状态",
              "操作",
            ]}
            rows={switches.map((x) => {
              const from = s.maps.find((m) => m.id === x.fromMapId);
              const to = s.maps.find((m) => m.id === x.toMapId);
              return [
                <b>{x.name}</b>,
                from?.name || x.fromMapId,
                to?.name || x.toMapId,
                `${x.from.x} / ${x.from.y}`,
                `${x.to.x} / ${x.to.y}`,
                <Badge>{x.state}</Badge>,
                <div className="actions">
                  <Btn onClick={() => act({ type: "MAP_SWITCH_STATE", id: x.id })}>
                    {x.state === "启用" ? "停用" : "启用"}
                  </Btn>
                  <Btn
                    danger
                    onClick={() => act({ type: "MAP_SWITCH_REMOVE", id: x.id })}
                  >
                    删除
                  </Btn>
                </div>,
              ];
            })}
          />
        )}
      </Panel>

      <Panel title="版本绑定与校验" extra={<span>{s.maps.length} 张地图</span>}>
        <Table
          heads={[
            "地图",
            "空间版本",
            "已同步机器人",
            "版本落后机器人",
            "下发记录",
            "校验",
          ]}
          rows={s.maps.map((m) => {
            const mine = s.robots.filter((r) => r.mapId === m.id);
            const synced = mine.filter((r) => r.mapVersion === m.version);
            const lagged = mine.filter((r) => r.mapVersion !== m.version);
            const syncs = s.syncs.filter(
              (x) => x.mapId === m.id && x.mapVersion === m.version,
            );
            return [
              <b>{m.name}</b>,
              mapVer(m.version),
              synced.map((r) => r.id).join(" / ") || "—",
              lagged.length
                ? lagged.map((r) => `${r.id}（${mapVer(r.mapVersion)}）`).join(" / ")
                : "—",
              syncs.length ? `${syncs.length} 条` : "—",
              !mine.length ? (
                <Badge>无归属机器人</Badge>
              ) : !lagged.length ? (
                <Badge tone="green">一致</Badge>
              ) : (
                <Badge tone="red">存在落后</Badge>
              ),
            ];
          })}
        />
      </Panel>

      {!!frameMap && (
        <Drawer
          title="碎片地图配准"
          subtitle={s.maps.find((m) => m.id === frameMap)?.name}
          onClose={() => SETFRAME("")}
          footer={
            <>
              <Btn onClick={() => SETFRAME("")}>取消</Btn>
              <Btn
                primary
                onClick={() => {
                  if (
                    act({
                      type: "CALIBRATE_FRAMES",
                      mapId: frameMap,
                      frames: {
                        resolution: res.trim() ? Number(res) || undefined : undefined,
                        origin: {
                          x: Number(ox) || 0,
                          y: Number(oy) || 0,
                          yaw: Number(oyaw) || 0,
                        },
                        rotateDeg: Number(rot) || 0,
                      },
                    })
                  )
                    SETFRAME("");
                }}
              >
                保存配准
              </Btn>
            </>
          }
        >
          <div className="form-grid">
            <Field label="地图">
              <input
                value={s.maps.find((m) => m.id === frameMap)?.name || ""}
                disabled
                readOnly
              />
            </Field>
            <Field label="分辨率（米/像素）">
              <input value={res} onChange={(e) => SETRES(e.target.value)} placeholder="0.05" />
            </Field>
            <Field label="旋转角（°）">
              <input value={rot} onChange={(e) => SETROT(e.target.value)} />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="全局原点 X（米）">
              <input value={ox} onChange={(e) => SETOX(e.target.value)} />
            </Field>
            <Field label="全局原点 Y（米）">
              <input value={oy} onChange={(e) => SETOY(e.target.value)} />
            </Field>
            <Field label="原点 yaw（°）">
              <input value={oyaw} onChange={(e) => SETYAW(e.target.value)} />
            </Field>
          </div>
        </Drawer>
      )}

      {switchOpen && (
        <Drawer
          title="新增跨图切换点"
          subtitle={swName.trim() || undefined}
          onClose={() => SETSW(false)}
          footer={
            <>
              <Btn onClick={() => SETSW(false)}>取消</Btn>
              <Btn
                primary
                disabled={!swFrom || !swTo || swFrom === swTo}
                onClick={() => {
                  if (
                    act({
                      type: "MAP_SWITCH_ADD",
                      name: swName.trim(),
                      fromMapId: swFrom,
                      toMapId: swTo,
                      fromX: Number(fx) || 0,
                      fromY: Number(fy) || 0,
                      toX: Number(tx) || 0,
                      toY: Number(ty) || 0,
                    })
                  ) {
                    SETSW(false);
                    SETSN("");
                  }
                }}
              >
                新增
              </Btn>
            </>
          }
        >
          <Field label="切换点名称">
            <input
              value={swName}
              placeholder="例如 一期罐区 → 二期装置区 连廊口"
              onChange={(e) => SETSN(e.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="来源地图">
              <select value={swFrom} onChange={(e) => SETSF(e.target.value)}>
                <option value="">请选择</option>
                {s.maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="来源位置 X（底图 %）">
              <input value={fx} onChange={(e) => SETFX(e.target.value)} />
            </Field>
            <Field label="来源位置 Y（底图 %）">
              <input value={fy} onChange={(e) => SETFY(e.target.value)} />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="目标地图">
              <select value={swTo} onChange={(e) => SETST(e.target.value)}>
                <option value="">请选择</option>
                {s.maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="接驳位置 X（底图 %）">
              <input value={tx} onChange={(e) => SETTX(e.target.value)} />
            </Field>
            <Field label="接驳位置 Y（底图 %）">
              <input value={ty} onChange={(e) => SETTY(e.target.value)} />
            </Field>
          </div>
        </Drawer>
      )}
    </>
  );
}
