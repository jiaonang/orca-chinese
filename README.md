# Orca 简体中文语言包

社区维护的 Orca 简体中文界面语言包。纯数据插件（`execution: "data"`）：只提供翻译，
不运行任何代码，安装后一秒钟生效，不需要授权。

- 插件 id：`zh-cn`（安装后为 `<GitHub owner>.zh-cn`）
- 语言：`zh`（简体中文），在 **设置 → 外观 → 语言** 中显示为 **简体中文（社区）**
- 覆盖：22,828 条界面文案，占 Orca 当前英文词条的 99.94%

## 为什么用它

Orca 自带的简体中文已经可用，这个包在它的基础上做了三件事：

1. **补齐缺翻译的条目**：上游 `zh.json` 缺少 271 条文案（合并了已安装 Orca 的 zh
   词条后仍然缺的部分，例如 Bots、Antigravity 账号、MCP 粘贴导入等新界面），在这里补齐。
2. **统一术语**：同一个概念不再出现两种译法。
   - `agent`（AI 智能体）统一为 **智能体**，不再混用「代理」；`proxy`、`user agent`、
     `ssh-agent`、`authentication agent` 仍然译为「代理」。
   - `tab` 统一为 **标签页**，不再混用「选项卡」。
   - 第二人称统一为 **你**，不再混用「您」。
3. **修正误译**：例如把占位符 `<question>` 误译成 `<问题>`、整段没有翻译的
   `RuntimeRepairDialog` 文案等。

## 安装

**从社区目录安装（推荐，可自动检查更新）**

```sh
orca plugin install jiaonang/orca-chinese --json
```

或直接打开 <https://orca.dev/plugins/jiaonang/orca-chinese> 一键安装。

**从本地目录安装（开发用）**

```sh
git clone https://github.com/jiaonang/orca-chinese.git
orca plugin install ./orca-chinese --json
```

安装后打开 **设置 → 外观 → 语言**，选择 **简体中文（社区）**。语言包只影响界面文案，
不会改动 Orca 的安装文件，卸载后即可回到内置语言。

## 仓库结构

```
orca-plugin.json              # 插件清单（manifest v2，data 执行档）
locales/zh.json               # 语言包本体：Orca 的 i18n 键 → 简体中文
overrides/fixes.json          # 手工维护的条目：新增翻译 + 修正
overrides/terminology.json    # 术语规则：全局替换与按英文原文判断的条件替换
overrides/translatable-chrome.json  # Orca 允许翻译的插件面板界面文案
tools/build-pack.mjs          # 由基础词条 + overrides 生成 locales/zh.json
tools/audit.mjs               # 占位符、长度、字符、术语自检
```

## 维护与构建

`locales/zh.json` 由脚本生成，编辑时请改 `overrides/`，不要直接改语言包。

```sh
# 1. 取一份基础词条（Orca 仓库的 zh.json，或已安装 Orca 的
#    resources/app.asar.unpacked/out/renderer/assets/zh-*.json），
#    再取 Orca 的英文词条和受保护文案清单用于校验与裁剪：
#    - en.json: src/renderer/src/i18n/locales/en.json
#    - protected-copy-keys.json:
#      resources/app.asar.unpacked/out/shared/plugins/languages/protected-copy-keys.json

# 2. 生成
node tools/build-pack.mjs \
  --base zh-base.json --english en.json \
  --protected protected-copy-keys.json --out locales/zh.json

# 3. 自检 + Orca 官方校验
node tools/audit.mjs --english en.json
orca plugin validate .
```

Orca 不允许语言包替换安全相关文案（删除确认、权限提示、插件授权等），
`--protected` 会把这些条目从语言包里裁掉；不提供该参数时 `orca plugin validate` 会报错。

## 版本

`version` 使用 `X.Y.Z`，发布时打同名的 `vX.Y.Z` 标签。目录只读取最新的版本标签，
所以每次更新语言包都要同时提升 `version` 并推送新标签。

## 许可与来源

本仓库的翻译文件与脚本以 MIT 许可发布（见 [LICENSE](LICENSE)）。
词条基础来自 Orca 自带的简体中文词条，Orca 本身同样以 MIT 许可发布，
版权归 Lovecast Inc. 所有（见 [NOTICE.md](NOTICE.md)）。
