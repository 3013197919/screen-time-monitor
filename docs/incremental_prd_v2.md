# Screen Time Monitor v2 增量 PRD

> 版本: v2.0（增量） | 日期: 2026-06-07 | 基准版本: v1.0 (system_design.md)
>
> 本文档仅描述**增量变更**，不重复已有功能。已有功能详见 `docs/system_design.md`。

---

## 一、当前状态盘点

在编写增量需求前，对 11 项候选功能做了现状审计。结果如下：

| # | 功能 | 状态 | 判断 |
|---|------|------|------|
| 1 | 系统托盘右键菜单 | 已有基础实现，缺摘要 + 暂停/恢复 | **增强** |
| 2 | 侧边栏导航 | 已通过 App.tsx 内联 Sidebar 实现 | **已完成** |
| 3 | CSV 数据导出 | 已通过 `export:csv` IPC + 设置页按钮实现 | **已完成** |
| 4 | 使用限制配置 UI | 已通过 SettingsPage 中 App Limits 分区实现 | **已完成** |
| 5 | 开机自启 | 设置页有 Switch，需验证 `setLoginItemSettings()` 接线 | **增强** |
| 6 | 环比对比 | 未实现，周报/月报页面无对比逻辑 | **新增** |
| 7 | 应用分类标签 | `app_categories` 表已建但无 UI 和查询 | **新增** |
| 8 | 窗口标题隐私模式 | 未实现 | **新增** |
| 9 | 数据自动清理 | 设置页有 Clear History 按钮但未接线，无自动清理 | **新增** |
| 10 | 应用图标提取 | 未实现 | **新增** |
| 11 | PDF 报告导出 | 未实现 | **新增** |

**结论**: 实际需开发 8 项（6 项新增 + 2 项增强），3 项已完成无需额外工作。

---

## 二、产品目标

1. **信息密度提升**: 托盘菜单提供"一眼可见"的今日概况，减少打开主面板的频率
2. **决策支持**: 环比对比让用户直观看到使用趋势变化，而非孤立的数据点
3. **隐私可控**: 隐私模式让用户自己决定记录粒度，平衡数据价值与隐私担忧
4. **分类洞察**: 按工作/学习/娱乐分类聚合，帮助用户理解时间去向的结构
5. **报告多样性**: PDF 报告 + 图标展示提升专业感和可读性，适配不同分享场景

---

## 三、用户故事

| ID | 作为… | 我想要… | 以便… |
|----|-------|---------|-------|
| US-01 | 上班族 | 在托盘图标上右键就看到今日各应用时长 | 快速评估是否超时，无需打开主面板 |
| US-02 | 效率控 | 看周报时能对比上周数据，看到 +15% 或 -8% 的变化 | 直观判断本周是否比上周更专注 |
| US-03 | 远程工作者 | 给 Chrome 打"工作"标签、给 Steam 打"娱乐"标签 | 饼图能按分类显示工作 vs 娱乐的时间占比 |
| US-04 | 注重隐私者 | 开启隐私模式后只记录进程名不记录窗口标题 | 保护敏感信息（邮件标题、文档名等）的同时仍能追踪时间 |
| US-05 | 月度复盘者 | 导出带图表的 PDF 月报发送给主管或自己存档 | 用更正式的格式呈现数据 |

---

## 四、需求池

### P0 — 高价值（用户体验核心提升）

#### F-01: 托盘右键菜单增强

**现状**: 托盘已有基础右键菜单（Show / Quit），双击打开主面板。

**增量变更**:
| 项目 | 说明 |
|------|------|
| 菜单结构 | 新增「今日概况」子菜单（不可点击标题），其下 3-5 条子项格式为「app_name — Xh Ym」 |
| 分隔线 | 概况下方分隔线，再显示控制区 |
| 暂停/恢复 | 动态切换文案，暂停时所有菜单项不受影响 |
| 打开主面板 | 复用已有 `win.show()` + `win.focus()` |
| 退出 | 复用已有 `app.quit()` |

**菜单结构示意**:
```
今日概况 (disabled)
  ├─ Chrome — 2h 15m
  ├─ VS Code — 1h 42m
  └─ Slack — 45m
─────────────
⏸ 暂停追踪   (或 ▶ 恢复追踪)
📊 打开主面板
─────────────
❌ 退出
```

**验收标准**:
- [ ] 托盘右键出现「今日概况」标题（灰色不可点击）
- [ ] 概况子项显示今日 Top 5 应用及其时长，格式 `Hh Mm`（如 `2h 15m`）
- [ ] 当今日无数据时显示「暂无数据」
- [ ] 暂停/恢复菜单项文案动态切换，点击后实时生效
- [ ] 暂停后菜单项不影响其他条目

**涉及文件**: `electron/main.ts`（Tray 部分，约第 127-164 行）

---

#### F-02: 开机自启完善

**现状**: SettingsPage 已有 Switch UI，需验证 `app.setLoginItemSettings()` 是否真正接线。

**增量变更**:
| 项目 | 说明 |
|------|------|
| 读写 | 读取 `settings` 表 `auto_start` 键（boolean），写入同理 |
| 主进程 | `app.setLoginItemSettings({ openAtLogin: bool })` |
| 默认值 | 关闭（false） |

**验收标准**:
- [ ] 开启后下次系统登录自动启动
- [ ] 关闭后不再自启
- [ ] Windows 任务管理器「启动」页可验证
- [ ] 设置持久化，重启应用后保持

**涉及文件**: `electron/main.ts`（IPC `settings:set` 处理器），`src/pages/SettingsPage.tsx`

---

### P1 — 中等价值（数据分析深度）

#### F-03: 环比对比

**背景**: 周报和月报页面目前只展示当前周期的柱状图和饼图，缺少趋势判断。

**增量变更**:

**数据层** (`electron/db/queries.ts`):
- 新增 `getPreviousWeekReport(weekStart)` — 查询 `weekStart - 7 days` 起一周的 `daily_summary`
- 新增 `getPreviousMonthReport(month)` — 查询上个月的 `daily_summary`

**IPC 层** (`electron/main.ts`):
- 新增 `data:get-previous-week-report` 通道
- 新增 `data:get-previous-month-report` 通道

**UI 层** (`src/pages/WeeklyPage.tsx`, `src/pages/MonthlyPage.tsx`):
- 总时长卡片显示环比变化，格式 `vs 上周 ±XX%`，上升红色箭头 ↑，下降绿色箭头 ↓
- 每应用行也显示环比（如 `Chrome: 12h (+15%)`）

**验收标准**:
- [ ] 周报顶部显示「本周总时长 XXh，vs 上周 ±XX%」
- [ ] 月报顶部显示「本月总时长 XXh，vs 上月 ±XX%」
- [ ] 上期无数据时显示「暂无对比数据」
- [ ] 增长/下降用不同颜色箭头区分

**涉及文件**: `electron/db/queries.ts`, `electron/main.ts`, `src/pages/WeeklyPage.tsx`, `src/pages/MonthlyPage.tsx`, `src/types/models.ts`, `src/types/electron.ts`, `electron/preload.ts`

---

#### F-04: 应用分类标签

**背景**: `app_categories` 表已建但前端未使用。需要分类管理和分类饼图。

**增量变更**:

**数据层** (`electron/db/queries.ts`):
- 新增 `getCategories()` — 查询所有 app_categories
- 新增 `setCategory(appName, category)` — upsert 单条
- 新增 `getCategorizedReport(dateRange)` — 按分类聚合 daily_summary 的 total_duration，LEFT JOIN app_categories

**IPC 层**:
- 新增 `categories:get-all` / `categories:set` / `data:get-categorized-report`

**UI 层**:

*设置页新增「应用分类」分区*:
- 下拉选择应用（列出现有 daily_summary 中的 app_name）+ 4 个分类 Radio/Select + 保存按钮
- 已有分类的应用显示标签 Chip，点击可编辑/删除

*今日/周报/月报页面*:
- 饼图新增切换：按应用 / 按分类（两个 Tab 或 Toggle）
- 分类饼图按 work/study/entertainment/other 聚合

**验收标准**:
- [ ] 设置页可为应用分配分类标签
- [ ] 标签持久化到 `app_categories` 表
- [ ] 今日/周报/月报饼图可切换至「按分类」视图
- [ ] 未分类应用归入「其他」
- [ ] 分类颜色固定：工作蓝、学习绿、娱乐橙、其他灰

**涉及文件**: `electron/db/queries.ts`, `electron/main.ts`, `electron/preload.ts`, `src/pages/SettingsPage.tsx`, `src/pages/TodayPage.tsx` / `WeeklyPage.tsx` / `MonthlyPage.tsx`, `src/components/TimeChart.tsx`, `src/types/models.ts`

---

#### F-05: 窗口标题隐私模式

**背景**: 当前 `app_events` 表完整记录 `window_title`，其中可能包含敏感信息（邮件标题、文件名等）。

**增量变更**:

**设置层**:
- 新增 `settings` 键 `privacy_mode` (boolean)，默认 false

**追踪层** (`electron/tracker.ts`):
- 在 `handleWindowChange()` / 写入 `app_events` 前检查 `settings` 表 `privacy_mode`
- 若为 true，`window_title` 写入 `"(隐私模式)"` 或空字符串
- 若运行时切换设置，立即生效（下次窗口切换时）

**UI 层** (`src/pages/SettingsPage.tsx`):
- 新增设置项「隐私模式：仅记录应用名，不记录窗口标题」
- Switch 控件 + 描述文字

**验收标准**:
- [ ] 开启后新记录的 `window_title` 为 `(隐私模式)`
- [ ] 历史数据不受影响
- [ ] 开关实时生效（非重启生效）
- [ ] 开关状态持久化

**涉及文件**: `electron/tracker.ts`, `electron/main.ts`, `src/pages/SettingsPage.tsx`, `electron/db/migrations.ts`（新增 settings 默认值）

---

### P2 — 进阶体验（锦上添花）

#### F-06: 数据自动清理

**背景**: `app_events` 表无限增长。设置页已有「Clear History」按钮但 `TODO: implement IPC clear call`。

**增量变更**:

**设置层**:
- 新增 `settings` 键 `data_retention_days`（整数，默认 90）
- 修改 `data_retention` 键（已存在）为有效值

**主进程**:
- 实现 `settings:clear-history` IPC — 删除超期的 `app_events` 行
- 新增定时检查：应用启动时 + 每 24 小时检查一次
- 清理逻辑：`DELETE FROM app_events WHERE date < date('now', '-N days')` + VACUUM
- 同步清理 `daily_summary` 中对应日期的行

**UI 层**:
- 设置页 Data Management 分区新增「数据保留天数」数字输入框（7-365 天）
- 修复「Clear History」按钮的 IPC 接线
- 清理操作显示确认 Dialog，告知将删除的条数和日期范围

**验收标准**:
- [ ] 数据保留天数可配置
- [ ] 超期数据在启动时自动清理
- [ ] Clear History 按钮功能完整（手动清理）
- [ ] 清理后 SQLite 文件体积减少
- [ ] 不影响当前日和保留期内的数据

**涉及文件**: `electron/main.ts`, `electron/db/queries.ts`, `src/pages/SettingsPage.tsx`

---

#### F-07: 应用图标提取

**背景**: 排行榜目前是纯文字，加上图标提升辨识度。

**增量变更**:

**主进程**:
- 新增 `app:get-icon` IPC 通道，参数 `appName`（如 `chrome.exe`）
- 实现：先用 `shell.openPath()` 思路改为通过进程名查找 `.exe` 路径（复杂），简化方案是使用 `app.getFileIcon()` 需先获取路径
- **简化方案**: 维护一个常见应用名 → 内置 SVG 图标映射表（约 20 个常见应用），其余用首字母头像回退

**UI 层** (`src/components/AppUsageList.tsx`):
- 每行应用名左侧显示图标（24x24）
- 无图标时显示首字母 Avatar（MUI Avatar 组件）

**验收标准**:
- [ ] Chrome / VS Code / Edge 等常见应用显示对应图标
- [ ] 未知应用显示首字母 Avatar
- [ ] 图标大小统一 24x24，不被压缩变形

**涉及文件**: `electron/main.ts`（可选，如用内置映射则不需要主进程），`src/components/AppUsageList.tsx`

---

#### F-08: PDF 报告导出

**背景**: CSV 导出已实现，但缺少更正式的 PDF 格式。

**增量变更**:

**依赖**: 添加 `pdfmake` 或 `jspdf` 到项目

**IPC 层**:
- 新增 `export:pdf` 通道，参数 `type`（weekly/monthly）、`date`（起始日期）

**主进程**:
- `export:pdf` handler 查询数据 → 生成 PDF Buffer → `dialog.showSaveDialog()` → 写入文件
- 构造简单报告：标题 + 日期范围 + 总时长 + 柱状图（静态图片或文字描述） + 应用排行表格

**UI 层**:
- 设置页导出分区新增「导出 PDF 报告」按钮
- 弹出 Dialog 选择报告类型（周报/月报）和日期

**验收标准**:
- [ ] 导出按钮生成有效 PDF 文件
- [ ] PDF 包含：报告标题、日期范围、总时长、应用排行表
- [ ] PDF 可正常打开且文字清晰
- [ ] 中文无乱码

**涉及文件**: `electron/main.ts`, `electron/preload.ts`, `src/pages/SettingsPage.tsx`, `package.json`

---

## 五、实现顺序建议

```
Phase 1（P0, 1-2天）
  ├─ F-01: 托盘右键菜单增强
  └─ F-02: 开机自启完善

Phase 2（P1, 2-3天）
  ├─ F-03: 环比对比
  ├─ F-04: 应用分类标签
  └─ F-05: 窗口标题隐私模式

Phase 3（P2, 1-2天）
  ├─ F-06: 数据自动清理
  ├─ F-07: 应用图标提取
  └─ F-08: PDF 报告导出
```

## 六、不纳入本次迭代

以下 3 项经审计已完成，不纳入 v2 开发范围：
- 侧边栏导航（F-02 in original list）— 已通过 App.tsx 内联 Sidebar 完成
- CSV 数据导出（F-03 in original list）— 已通过 `export:csv` IPC 完成
- 使用限制配置 UI（F-04 in original list）— 已通过 SettingsPage App Limits 分区完成
