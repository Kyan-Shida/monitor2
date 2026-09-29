import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run } from "./engine";
import { parse, href, parentOf, menuIdOf, pages } from "./navigation";

test("地图详情是内置页：路由可解析、返回与侧边栏高亮都回到地图列表", () => {
  // 不新增菜单项，只新增内置页（否则侧边栏会出现"地图详情"这一项）
  assert.ok(!pages.some((p) => p.id === "map-detail"));
  assert.equal(href("map-detail", "MAP-A03"), "#/robots/maps/detail/MAP-A03");
  const r = parse("#/robots/maps/detail/MAP-A03");
  assert.equal(r.page, "map-detail");
  assert.equal(r.id, "MAP-A03");
  // 详情页仍归属地图管理目录：返回上一级与菜单高亮都落在列表页
  assert.equal(parentOf("map-detail"), "maps");
  assert.equal(menuIdOf("map-detail"), "maps");
  // 深链带 tab：直达抽屉（地图下发 / 地图工作台）
  assert.equal(parse("#/robots/maps/detail/MAP-A03?tab=sync").tab, "sync");
  // 列表与详情不互相抢匹配（详情路径更长，优先匹配）
  assert.equal(parse("#/robots/maps/MAP-A03").page, "maps");
  assert.equal(parse("#/robots/maps").page, "maps");
});

test("地图点位区分来源：随地图导入的定位ID vs 平台新增", () => {
  let s = seed();
  const map = s.maps[0];
  assert.ok(map.targets.length > 0);
  for (const t of map.targets) {
    assert.equal(t.source, "地图导入");
    assert.ok(t.externalId, "地图自带的点位应带外部定位ID");
  }
  const before = map.targets.length;
  s = run(s, { type: "ADD_TARGET", mapId: map.id, x: 12, y: 34, kind: "仪表" });
  const added = s.maps[0].targets.at(-1)!;
  assert.equal(s.maps[0].targets.length, before + 1);
  assert.equal(added.source, "平台新增");
  assert.equal(added.externalId, undefined);
  assert.equal(added.state, "待确认");
});

test("地图工作台可继续新增轨迹采样点，序号按该地图递增", () => {
  let s = seed();
  const mapId = "MAP-A03";
  const before = (s.trackSamples || []).filter((x) => x.mapId === mapId);
  const maxSeq = Math.max(0, ...before.map((x) => x.seq));
  s = run(s, { type: "TRACK_RECORD", mapId, x: 40, y: 22, kind: "转弯点" });
  const after = (s.trackSamples || []).filter((x) => x.mapId === mapId);
  assert.equal(after.length, before.length + 1);
  const last = after.at(-1)!;
  assert.equal(last.seq, maxSeq + 1);
  assert.equal(last.kind, "转弯点");
});

test("地图下发支持多选设备批量下发；区域不匹配则整批不下发（不产生半截状态）", () => {
  let s = seed();
  const mapId = "MAP-A03";
  // 空选择：拒绝
  assert.throws(
    () => run(s, { type: "SYNC_BATCH", mapId, robotIds: [] }),
    /至少选择一台设备/,
  );
  // R03 属"装置区"，与地图区域不匹配 → 整批失败，且不留任何下发记录
  assert.throws(
    () => run(s, { type: "SYNC_BATCH", mapId, robotIds: ["R01", "R03"] }),
    /区域与地图不匹配/,
  );
  assert.equal(s.syncs.filter((x) => x.mapId === mapId).length, 0);
  // 全部匹配：一次登记多条"传输中"
  s = run(s, { type: "SYNC_BATCH", mapId, robotIds: ["R01", "R02"] });
  const batch = s.syncs.filter((x) => x.mapId === mapId);
  assert.equal(batch.length, 2);
  assert.deepEqual(
    batch.map((x) => x.robotId).sort(),
    ["R01", "R02"],
  );
  for (const x of batch) {
    assert.equal(x.state, "传输中");
    assert.equal(x.mapVersion, s.maps[0].version);
    assert.equal(x.pointSet, s.maps[0].pointSet);
  }
});

test("内容变更即回草稿；下发时自动定版（不存在试验版 / 正式版）", () => {
  let s = seed();
  assert.equal(s.maps[0].state, "已发布");
  s = run(s, {
    type: "SET_MAP_IMAGE",
    mapId: "MAP-A03",
    image: "data:image/svg+xml;charset=utf-8,%3Csvg/%3E",
  });
  s = run(s, { type: "ADD_TARGET", mapId: "MAP-A03", x: 50, y: 50, kind: "仪表" });
  // 新增点位会把地图打回草稿
  assert.equal(s.maps[0].state, "草稿");
  assert.ok(s.maps[0].history[0].includes("待重新发布"));
  // 下发即定版：不需要先点"发布"
  s = run(s, { type: "SYNC_BATCH", mapId: "MAP-A03", robotIds: ["R01"] });
  assert.equal(s.maps[0].state, "已发布");
  assert.ok(s.maps[0].history[0].includes("已发布"));
  assert.equal(s.syncs.filter((x) => x.mapId === "MAP-A03").length, 1);
  // 原始资料缺失的地图定不了版，也就下发不了
  s = run(s, {
    type: "IMPORT",
    name: "缺资料地图",
    file: "bare.map",
    source: "机器人",
  });
  const bare = s.maps[0];
  s = run(s, { type: "ADD_TARGET", mapId: bare.id, x: 10, y: 10, kind: "仪表" });
  assert.throws(
    () => run(s, { type: "SYNC_BATCH", mapId: bare.id, robotIds: ["R01"] }),
    /原始点云/,
  );
});
