# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库定位

DineBox 扫码点餐系统 v1（最小可用版｜局域网 ESC/POS 打印）。仅堂食扫码点餐、线下前台结算，不做线上支付、外卖、后厨划菜与多门店。

- `docs/`：功能清单、功能设计说明、顾客 H5 / 商家端原型、MySQL 数据库设计，是需求与口径的源头。
- `scripts/`：Docker Compose 编排、初始化 SQL、演示数据生成器。
- `manage.ps1`：根目录运维入口（启动、日志、初始化、重置、开发模式）。
- `dinebox-monorepo/`：pnpm + Turborepo 工作区，包含 `apps/api`、`apps/web`（顾客 H5）、`apps/admin`（商家管理 + 收银合并端）与共享 `packages/*`。

管理端与收银端是同一个 `apps/admin` 项目，通过登录账号角色与后端菜单权限隔离；顾客 H5 独立部署，不共享登录态。

## 常用命令

```powershell
# 一键构建并启动全部容器（MySQL / Redis / RustFS / API / Web / Admin）
pwsh ./manage.ps1 up

# 只启动基础服务（推荐本地开发）
docker compose -f scripts/docker-compose.yml up -d --wait mysql redis rustfs

# 应用日志、进入 MySQL、重建初始化数据、清空数据卷
pwsh ./manage.ps1 logs -Target api -Follow
pwsh ./manage.ps1 cli
pwsh ./manage.ps1 init            # 删除业务库并重跑 01-schema.sql + 02-demo-data.sql
pwsh ./manage.ps1 reset -Force    # 删除全部数据卷（MySQL / Redis / RustFS）

# 本机三端热更新（需先启动基础服务）
cd dinebox-monorepo
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev:api        # http://localhost:3100
pnpm dev:web        # http://localhost:3001
pnpm dev:admin      # http://localhost:3002

# 质量检查（当前没有单元测试套件，依赖 typecheck + build + 真实接口联调）
pnpm typecheck
pnpm build
pnpm lint
```

容器端口刻意避开常见项目：MySQL `3307`、Redis `6380`、RustFS `9100/9101`、API `3100`、顾客 H5 `8090`、商家端 `8091`。

演示账号（仅本地种子数据）：`admin / 123456`（管理员）、`cashier01 / 123456`（收银员）。

## 运行时与配置

- API 环境变量：`apps/api/.env`（参考 `.env.example`）。容器环境变量集中在 `scripts/docker-compose.yml`，可写入 `scripts/.env`。
- 顾客 H5 与商家端开发代理都指向 `http://127.0.0.1:3100`；容器内分别通过 Next rewrites / Nginx 代理到 `api:3100`。
- `H5_PUBLIC_URL` 决定后台二维码链接（`${H5_PUBLIC_URL}/?tk=<qr_token>`）。`manage.ps1 up / dev` 会自动检测本机局域网 IPv4 并写入 `scripts/.env`（`dev` 同时同步 `apps/api/.env`）；如识别不对，手动修改后执行 `pwsh ./manage.ps1 up -Target api` 重建 API 容器。`localhost` 只能本机打开。
- 打印机为内网 RAW TCP 9100 / ESC/POS；API 与打印机需同网段，打印机应在路由器绑定静态 IP。API 以异步短连接打印，打印失败只写 `print_log`，不阻塞下单 / 结算。
- RustFS 保存菜品图片；未配置 `S3_PUBLIC_URL` 时图片通过 `/api/files/:key` 代理读取（仅放行 `dishes/` 前缀）。

## 架构

### API（`apps/api`）

Hono + `@hono/zod-openapi`，统一响应 `{ code, message, data }`，分页 `{ list, total, page, pageSize, totalPages }`。OpenAPI 文档由 `createRoute` 自动汇总（`/api/docs`、`/api/openapi.json`）。

分层约定：

| 层 | 位置 | 职责 |
|---|---|---|
| routes | `src/routes/` | `createRoute` 声明校验 / 响应 / 中间件，`security` 与鉴权写在路由声明中 |
| controllers | `src/controllers/` | 解析上下文（当前操作人、IP）并调用服务，不做 SQL |
| services | `src/services/` | 业务规则、事务编排、缓存失效、操作日志 |
| sql | `src/sql/` | **所有手写 SQL 的唯一位置**；返回 `{ sql, params }` 并由服务执行 |
| db | `src/db/`、`packages/db` | Drizzle 查询构建器 + mysql2 参数化查询 / 事务 / 健康检查 |
| openapi | `src/openapi/` | 公共响应 / 错误模型与路由工厂 |

数据库规则（重要）：

- **简单增删改查优先使用 Drizzle**（`dbClient.db.select/insert/update/delete`），不要为此手写 SQL。
- **复杂联查、聚合、批量 IN、`FOR UPDATE` 事务**才手写参数化 SQL，且必须放在 `apps/api/src/sql/*.sql.ts`，禁止把 SQL 字符串内联在 service / controller / route 中。
- Drizzle schema 位于 `packages/db/src/schema/`，映射 20 张表；它负责表结构类型，业务查询仍以参数化 SQL 为主。
- `DatabaseClient.transaction` 内的语句必须使用回调传入的 `conn`；`dbClient.db.transaction` 使用 Drizzle 事务。两者不要混用同一事务。

鉴权与菜单权限：

- JWT 只携带 `userId`，每次请求回查 `sys_user` 与角色菜单；账号禁用立即失效。
- `requireMenu(code)`：管理员放行，收银员必须在该角色的 `sys_role_menu` 中配置相应菜单。
- 操作日志（`audit`）与系统设置（`settings`）为管理员专属，收银员菜单不可下放。
- 最终权限以接口鉴权为准，前端菜单过滤只是体验层。

订单与金额口径：

- 状态：`PENDING` / `SETTLED` / `CANCELLED`；挂单是 `PENDING + hung_flag=1` 的暂存态。
- 改单 / 退菜 / 挂单 / 取消只允许 `PENDING`；结算只允许非挂单的 `PENDING`；已结清 / 已取消只读。
- 金额单位统一为元，数据库 `DECIMAL(10,2)`，计算统一 `round2`；明细单价 = 菜品基础价 + 规格差价 + 加料合计，明细小计 = 单价 × 数量，订单合计只计 `NORMAL` 明细。
- 抹零仅在结算时按 `sys_config.round_off_rule` 计算并落库：`total_amount - round_off_amount = payable_amount`。
- 订单明细 / 加料保存名称、规格文本、单价快照，菜品后续改价或删除不影响历史订单。
- 同桌可同时存在多笔未结订单（多人扫码），收银台按桌合并展示、逐单结算。
- 桌台实时状态（空闲 / 待结算 / 挂单）由未结订单实时推导，不落库。
- 订单号在插入取得自增 ID 后生成：`DB + yyyyMMdd + 补零 ID`。

打印：

- `@dinebox/print` 封装 `node-thermal-printer`：模板渲染 → GBK 编码（`FS &` 进入中文模式）→ TCP 9100 发送 → 切纸。
- 打印触发：顾客下单 → 后厨单；改单 → 后厨单重打；结算 → 结账单；失败可在打印日志重试。
- 模板占位变量与 `@dinebox/types` 的 `PRINT_TEMPLATE_VARS` 保持一致。

### 顾客 H5（`apps/web`）

Next.js App Router + React 19 + SWR。单页客户端状态串联「入座 → 点餐 → 购物车 → 订单确认 → 下单成功 → 本桌订单」。

- 桌号只来自 URL `?tk=<qr_token>`，顾客端不可修改；接口按桌台令牌校验。
- 「本桌订单」按桌台**本次就餐会话**过滤：同桌顾客共享同一会话，可多人分别下单；最后一批待结算订单结清/取消后，结算/取消事务会自动轮换桌台 `session_token`，下一桌扫描进入新会话，不会看到上一桌订单。
- 购物车按桌台存入 `sessionStorage`；下单成功后清空。
- 菜品 / 规格 / 加料价格在前端仅用于展示，最终由后端按数据库当前配置重新计价并快照。
- 视觉样式从原型提取到 `src/app/globals.css`，组件类名与原型一致。

### 商家端（`apps/admin`）

React 19 + Vite + React Router + SWR + Zustand，浅色黑白灰视觉，桌面优先。

- 登录态存 `dinebox_admin_token`（记住我用 localStorage，否则 sessionStorage）；`lib/auth.tsx` 负责会话恢复、401 清理与 SWR 全量刷新。
- 路由与菜单编码一一对应：`cashier / dishes / tables / printer / orders / reports / audit / settings`（见 `lib/menu.ts`）。`MenuGuard` 做前端兜底，服务端 `requireMenu` 才是最终权限。
- 收银台：桌台卡片 → 桌台内多笔未结订单 chip → 单笔订单详情与结算；改单 / 退菜使用 `components/cashier/` 下的弹窗。
- 列表页统一遵循原型：筛选栏即时筛选、结果摘要、重置、服务端或客户端分页、自绘 Modal / Confirm / Prompt，不使用浏览器原生 `alert/confirm/prompt`。
- 管理端二维码由 `qrcode` 库在浏览器生成，链接来自后端 `qrLink`。

## 文档与数据库同步

- `docs/扫码点餐系统-数据库设计-v1.sql` 是设计源；`scripts/init/01-schema.sql` 是可执行副本（含 bcrypt 种子与演示打印机）。修改表结构时必须同步两处。
- `scripts/init/02-demo-data.sql` 由 `scripts/generate-demo-data.mjs` 生成，禁止手工修改；调整演示数据结构后重新运行生成器。
- 修改业务规则或字段时，同步更新对应功能清单 / 功能设计说明；两个原型只作视觉与交互参考，实际行为以代码为准。

## UI 约定

- 系统品牌图标统一为黑底圆角方块 + 白色「希」字（favicon、入口页、侧边栏、登录页、加载页），不再使用碗筷 / 咖啡等图形图标。
- 页面中不展示演示账号、默认密码、原型提示等演示信息；初始账号仅保留在仓库文档中。
- 管理端为中文界面；空态、错误提示、确认文案遵循原型口径。价格使用价格红点缀，其余保持黑白灰。
- 顾客 H5 移动端优先，430px 手机画布；管理端桌面优先（≥1280px），收银台需兼容平板横屏。
- 视觉样式来自 `docs/` 原型中提取的 CSS，新增组件优先复用已有类名（`.card`、`.btn`、`.filter-bar`、`.modal-*`、`.table-card` 等）。

## Git 约定

直接在 `main` 分支提交，不新建功能分支。提交信息使用中文：文档以 `docs:` 开头，代码以 `feat:` / `fix:` / `chore:` 开头。大型任务按模块或阶段提交，不要等全部完成后再一次性提交。
