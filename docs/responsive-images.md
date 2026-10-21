# 响应式图片与历史资源补齐

文章继续引用原图 URL。派生 WebP 与每图 `.qz-image.json` 只是可撤回的资源补充，不修改原图、Markdown、图片 alt、图注或作者设置的显示宽度。正文由 `srcset/sizes` 选择资源，灯箱和“打开原图”仍使用原图。

历史工具与新上传复用 `lib/image-variants.ts` 的准备、校验和发布逻辑，不维护第二份编码实现。固定派生宽度为 640/960/1440/1920，不放大原图，只保留比原图更小的 WebP。动画、方向标记等不适合自动处理的输入明确报告 `original-only`，不把它们静默转成静态图片。

## 本地 plan → preview → apply

先使用明确授权取得的原图副本。下列路径是本地隔离示例；命令不会连接数据库，也不会读取或改写文章。

```sh
node --import tsx scripts/prepare-image-variants.ts plan \
  --input /work/image-review/originals \
  --plan /work/image-review/plan.json

node --import tsx scripts/prepare-image-variants.ts preview \
  --plan /work/image-review/plan.json \
  --output /work/image-review/resources \
  --report /work/image-review/preview.json
```

`plan` 只读输入，记录逐图 SHA-256、字节数、原始像素尺寸、格式、帧数、方向、现有集合状态和拟执行动作。坏图在计划中明确失败并使退出码非零，其余条目仍保存。现有计划不会被覆盖；原图有意更新后应另建计划。文件名不安全、目录、符号链接和已有 `.qz-` 派生不会作为原图处理。

`preview` 按计划重新核对原图 SHA，写独立资源目录及目录外的 JSON、HTML。已有资源目录可以重用；完整有效的集合跳过编码，缺失或损坏的集合由共享引擎安全处理。打开 `preview.html` 比较原图和派生图的文字、线条、透明区域及清晰度。查看 JSON 中逐图状态，不能只看总退出码。

JSON 逐图保存进度。单图失败不阻止后续图片，最终存在失败项时退出非零；未完成的预览报告不能用于 apply。重新运行 preview 会产生新的报告 SHA，旧的审阅 SHA 不再代表新报告。

审阅后计算 **preview.json 文件本身** 的 SHA-256，例如：

```sh
sha256sum /work/image-review/preview.json
```

Windows 可以使用 `Get-FileHash -Algorithm SHA256 -LiteralPath <preview.json>`，将输出 hash 转为小写。将确认过的完整 hash 传入 apply：

```sh
node --import tsx scripts/prepare-image-variants.ts apply \
  --plan /work/image-review/plan.json \
  --preview /work/image-review/preview.json \
  --target /work/image-review/target-originals-copy \
  --report /work/image-review/apply.json \
  --reviewed-preview-sha256 <已审阅preview.json的64位小写SHA256>
```

**apply 会写 `--target`，它不是 dry-run。** 该目录必须已存在并已有同名原图；每张目标原图必须与计划 SHA 一致，包括字节数相同的替换也会被拒绝。工具只发布通过校验的固定命名派生及 sidecar，不复制或覆盖原图，不调用任何文章接口。

apply 还会核对计划文件、审阅报告、准备好的 sidecar 和每个派生文件的 SHA。旧版 v1 sidecar 的派生条目没有内嵌 hash 时，preview 仍会把实际文件 hash 记入审阅报告，防止审阅后被同大小文件替换。共享引擎验证派生文件、原图前后 SHA，并最后发布 manifest。没有更小派生时仍发布经过审阅的尺寸 manifest，保留宽高预留；动画/方向图没有此有效 sidecar 时保持原图。处理繁忙是可重试失败，不计为历史补齐成功。只有已完成的有效集合才可跳过。单图失败仍继续其他图，报告逐图结果且退出非零。修复明确的前置问题后，可以用同一计划和已审阅资源重试；若重新生成了预览报告，必须重新审阅并传入新的报告 SHA。

计划、报告必须在原图和资源目录之外。预览报告使用相对路径定位资源，移动时保留 `plan.json`、`preview.json` 与资源目录的相对结构和文件字节。apply 使用目标原图，不依赖原开发机的输入副本仍存在；不要编辑计划中的路径来迁就发布环境。

旧命令 `--input <原图> --output <资源>` 仍可使用，但只是一条 plan＋preview 便捷入口，会在输出目录旁生成 `.plan.json`、`.preview.json`、`.preview.html`，**绝不会隐式 apply**。需要应用仍应显式执行上述 apply 命令。

## 生产补齐与发布边界

本轮只允许隔离测试；以下是未来得到明确生产资源写入授权后的操作说明，不表示这些操作已执行或已获授权。

1. 从受信任现场记录目标实例、uploads 挂载路径和候选版本。按既有备份流程生成完整同组备份并做隔离恢复验证，保存原图及已有派生/manifest 的 hash 清单。不要在生产运行构建、`npm ci` 或安装转换依赖。
2. 在受控离线环境对获准的原图副本执行 plan 和 preview，审阅结果。不要把真实原图或备份放入仓库、公开产物或本地测试数据库；敏感日志只留在获准位置。
3. 将计划、已审阅报告和资源按原相对结构带到获准发布环境。先确认受审查的 CLI、共享引擎及所需运行依赖可用；不能直接假设生产 checkout 或旧 runner 包含它们。
4. 由应用所有者串行协调发布、清理和备份。真正把 apply 的 `--target` 指向生产 uploads 时，**会写生产派生文件和 manifest**；此动作需要明确授权。只对目标原图重新验证 SHA，不向生产恢复数据库或改写文章。报告仍须放 uploads 之外。不得用宽泛 rsync/目录覆盖代替逐图发布。
5. 最终资源采用 `<原名>.qz-<宽度>.webp` 与 `<原名>.qz-image.json`。manifest 最后发布；原图 hash、目标文件或派生校验不符时拒绝该次发布，不能强行关闭校验。读取端没有有效集合时回退原图，预检失败不会为了强制回退而移除既有有效集合。缓存 URL 不变，发布后应使用独立浏览器上下文实际核对 `currentSrc`、资源字节、解码尺寸与原图灯箱，不能仅根据文件变小宣称网络收益。

共享引擎仅在 `uploads/.mcp-staging/image-variants/` 使用自己的唯一临时任务目录，不触碰 MCP 的 UUID 任务目录。该 namespace 已由备份排除、Nginx 阻断。清理只能针对本次拥有的临时任务，不清理其他上传任务。普通计划、预览报告、HTML 和锁文件不得散落到公开 uploads 或其归档中。

## 资源回滚

回滚资源同样会写生产文件，必须在明确授权、确认目标与当前 hash 后进行。优先把本次新发布的 manifest 移到 uploads 之外的受保护位置，使页面立即回退原图。不要移除 `reused` 集合，也不要处理当前 hash 与本次发布记录不一致的文件。

无需回滚文章或恢复数据库。保留原图与派生文件；若需要恢复之前的派生集合，应使用发布前的同组资源备份，逐图验证后恢复派生、最后恢复 manifest。不要为了节省空间立即批量删除派生；确认稳定后另行按已授权清理流程处理。

引用收集器会保护仍被文章正文/封面、项目封面和系列封面引用的原图及其固定派生集合。备份保留上传目录内的 sidecar/WebP，并排除临时 staging。私有 Questions 图片不在本工具的公开 uploads 处理范围中。
