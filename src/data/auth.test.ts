import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNTS, authenticate, isSuper } from "./auth";
import { TENANTS } from "./tenants";

test("账号：1 个超级管理员 + 2 个租户管理员，登录名唯一且都有密码", () => {
  assert.equal(ACCOUNTS.filter((a) => a.level === "super").length, 1);
  assert.equal(ACCOUNTS.filter((a) => a.level === "tenant").length, 2);
  assert.equal(
    new Set(ACCOUNTS.map((a) => a.username.toLowerCase())).size,
    ACCOUNTS.length,
  );
  for (const a of ACCOUNTS) {
    assert.ok(a.username.trim(), "登录名不能为空");
    assert.ok(a.password.length >= 6, "密码长度至少 6 位");
    assert.ok(a.name && a.title, "姓名与岗位都要有");
  }
});

test("租户管理员：各自绑定一个租户，与租户清单一一对应", () => {
  const tenants = ACCOUNTS.filter((a) => a.level === "tenant");
  assert.deepEqual(
    tenants.map((a) => a.tenantId),
    TENANTS.map((t) => t.id),
  );
  // 超级管理员不绑定租户（可跨租户）
  assert.equal(
    ACCOUNTS.filter((a) => a.level === "super").every((a) => !a.tenantId),
    true,
  );
});

test("登录校验：账号大小写 / 空格不敏感，密码严格匹配", () => {
  assert.equal(authenticate("superadmin", "Super@2026")?.id, "A-SUPER");
  assert.equal(authenticate("  SUPERADMIN  ", "Super@2026")?.id, "A-SUPER");
  assert.equal(authenticate("hd.admin", "Hd@2026")?.id, "A-HD");
  assert.equal(authenticate("xb.admin", "Xb@2026")?.id, "A-XB");
  assert.equal(authenticate("hd.admin", "hd@2026"), null);
  assert.equal(authenticate("hd.admin", "Xb@2026"), null);
  assert.equal(authenticate("", ""), null);
  assert.equal(authenticate("nobody", "Super@2026"), null);
});

test("级别判定：只有超级管理员可跨租户 / 见租户管理页", () => {
  assert.equal(isSuper(authenticate("superadmin", "Super@2026")), true);
  assert.equal(isSuper(authenticate("hd.admin", "Hd@2026")), false);
  assert.equal(isSuper(authenticate("xb.admin", "Xb@2026")), false);
  assert.equal(isSuper(null), false);
});
