# DailyHotHole 公开只读快照

这是每日热洞监控的公开静态版本。Clab 上的私有监控服务定时生成经过白名单过滤的 JSON，本地 Codex 自动化任务通过 SSH 只下载这份脱敏文件并推送到本仓库；Vercel 连接 GitHub 后自动部署 `public/` 中的静态 HTML、CSS、JavaScript 和快照文件。

公开站点没有登录、设置、刷新、回填或导出接口。管理服务继续只监听 Clab 的 `127.0.0.1:8766`，必须通过 SSH 隧道访问。

## 公开范围

生成器只发布：

- 最近 10 天；
- 每天严格 10 条未删除、未隐藏、未受保护且含文字的热榜树洞；
- 每条树洞最新 500 条未隐藏评论；
- 树洞编号、正文、时间、点赞/评论/热度统计；
- 评论编号、正文、时间、引用关系以及是否为洞主。

以下内容不会进入公开快照：

- 监控设置、扫描状态、错误详情和任何登录凭据；
- 身份信息、专属标识、媒体 ID、图片和媒体 URL；
- 已删除、隐藏或受保护的内容；
- Clab SSH 密钥和 GitHub 凭据。

Clab 内部快照接口会提供最多 50 条候选树洞，生成器完成隐私过滤后再按热度取前 10 条。因此某条 Top 10 在扫描后被删除时，会用下一条安全候选补足；严格校验会阻止少于 10 条的日期被发布。

## Vercel 自动部署

在 Vercel 中导入 GitHub 仓库 `Rainier-Gu/DailyHotHole`。仓库根目录的 `vercel.json` 已配置：

- 输出目录：`public`；
- 无构建命令、无服务端函数；
- 静态安全响应头、CSP 和缓存策略；
- 禁止搜索引擎索引。

Vercel 项目中保持 Framework Preset 为 `Other`，Root Directory 留空即可。生产分支选择 `main`；之后每次自动化任务向 `main` 推送新快照，Vercel 都会通过 Git 集成自动部署。旧平台专用的 Analytics 注入、`_headers` 和站点构建脚本已删除。

## 自动更新链路

Clab 无法直接访问 GitHub 的 SSH 或 HTTPS 入口，因此采用两段式任务，避免在 Clab 中保存 GitHub Token：

- Clab 的 `dailyhothole-generate.timer` 每两小时生成 `/opt/dailyhothole-public/export/snapshot.json`；
- 本地 Codex 自动化任务运行 `scripts/publish_from_windows.ps1`，只下载脱敏文件；
- PowerShell 脚本再次验证隐私字段、最近 10 天和每天 10 条约束，然后提交并推送 `public/data/snapshot.json`；
- Vercel 监听 GitHub `main` 分支并自动部署。

本地任务需要电脑开机、Codex 可运行，而且当前网络能够 SSH 访问 Clab（校园网或相应 VPN）。GitHub 登录使用当前 Windows 用户的 Git 凭据，不会写入脚本。

常用 Clab 维护命令：

```bash
sudo systemctl status dailyhothole-generate.timer
sudo systemctl status dailyhothole-generate.service
sudo systemctl start dailyhothole-generate.service
sudo journalctl -u dailyhothole-generate.service -n 100 --no-pager
systemctl list-timers dailyhothole-generate.timer
```

暂停公开快照更新：

```bash
sudo systemctl disable --now dailyhothole-generate.timer
```

恢复更新：

```bash
sudo systemctl enable --now dailyhothole-generate.timer
```

## 本地验证

```bash
python -m unittest discover -s tests -v
python scripts/validate_public_snapshot.py public/data/snapshot.json
python -m http.server 8000 --directory public
```

打开 `http://127.0.0.1:8000/`。生成器也可以读取本地导出的私有状态，但输出文件必须是 `public/data/snapshot.json`，不要提交原始状态文件：

```bash
python scripts/generate_snapshot.py --source private-state.json --output public/data/snapshot.json --require-full-top-n
```

## 安全说明

- 页面使用 DOM `textContent` 渲染用户文本，不执行树洞内容中的 HTML；
- `vercel.json` 为 Vercel 配置 CSP、禁止嵌入和 `noindex`；
- 静态 JSON 使用白名单模型重新构建，不复制原 API 对象；
- GitHub Actions 会验证生成器、快照边界、Vercel 配置和管理接口关键字；
- 删除公开页面时，应同时停用 Clab timer、停用本地 Codex 自动化任务，并在 Vercel 中删除或断开项目。
