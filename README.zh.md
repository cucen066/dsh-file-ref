# dsh-file-ref

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 界面的 **工作区文件引用** 插件（类 Codex 体验）：在输入框输入 `@` 即可浏览当前工作区的文件，选中后以纯文本插入「工作区文件：相对路径」。

```
@ → 文件.md → 发送
```

Agent 收到的是带「工作区文件：」锚点的相对路径，可以直接在工作区内定位读取；没有绝对路径、没有按文件名全盘搜索、也没有被截断的引用块。

## 为什么用纯文本而不是引用块（chip）？

DSH 输入框的引用块只占**一个字符位**，任何超过 1-2 个字符的标签都会被视觉截断（完整名字只能靠悬停查看）。对文件名来说这完全失去了意义。改成纯文本插入后：

- 输入框里**完整显示文件名**，发送前一目了然；
- 发送内容**所见即所得**，就是你选中的那个；
- Agent 收到的是「工作区文件：相对路径」，锚点引导它直接在工作区内解析，避免全盘搜索（子目录文件为 `子目录/文件名`）。

## 特性

- `@` 菜单顶部新增「文件」分组（排在子智能体/插件之前）。
- 候选列表来自一个小型 host 端接口，浏览器不直接接触文件系统。
- 仅列出文件（跳过目录），递归最多 4 层、上限 300 个；排除 `node_modules`、`.git` 和点开头文件。
- 插入「工作区文件：相对路径」；文件不在工作区内时回退为纯文件名。

## 环境要求

- 正在运行的 DSH **web** profile（`dsh web`）。
- 回环绑定（`127.0.0.1`，默认值）。参见[安全说明](#安全说明)。

## 安装

把包装进 profile 并启用，然后重启 `dsh web`。

```sh
# 从你的工作目录执行（相对路径会锚定到当前目录）
dsh plugin --profile web add github:<你的账号>/dsh-file-ref
# 或从本地目录安装
dsh plugin --profile web add /path/to/dsh-file-ref
```

在 `$DSH_HOME/profiles/web/cordis.patch.yml` 追加一行：

```yaml
- insert:
    - id: file-ref
      name: 'dsh-file-ref'
      inject: [webServer]
```

重启服务：

```sh
dsh web
```

> 开发 bundle 本身时，客户端会热重载：`client-hmr` 链每 500ms 轮询一次已
> 服务的 bundle 文件并在浏览器里自动重载插件，无需重启服务。但**新增行**
> （上面的 cordis patch）仍必须重启，因为启动图（boot graph）是在启动时
> 组装的。

## 工作原理

一个包、两个面（`dsh.client` 双面插件）：

- **Host 端**（`lib/index.js`）在 web 服务器上注册一条精确路由：
  `GET /dsh-file-ref/list?path=<绝对目录>` → `{ cwd, files: [{ name, path }] }`。
  用 `node:fs/promises` 做有上限的递归扫描。
- **浏览器端**（`lib/client.js`）注册一个 `@` 输入触发源（`file-ref`，
  order `-1` 排最前）。候选通过路由请求当前会话的 `cwd`（来自 sessions
  store）。选中后插入「工作区文件：相对路径 + 一个空格」——锚点让模型直接
  在工作区内定位文件，而不是按文件名全盘搜索。

浏览器不需要文件系统 API；host 端也只暴露这一条列目录路由。

## 开发

客户端 bundle 是一个普通的经典脚本，通过
`window.__ModuleLoader__.load({ id, factory })` 注册（DSH 模块加载器在
`/plugins/<id>/client.js` 提供的格式）。无需构建步骤。

运行 host 端冒烟测试（不需要 cordis）：

```sh
node smoke-test.mjs                # 默认列出本包目录
node smoke-test.mjs /path/to/dir   # 或指定任意绝对目录
```

## 安全说明

- 列目录路由**无鉴权**且接受任意绝对路径——仅适合默认的回环绑定；`--host 0.0.0.0` 时请谨慎。
- 相对路径直接拒绝（`400`）；不可读目录静默跳过。
- 文件内容永远不离开 host——只传输文件名和路径。

## 已知限制

- 仅 Web 界面（输入框在 Web GUI 中）。
- 只列文件；无目录项、无多级选择器导航。
- `@` 菜单分组标题显示原始源名（`file-ref`），因为触发菜单的 locale 命名空间归 `ui-input-trigger` 所有。

## License

MIT
