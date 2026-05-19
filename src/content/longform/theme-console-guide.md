---
title: Theme Console 配置指南
description: 说明 astro-whono 本地 Theme Console 在开发环境下的适用范围、页面分组、配置落点与保存机制。
badge: 指南
date: 2026-04-26
tags: [ "Theme Console", "指南"]
draft: false
---

astro-whono 提供一个本地 Theme Console，用于在开发环境中集中管理主题级配置。

Theme Console 的入口是 `/admin/theme/`。它主要覆盖站点信息、侧栏、首页、内页文案，以及部分阅读与代码显示选项，便于在 fork 或 clone 后快速调整站点主题设置。

:::note[开发环境]
`/admin/theme/` 仅在开发环境可操作。生产环境访问时，只显示本地开发提示，不提供写入能力。
:::

## 本地启动与入口

本地开发时，可通过以下命令启动项目：

```bash
npm install
npm run dev
```

默认情况下，开发服务器会运行在 `http://localhost:4321/`。启动后可直接访问：

```text
http://localhost:4321/admin/theme/
```

如果本地修改了开发端口，请将 `4321` 替换为实际端口。

`/admin/` 是后台的 Site Overview 入口，用于查看站点快照。Theme Console 位于 `/admin/theme/`，使用时注意区分这两个入口。

## 开发与生产环境

Theme Console 是面向本地维护者的配置工具，不同环境下的表现如下：

- 开发环境：`/admin/theme/` 可读取和保存主题配置
- 生产环境：`/admin/theme/` 只保留本地开发提示，不显示可写表单
- `/api/admin/settings/`：仅开发环境可用，不作为公开 API 使用

## 适用范围

Theme Console 当前适合处理以下几类配置：

- 站点标题、默认语言、默认 SEO 描述
- 页脚年份与版权文案
- `/admin/` Overview 对外展示开关与关闭态文案
- 社交链接及其排序
- 侧栏站点名、引用文案、导航顺序与显隐
- 侧栏动作图标（阅读模式 / RSS / 主题切换 / 站点概览入口）
- 首页 Hero、首页导语及首页内部入口
- `/longform/`、`/archive/`、`/bits/`、`/picks/`、`/about/` 的主副标题
- 文章元信息显示选项
- 代码块行号


## 配置文件

保存后的设置会按分组自动写入 `src/data/settings/`：

```text
src/data/settings/
  site.json
  shell.json
  home.json
  page.json
  ui.json
```

> 若 `src/data/settings/*.json` 尚不存在，首次在 `/admin/theme/` 保存时会自动生成。

Theme Console 管理的是仓库内的主题配置，相关改动仍可通过 Git 进行跟踪和回退。

主题配置的读取顺序固定为：`src/data/settings/*.json` 优先，其次读取 legacy 配置，最后使用项目默认值。这里的 legacy 配置主要来自 `site.config.mjs` 和组件内默认常量。<br>
也就是说，刚 clone 项目时可以先使用默认配置；只要在 Theme Console 中保存过一次，就会生成可跟踪的 settings JSON。

## 页面分组

`/admin/theme/` 当前按编辑场景拆分为五组。

### Site

`Site` 负责站点层面的基础信息：

- 站点标题
- 默认语言
- 默认 SEO 描述
- 页脚年份与版权文案
- `/admin/` Overview 是否对外展示，以及关闭时显示的文案
- 社交链接

> ![Site 分组截图](./theme-console/theme-console-site.webp)

### Sidebar

`Sidebar` 负责壳层与导航相关配置：

- 侧栏站点名
- 侧栏引用文案
- 侧栏分隔线样式
- 侧栏动作图标显隐（阅读模式 / RSS / 主题切换 / 站点概览）
- 导航名称、排序、后缀字符与显隐状态

> ![Sidebar 分组截图](./theme-console/theme-console-sidebar.webp)

### Home

`Home` 负责首页展示相关配置：

- Hero 图片地址与说明文字
- Hero 显隐
- 首页导语主文案
- 首页导语补充文案
- 补充导语中的主链接与第二链接

> ![Home 分组截图](./theme-console/theme-console-home.webp)

首页补充导语仍采用固定句式，后台只开放了文案和入口选择，尽量保持首页结构稳定。当前可选入口包括 `archive`、`longform`、`bits`、`picks`、`about` 和 `tag`。


### Inner Pages

`Inner Pages` 负责内页层面的统一文案与显示策略：

- `/longform/` 页面主副标题
- `/archive/` 页面主副标题
- `/bits/` 页面主副标题
- `/picks/` 页面主副标题
- `/about/` 页面主副标题
- 文章元信息是否显示日期、标签、字数、阅读时长
- `/bits/` 默认作者名与头像

> ![Inner Pages 分组截图](./theme-console/theme-console-inner-pages.webp)


### Code

- 是否在代码块中显示行号


## 保存机制

- 保存按 `site / shell / home / page / ui` 分组回写，不直接修改模板源码
- 多数字段提供即时预览或明确的页面对应关系
- 保存前会执行字段校验
- 保存时会附带版本信息，用于避免并发修改造成的静默覆盖
- 写入过程包含失败回滚，避免多文件半成功状态

---

以上内容覆盖了 Theme Console 当前常用的配置入口与保存机制。如果在使用时发现配置异常或保存问题，欢迎提交 Issue。
