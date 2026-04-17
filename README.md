# st-regex-three-level-organizer

一个 SillyTavern 前端插件，用来给正则脚本做手动文件夹整理。当前版本提供普通文件夹视图，保留酒馆原生正则拖动排序，不接管原生拖拽逻辑。

## 功能

1. 分别整理全局正则、预设正则、局部正则。
2. 新增文件夹、重命名文件夹、删除文件夹。
3. 通过酒馆原生拖动把正则移动到目标文件夹。
4. 支持拖动文件夹标题来调整文件夹顺序。
5. 下拉框支持选择 `未分组`，但该项不可重命名、不可删除。
6. 文件夹标题支持折叠和展开。
7. 使用酒馆原生拖动重排正则时，不会再把已整理的文件夹全部重置为未分类。
8. 更新后会自动迁移旧版基于索引的文件夹映射，尽量保留已有整理结果。

## 使用方式

1. 打开正则面板。
2. 点击 `新增文件夹`。
3. 输入文件夹名称。
4. 通过酒馆原生拖动，把正则拖到目标文件夹下。
5. 直接拖动文件夹标题，可调整文件夹顺序。
6. 在下拉框中选择已有文件夹后，可执行 `重命名文件夹` 或 `删除文件夹`。
7. 点击文件夹标题可折叠或展开对应内容。

## 说明

- 当前实现是普通文件夹，不是一级、二级、三级树形结构。
- 文件夹信息和折叠状态保存在浏览器本地 `localStorage` 中。
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
