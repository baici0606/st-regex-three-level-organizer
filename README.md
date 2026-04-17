# Regex Manual Groups

一个独立的 SillyTavern 前端插件，用来把正则脚本按普通分组整理，不做一级、二级、三级树形结构。

## 功能

1. 新增普通分组，例如 `A组`、`B组`、`测试组`。
2. 勾选多个正则后，选择目标分组并点击 `移动到组`。
3. 支持在下拉框中选择 `未分组`，再点击 `移动到组` 把正则移回未分组。
4. 支持重命名分组。
5. 支持删除分组。
6. 分组标题可以折叠，只影响显示，不改正则内容本身。

## 使用方式

1. 点击 `新增分组`。
2. 输入组名。
3. 勾选你要移动的正则。
4. 在下拉框中选择目标分组，或者选择 `未分组`。
5. 点击 `移动到组`。

## 说明

- 当前版本是扁平分组，不再支持多级组。
- 分组信息保存在浏览器本地 `localStorage` 中。
- 同时支持：
  - 全局正则
  - 预设正则
  - 局部正则

## 安装

在 SillyTavern 的“安装拓展”里输入：

```text
https://github.com/<你的GitHub用户名>/RegexManualGroups
```

## 手动安装

把整个 `RegexManualGroups` 文件夹放到：

```text
SillyTavern/public/scripts/extensions/third-party/
```

然后在 SillyTavern 扩展管理中启用。

## 文件结构

```text
RegexManualGroups/
├── manifest.json
├── index.js
├── style.css
└── README.md
```
