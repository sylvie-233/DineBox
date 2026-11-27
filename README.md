# DineBox · 扫码点餐

堂食扫码点餐系统 v1（局域网 ESC/POS 打印）。顾客扫桌台二维码点餐，后厨自动打小票；顾客到前台报桌号，收银员改单 / 退菜 / 挂单 / 结算并打印结账单；管理员维护菜品、桌台、打印机、账号与查看报表、操作日志。

不做线上支付、外卖、会员营销、后厨划菜与多门店。

## 功能

- **顾客 H5**：桌号由二维码锁定、分类点餐、搜索、规格差价、加料限选、购物车改规格、整单备注、下单成功提示与「本桌订单」（同桌共享当前就餐会话，结清后自动换新）。
- **收银台**：按区域展示桌台实时状态（空闲 / 待结算 / 挂单）、同桌多单、订单检索、改单、单品退菜、挂单 / 恢复、整单取消、抹零与四种线下结算方式。
- **商家后台**：菜品 / 分类 / 规格 / 加料管理、桌台与区域、单桌 / 批量二维码、打印配置与 ESC/POS 模板、打印日志重打、订单流水 Excel 导出、经营报表、操作日志、账号与角色菜单权限。
- **局域网打印**：`node-thermal-printer` 生成 ESC/POS 指令，TCP 短连接直连打印机 `IP:9100`，中文 GBK；打印失败只记日志，不阻塞订单。

## 技术栈

- **API**：Node.js、Hono、`@hono/zod-openapi`、Zod、MySQL 8（mysql2 + Drizzle）、Redis（缓存 / 限流）、RustFS（S3 兼容，菜品图片）、`node-thermal-printer`。
- **顾客 H5**：Next.js 15 App Router、React 19、SWR、Tailwind CSS v4。
- **商家端**：React 19、Vite、React Router、SWR、Zustand、Tailwind CSS v4、`qrcode`。
- **工程**：pnpm workspace + Turborepo、TypeScript、ESLint、Docker Compose。

## 快速开始

推荐在仓库根目录使用 PowerShell 7+：

```powershell
pwsh ./manage.ps1 up                  # 构建并启动全部容器并等待健康检查
pwsh ./manage.ps1 status              # 查看状态与访问地址
pwsh ./manage.ps1 logs -Target api -Follow
pwsh ./manage.ps1 init                # 重建数据库与演示数据
pwsh ./manage.ps1 reset -Force        # 清空数据卷后重建
pwsh ./manage.ps1 down                # 停止容器（保留数据卷）
```

访问地址：

| 端 | 地址 |
|---|---|
| 顾客 H5 | <http://localhost:8090/?tk=tk_a1x9k2m4>（示例桌台 A-01） |
| 商家管理 / 收银 | <http://localhost:8091> |
| API | <http://localhost:3100>（文档 `/api/docs`，健康检查 `/health`） |
| RustFS 控制台 | <http://localhost:9101> |
| MySQL | `localhost:3307`（库 `dinebox`，账号 `dinebox` / `123456`） |
| Redis | `localhost:6380` |

本地演示账号（种子数据）：

| 账号 | 角色 | 密码 |
|---|---|---|
| `admin` | 管理员 | `123456` |
| `cashier01` | 收银员 | `123456` |

> `manage.ps1 up` 会自动检测本机局域网 IPv4 并写入 `scripts/.env` 的 `H5_PUBLIC_URL`，后台二维码链接使用该地址（如 `http://192.168.1.10:8090`）。如自动识别不正确，手动修改后执行 `pwsh ./manage.ps1 up -Target api` 重建 API 容器以加载新地址。手机需与门店主机处于同一局域网。

本地热更新开发（仅用容器跑 MySQL / Redis / RustFS）：

```powershell
docker compose -f scripts/docker-compose.yml up -d --wait mysql redis rustfs
cd dinebox-monorepo
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev:api        # http://localhost:3100
pnpm dev:web        # http://localhost:3001
pnpm dev:admin      # http://localhost:3002
```

或使用 `pwsh ./manage.ps1 dev`。

质量检查：

```powershell
cd dinebox-monorepo
pnpm typecheck
pnpm build
pnpm lint
```

## 目录结构

```text
DineBox/
├── docs/                        # 功能清单、设计说明、原型、数据库设计
├── scripts/
│   ├── docker-compose.yml       # MySQL / Redis / RustFS / API / Web / Admin
│   ├── init/01-schema.sql       # 建表 + 种子（可执行副本）
│   ├── init/02-demo-data.sql    # 演示数据（由生成器产出）
│   └── generate-demo-data.mjs
├── manage.ps1                   # 启动 / 日志 / 初始化 / 重置 / 开发模式
├── CLAUDE.md
└── dinebox-monorepo/
    ├── apps/
    │   ├── api/                 # Hono API（routes → controllers → services → sql）
    │   ├── web/                 # 顾客扫码点餐 H5（Next.js）
    │   └── admin/               # 商家管理 + 收银合并端（React + Vite）
    └── packages/
        ├── types/               # 共享 DTO、枚举与展示常量
        ├── db/                  # Drizzle schema + mysql2 连接 / 事务封装
        ├── print/               # 小票排版、GBK 编码、TCP 9100 打印
        ├── storage/             # S3 / RustFS 对象存储
        ├── cache/               # 内存 / Redis 缓存与限流
        ├── logger/              # pino 日志
        ├── utils/               # 金额、日期、格式化纯函数
        └── ui/                  # 通用分页 / 浮层 Hook（后台少量组件）
```

## 打印与配网

- 打印机需支持 RAW TCP 9100 / ESC-POS，与部署 API 的主机处于同一局域网。
- 在 `scripts/docker-compose.yml` 的 API 服务上，容器需要能访问打印机网段；打印机建议在路由器绑定静态 IP。
- 后台「打印配置」中填写名称、IP、端口（默认 9100）与用途（后厨 / 结账单 / 通用），保存后点击「测试」验证。
- 模板占位变量：`{title}` `{table}` `{order_no}` `{time}` `{items}` `{note}` `{total}` `{off}` `{payable}` `{people}`。
- 打印为异步短连接；失败只写打印日志，可在日志中重打，不影响下单 / 结算。

## 文档

- [功能清单](docs/扫码点餐系统-功能清单-v1.md)
- [功能设计说明](docs/扫码点餐系统-功能设计说明-v1.md)
- [数据库设计](docs/扫码点餐系统-数据库设计-v1.sql)
- [顾客 H5 原型](docs/扫码点餐系统-顾客H5原型-v1.html)
- [商家端原型](docs/扫码点餐系统-admin管理端原型-v1.html)

## License

[MIT](LICENSE)
