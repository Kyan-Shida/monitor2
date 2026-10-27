import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNTS,
  authenticate,
  checkAccount,
  isSuper,
  loadAccounts,
  makeTenantAdmin,
  noAccountError,
  tenantAdminOf,
  updateAccount,
} from "./auth";
import { TENANTS } from "./tenants";

test("账号：1 个超级管理员 + 2 个普通管理员，登录名唯一且都有密码", () => {
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

test("普通管理员：各自绑定一个租户，与租户清单一一对应", () => {
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

test("账号库：无存储时回落到内置演示账号", () => {
  // node 环境没有 localStorage：loadAccounts 必须兜底而不是抛错
  const list = loadAccounts();
  assert.equal(list.length, ACCOUNTS.length);
  assert.deepEqual(
    list.map((a) => a.id),
    ACCOUNTS.map((a) => a.id),
  );
  // 返回副本：改动不会污染内置常量
  list[0].name = "改名";
  assert.equal(ACCOUNTS[0].name, "Admin");
});

test("开通租户建号：姓名 / 账号 / 密码逐项校验", () => {
  const ok = { username: "hn.admin", password: "Hn@2026x", name: "陈工" };
  assert.equal(noAccountError(checkAccount(ok, ACCOUNTS)), true);

  assert.match(checkAccount({ ...ok, name: "  " }, ACCOUNTS).name!, /姓名/);
  assert.match(checkAccount({ ...ok, username: "" }, ACCOUNTS).username!, /登录账号/);
  // 字母开头，3–20 位
  assert.match(checkAccount({ ...ok, username: "1hn" }, ACCOUNTS).username!, /字母开头/);
  assert.match(checkAccount({ ...ok, username: "hn" }, ACCOUNTS).username!, /字母开头/);
  // 登录名唯一（大小写不敏感）
  assert.match(checkAccount({ ...ok, username: "HD.Admin" }, ACCOUNTS).username!, /已被占用/);
  // 密码至少 8 位且含字母与数字
  assert.match(checkAccount({ ...ok, password: "Ab1" }, ACCOUNTS).password!, /至少 8 位/);
  assert.match(checkAccount({ ...ok, password: "12345678" }, ACCOUNTS).password!, /字母与数字/);
  assert.match(checkAccount({ ...ok, password: "" }, ACCOUNTS).password!, /初始密码/);
});

test("开通租户建号：生成绑定该租户的管理员账号", () => {
  const tenant = {
    id: "T-HN",
    name: "华南石化",
    code: "HN",
    customerId: "C-DEFAULT",
    status: "启用" as const,
  };
  const admin = makeTenantAdmin(tenant, {
    username: " hn.admin ",
    password: "Hn@2026x",
    name: " 陈工 ",
  });
  assert.equal(admin.id, "A-T-HN");
  assert.equal(admin.username, "hn.admin");
  assert.equal(admin.name, "陈工");
  assert.equal(admin.title, "华南石化 · 厂区管理员");
  assert.equal(admin.tenantId, "T-HN");
  assert.equal(admin.level, "tenant");
  // 租户管理员默认拿管理员档位，进不了别的租户
  assert.equal(admin.roleId, "admin");
  assert.equal(isSuper(admin), false);
  // 建号后能按租户反查到管理员（租户管理列表的管理员列）
  assert.equal(tenantAdminOf([...ACCOUNTS, admin], "T-HN")?.username, "hn.admin");
  assert.equal(tenantAdminOf(ACCOUNTS, "T-NONE"), undefined);
});

test("编辑租户改管理员：排除自身查重、密码留空沿用原密码", () => {
  const editSelf = { selfId: "A-HD", passwordOptional: true };
  // 保留自己的登录名不算重名
  assert.equal(
    noAccountError(
      checkAccount(
        { username: "hd.admin", password: "", name: "李工" },
        ACCOUNTS,
        editSelf,
      ),
    ),
    true,
  );
  // 但换成别人的登录名仍要拦下
  assert.match(
    checkAccount(
      { username: "xb.admin", password: "", name: "李工" },
      ACCOUNTS,
      editSelf,
    ).username!,
    /已被占用/,
  );
  // 填了新密码就按强度校验
  assert.match(
    checkAccount(
      { username: "hd.admin", password: "12345678", name: "李工" },
      ACCOUNTS,
      editSelf,
    ).password!,
    /字母与数字/,
  );
  // 账号不存在时改号返回 false（不会凭空造账号）
  assert.equal(updateAccount("A-NONE", { username: "x.y", password: "Abc12345", name: "无名" }), false);
});
