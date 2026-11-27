# ESC/POS 虚拟打印机

把真实的 ESC/POS 打印任务接进来，解析指令，在浏览器里模拟出一张热敏小票。

它不是静态 UI：页面上的每一张票都来自真实字节，既可以走 RAW TCP 9100，也可以走 HTTP 上传，还可以直接粘贴 HEX 或文本。

## 启动

```powershell
# 在 dinebox-monorepo 根目录
pnpm install
pnpm dev:escpos        # 控制台 http://localhost:3003，虚拟打印机 TCP 9102
```

生产构建：

```powershell
pnpm --filter @dinebox/escpos build
pnpm --filter @dinebox/escpos start   # 控制台 http://localhost:3200
```

也可以随 DineBox 容器一起启动：

```powershell
pwsh ./manage.ps1 up -Target escpos
# 控制台 http://localhost:8092，虚拟打印机 TCP 9102
```

## 接入真实打印任务

在商家端「打印配置」新增或编辑打印机：

- IP：运行模拟器主机的局域网 IP（页面「接入地址」会直接给出）
- 端口：`9102`（Docker/本地默认）；页面会显示当前实际值
- 用途：后厨小票 / 结账单 / 通用均可

商家端下单、改单、结算后，浏览器会通过 SSE 实时收到任务并自动出票。

## HTTP API

```powershell
# 健康检查
curl http://127.0.0.1:3200/api/health

# 发送原始 ESC/POS 字节（application/octet-stream）
curl -X POST --data-binary "@receipt.bin" "http://127.0.0.1:3200/api/jobs?encoding=gbk"

# 发送 base64 JSON
curl -X POST http://127.0.0.1:3200/api/jobs `
  -H "Content-Type: application/json" `
  -d '{"data":"G0AcJg==","encoding":"gbk"}'

# 只解析、不生成任务
curl -X POST --data-binary "@receipt.bin" "http://127.0.0.1:3200/api/parse?encoding=gbk"

# 用纯文本生成一张最小小票（自动补初始化、中文模式、走纸与切纸）
curl -X POST http://127.0.0.1:3200/api/jobs/text `
  -H "Content-Type: application/json" `
  -d '{"text":"【测试】\nHello ESC/POS\n","encoding":"gbk"}'

# 内置示例：kitchen / bill / showcase
curl -X POST http://127.0.0.1:3200/api/samples/showcase

# 任务列表 / 详情 / 清空
curl http://127.0.0.1:3200/api/jobs
curl http://127.0.0.1:3200/api/jobs/<id>
curl -X DELETE http://127.0.0.1:3200/api/jobs

# SSE 实时事件
curl -N http://127.0.0.1:3200/api/events
```

`encoding` 支持 `gbk`、`utf8`、`cp437`、`cp850`、`latin1`，默认 `gbk`（与 DineBox 打印层一致）。

## 已解析的指令

文本样式：`ESC @`、`ESC a`、`ESC E`、`ESC -`、`ESC !`、`ESC M`、`ESC SP`、`ESC 2/3`、`GS !`、`GS B`、`FS &`、`FS .`、`FS -`

纸张与布局：`LF`、`CR`、`HT`、`ESC d`、`ESC J`、`ESC $`、`ESC \`、`ESC D`、`ESC *`、`GS v 0`

切纸与外设：`ESC i`、`ESC m`、`GS V`、`ESC p`（钱箱）

条码与二维码：`GS h`、`GS w`、`GS H`、`GS f`、`GS k`、`GS ( k`

未知指令会按已知长度或 2 字节跳过，记录在「指令解析」里，不中断整张票的解析。

## 结构

```
src/
├── parser/parser.ts     # 字节 → 指令 token → PrintOp
├── parser/samples.ts    # 内置示例与纯文本小票构造
├── renderer/            # Canvas 点阵布局与小票渲染
├── server/              # Hono HTTP + SSE + net TCP 虚拟打印机
├── lib/api.ts           # 前端 API
└── App.tsx              # 四视图控制台
```

## 注意

- 任务只保存在内存，最多 50 条，服务重启即清空。
- 单任务上限 1 MB；HEX 视图与指令表只展示前 8192 字节 / 1200 条，其余可下载 `.bin`。
- 不做鉴权，定位是店内或开发调试工具；不要把 TCP 端口暴露到公网。
- 默认 TCP 端口是 `9102`，因为本项目 RustFS 占用了宿主机 `9100`；可通过 `ESC_POS_TCP_PORT` 改回 `9100`。
