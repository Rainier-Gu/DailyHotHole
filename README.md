# DailyHotHole 公开只读快照

这是每日热洞监控的公开静态版本。Clab 上的私有监控服务定时生成经过白名单过滤的 JSON，推送到本仓库；Cloudflare Pages 只托管静态 HTML、CSS、JavaScript 和快照文件。

公开站点没有登录、设置、刷新、回填或导出接口。管理服务继续只监听 Clab 的 `127.0.0.1:8766`，必须通过 SSH 隧道访问。

## 公开范围

生成器默认只发布：

- 最近 30 天；
- 每天前 10 条未删除、未隐藏、未受保护且含文字的帖子；
- 每条帖子最新 500 条未隐藏评论；
- 帖子编号、正文、时间、点赞/评论/热度统计；
- 评论编号、正文、时间、引用关系以及是否为洞主。

以下内容不会进入公开快照：

- 监控设置、扫描状态、错误详情和任何登录凭据；
- 身份信息、专属标识、媒体 ID、图片和媒体 URL；
- 已删除、隐藏或受保护的内容；
- Clab SSH 密钥和 GitHub Deploy Key。

公开策略可以在 `dailyhothole-snapshot.service` 的环境变量中调整。生成结果超过 20 MiB 时任务会失败并保留上一版快照，避免超过 Cloudflare Pages 单文件限制。

## Cloudflare Pages 配置

在 Cloudflare Dashboard 中连接 `Rainier-Gu/DailyHotHole`，使用以下配置：

| 项目 | 值 |
| --- | --- |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `python3 scripts/build_site.py` |
| Build output directory | `dist` |
| Root directory | `/`（留空即可） |

每次 Clab 推送快照后，Pages 会自动重新构建。当前定时器每两小时最多推送一次，约 360 次/月，为 Cloudflare Pages 免费套餐的 500 次/月构建额度保留了手动发布空间。

### Cloudflare Web Analytics

推荐使用 Pages 的自动注入功能：打开 **Workers & Pages → 你的项目 → Metrics → Web Analytics → Enable**。下一次部署时 Cloudflare 会自动注入 beacon；本项目的 CSP 已允许该脚本与 RUM 上报地址。

如果选择手动 beacon，不要同时开启自动注入。在 Pages 项目的环境变量中添加：

```text
CF_WEB_ANALYTICS_TOKEN=<Cloudflare 提供的站点 Token>
```

构建脚本会把 token 写入最终的 `dist/index.html`，但不会改动或提交仓库源文件。不要把 token 直接提交到 GitHub。

## Clab 自动任务

已安装的 systemd 单元：

- `dailyhothole-snapshot.timer`：开机十分钟后运行，并在每个双数小时定时触发；
- `dailyhothole-snapshot.service`：读取 `http://127.0.0.1:8766/api/state`、脱敏、提交并推送；
- `/opt/dailyhothole-public/ssh/github-deploy-key`：仅用于向本仓库写入的 Deploy Key。

常用维护命令：

```bash
sudo systemctl status dailyhothole-snapshot.timer
sudo systemctl status dailyhothole-snapshot.service
sudo systemctl start dailyhothole-snapshot.service
sudo journalctl -u dailyhothole-snapshot.service -n 100 --no-pager
systemctl list-timers dailyhothole-snapshot.timer
```

暂停公开快照更新：

```bash
sudo systemctl disable --now dailyhothole-snapshot.timer
```

恢复更新：

```bash
sudo systemctl enable --now dailyhothole-snapshot.timer
```

## 本地验证

```bash
python3 -m unittest discover -s tests -v
python3 scripts/build_site.py
python3 -m http.server 8000 --directory dist
```

打开 `http://127.0.0.1:8000/`。生成器也可以读取本地导出的私有状态，但输出文件必须是 `public/data/snapshot.json`，不要提交原始状态文件：

```bash
python3 scripts/generate_snapshot.py --source private-state.json --output public/data/snapshot.json
```

## 安全说明

- 页面使用 DOM `textContent` 渲染用户文本，不执行树洞内容中的 HTML；
- `_headers` 为 Pages 配置 CSP、禁止嵌入和 `noindex`；
- 静态 JSON 使用白名单模型重新构建，不复制原 API 对象；
- GitHub Actions 会验证生成器、构建结果和管理接口关键字；
- 删除公开页面时，应同时停用 timer、撤销仓库 Deploy Key，并在 Cloudflare Pages 中删除或断开项目。
