# st-regex-three-level-organizer

一个 SillyTavern 前端插件，用来给正则脚本做手动分组整理。当前版本提供普通分组视图，保留酒馆原生正则拖动排序，不接管原生拖拽逻辑。

## 功能

1. 分别整理全局正则、预设正则、局部正则。
2. 新增分组、重命名分组、删除分组。
3. 勾选多个正则后，批量移动到目标分组。
4. 支持把正则移回 `未分组`。
5. 分组标题支持折叠和展开。
6. 使用酒馆原生拖动重排正则时，不会再把已整理的分组全部重置为未分类。
7. 更新后会自动迁移旧版基于索引的分组映射，尽量保留已有整理结果。

## 使用方式

1. 打开正则面板。
2. 点击 `新增分组`。
3. 输入组名。
4. 勾选要整理的正则。
5. 在下拉框中选择目标分组，或者选择 `未分组`。
6. 点击 `移动到组`。
7. 点击分组标题可折叠或展开对应内容。

## 说明

- 当前实现是普通分组，不是一级、二级、三级树形结构。
- 分组信息和折叠状态保存在浏览器本地 `localStorage` 中。
- 不修改正则脚本本身内容。
- 不改变酒馆原生拖动排序规则。

## 安装

在 SillyTavern 的“安装拓展”里输入：

```text
https://github.com/dimo9174/st-regex-three-level-organizer
```

## 手动安装

把整个 `st-regex-three-level-organizer` 文件夹放到：

```text
SillyTavern/public/scripts/extensions/third-party/
```

然后在 SillyTavern 扩展管理中启用。

## 文件结构

```text
st-regex-three-level-organizer/
├── manifest.json
├── index.js
├── style.css
└── README.md
```
