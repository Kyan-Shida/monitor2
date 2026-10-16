/**
 * @file route.test.ts
 * @description 巡检路线（子线）回归：父线地图落库、点位顺序即执行顺序、跨图选点被拦
 * @interaction 消费 engine 的 SAVE_TEMPLATE / seed 的路线数据
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { publishStateOf, transition as run } from "./engine";
import { shortestRoadPath } from "./roadnet";
import { targetsOf } from "./mapCalibration";

test("巡检路线：落父线地图、保留点位顺序、跨图选点被拦", () => {
  let s = seed();
  const seeded = s.templates.find((x) => x.id === "TMP01")!;
  // 种子路线绑定父线地图（子线以父线为基线）
  assert.equal(seeded.mapId, "MAP-A03");
  assert.equal(
    s.maps.find((m) => m.id === seeded.mapId)!.roadnet!.paths.length > 0,
    true,
    "示例地图应带父线路网",
  );

  // 顺序即机器狗的执行顺序：保存时原样落库，不被重排
  s = run(s, {
    type: "SAVE_TEMPLATE",
    id: "TMP01",
    name: "一期罐区常规巡检路线",
    points: ["P003", "P001", "P002"],
    mapId: "MAP-A03",
    state: "启用",
    end: "返航",
  });
  const saved = s.templates.find((x) => x.id === "TMP01")!;
  assert.deepEqual(saved.points, ["P003", "P001", "P002"]);
  assert.equal(saved.mapId, "MAP-A03");
  assert.equal(saved.version, 2);

  // 跨图选点：一条路线只能属于同一张地图（父线），否则机器狗无法执行
  s.points.push({
    ...s.points.find((p) => p.id === "P001")!,
    id: "P-X",
    mapId: "MAP-B01",
    targetId: "O999",
  });
  assert.throws(
    () =>
      run(s, {
        type: "SAVE_TEMPLATE",
        id: "TMP01",
        name: "跨图路线",
        points: ["P001", "P-X"],
        state: "启用",
        end: "返航",
      }),
    /同一张地图/,
  );
  // 被拦后原路线不受影响（不产生半成品版本）
  assert.equal(s.templates.find((x) => x.id === "TMP01")!.version, 2);
});

test("自定义路线：路径锚点落「巡检点 id」，误落定位点 id 会被拦下", () => {
  const s0 = seed();
  const p1 = s0.points.find((x) => x.id === "P001")!;
  const p2 = s0.points.find((x) => x.id === "P002")!;
  const template = s0.templates.find((x) => x.id === "TMP01")!;
  // 定位点（target）与巡检点是两套 id：P001 → O101，别混用
  assert.notEqual(p1.targetId, p1.id);

  // 正常口径：锚点吸附到巡检点，pointId = 巡检点 id（与 RoutePreview 落库一致）
  const s = run(s0, {
    type: "SAVE_TEMPLATE",
    id: "TMP01",
    name: template.name,
    points: [p1.id, p2.id],
    mode: "自定义路线",
    path: [
      { x: p1.x, y: p1.y, pointId: p1.id },
      { x: p2.x, y: p2.y, pointId: p2.id, curve: true },
    ],
    state: "启用",
    end: "返航",
  });
  const saved = s.templates.find((x) => x.id === "TMP01")!;
  assert.equal(saved.mode, "自定义路线");
  assert.deepEqual(saved.points, [p1.id, p2.id], "执行点按画线吸附顺序落库");
  assert.equal(saved.state, "停用", "自定义路线保存后一律停用，待导航验证");
  assert.equal(saved.verified, false);
  // 停用中的自定义路线不能直接启用，必须先跑导航验证
  assert.throws(
    () => run(s, { type: "TOGGLE_TEMPLATE_STATE", id: "TMP01" }),
    /导航验证/,
  );

  // 错误口径：把定位点 id 当巡检点 id 提交（历史 bug）—— 引擎按 s.points 查不到即拦下
  assert.throws(
    () =>
      run(s0, {
        type: "SAVE_TEMPLATE",
        id: "TMP01",
        name: "自定义路线（误用定位点 id）",
        points: [p1.targetId, p2.targetId],
        mode: "自定义路线",
        path: [
          { x: p1.x, y: p1.y, pointId: p1.targetId },
          { x: p2.x, y: p2.y, pointId: p2.targetId },
        ],
        state: "启用",
        end: "返航",
      }),
    /所选巡检点不存在或已删除/,
  );
});

test("子线沿父线走：取路网最短路径，不连通时才回退直连", () => {
  const s = seed();
  const map = s.maps.find((x) => x.id === "MAP-A03")!;
  const paths = map.roadnet!.paths;
  const calib = s.mapCalibrations!.find((c) => c.mapId === map.id)!;
  const coord = (id: string) => {
    const t = calib.targets.find((x) => x.id === id);
    return t ? { x: t.x, y: t.y } : undefined;
  };

  // 同属 A_1 的两个点：必须经过中间的定位点，而不是两点直连
  const road = shortestRoadPath(paths, coord, "O101", "O103")!;
  assert.ok(road.length > 2, "应沿父线经过中间定位点");
  assert.equal(road[0], "O101");
  assert.equal(road[road.length - 1], "O103");
  // 无向图：反向路径即正向的反转
  assert.deepEqual(shortestRoadPath(paths, coord, "O103", "O101"), [
    ...road,
  ].reverse());
  // 东侧支线已自主线东端 O106 接出：两点之间能沿路网到达
  const east = shortestRoadPath(paths, coord, "O106", "O212")!;
  assert.equal(east[0], "O106");
  assert.equal(east[east.length - 1], "O212");
  // 只有真正断开的支线才回退直连：人为摘掉东侧支线后应取不到路径
  assert.equal(
    shortestRoadPath(
      paths.filter((v) => v.id !== "RA-01"),
      coord,
      "O106",
      "O212",
    ),
    null,
  );
  // 起终点相同：无需寻路
  assert.deepEqual(shortestRoadPath(paths, coord, "O101", "O101"), ["O101"]);
});

test("父线是单一连通块（有孤立段时子线只能直连）", () => {
  const s = seed();
  for (const m of s.maps) {
    const ids = new Set(targetsOf(s, m.id).map((t) => t.id));
    /** 无向邻接表：把每条线 / 弧的相邻点连起来（只算本图存在的点） */
    const adj = new Map<string, Set<string>>();
    for (const p of m.roadnet?.paths || []) {
      const ok = p.pointIds.filter((id) => ids.has(id));
      for (let i = 1; i < ok.length; i++) {
        if (!adj.has(ok[i - 1])) adj.set(ok[i - 1], new Set());
        adj.get(ok[i - 1])!.add(ok[i]);
        if (!adj.has(ok[i])) adj.set(ok[i], new Set());
        adj.get(ok[i])!.add(ok[i - 1]);
      }
    }
    const nodes = [...adj.keys()];
    if (nodes.length < 2) continue;
    // 从任一节点出发遍历，应能覆盖全部节点
    const seen = new Set<string>();
    const stack = [nodes[0]];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const n of adj.get(cur) || []) if (!seen.has(n)) stack.push(n);
    }
    assert.equal(
      seen.size,
      nodes.length,
      `${m.id} 的父线不是单一连通块：${nodes.length - seen.size} 个定位点不可达`,
    );
  }
});

test("父线只引用本图存在的定位点（否则预览里会静默断线）", () => {
  const s = seed();
  for (const m of s.maps) {
    const ids = new Set(targetsOf(s, m.id).map((t) => t.id));
    for (const path of m.roadnet?.paths || [])
      for (const id of path.pointIds)
        assert.ok(ids.has(id), `${m.id} 的父线引用了不存在的定位点 ${id}`);
  }
});

test("装置区的点与设备都归装置区地图，不会混进罐区（跨区不可执行）", () => {
  const s = seed();
  const mB = s.maps.find((m) => m.id === "MAP-B01")!;
  assert.equal(mB.region, "装置区");
  // R03 与装置区轨道段都引用这张图：地图必须存在且派生同步状态为「已同步」
  assert.equal(publishStateOf(s, mB), "已同步");
  for (const id of ["P007", "P010"]) {
    const p = s.points.find((x) => x.id === id)!;
    assert.equal(p.mapId, "MAP-B01", `${id} 应挂在装置区地图`);
    // 绑定的标定点必须在该图的标定文件里，否则地图上根本点不出来
    assert.ok(
      targetsOf(s, "MAP-B01").some((t) => t.id === p.targetId),
      `${id} 的标定点应在装置区地图标定数据中`,
    );
  }
  // 装置区设备的厂区列必须是装置区，否则覆盖率分母会把它们算进罐区
  for (const id of ["DEV-PLA", "DEV-PLB"]) {
    assert.equal(s.devices!.find((d) => d.id === id)!.region, "装置区");
  }
});
