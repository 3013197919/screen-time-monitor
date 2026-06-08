# Screen Time Monitor v3 增量 PRD

> 版本: v3.0（增量） | 日期: 2026-06-07 | 基准版本: v2.0 (docs/incremental_prd_v2.md)
>
> 本文档仅描述 v3 **增量变更**，不重复已有功能。已有功能详见 `docs/system_design.md` 和 `docs/incremental_prd_v2.md`。

---

## 零、当前状态盘点（v2 开发完成后基准）

v2 已交付以下功能，本文档在此基础上进行 v3 增量设计：

| # | v2 功能 | 涉及模块 |
|---|---------|----------|
| 1 | 托盘右键菜单增强（今日概况摘要） | `electron/main.ts` Tray 部分 |
| 2 | 开机自启完善 | SettingsPage + main.ts IPC |
| 3 | 环比对比（周/月报 vs 上周/上月） | WeeklyPage / MonthlyPage + queries.ts |
| 4 | 应用分类标签（按 work/study/entertainment/other） | SettingsPage + TimeChart + queries.ts |
| 5 | 窗口标题隐私模式 | SettingsPage + tracker.ts |
| 6 | 数据自动清理 + Clear History | SettingsPage DataSection + queries.ts |
| 7 | 应用图标提取（内置 SVG 映射表） | AppUsageList.tsx |
| 8 | PDF 报告导出 | SettingsPage + main.ts export:pdf IPC |

**v3 新增功能（5 项）**：

| # | v3 功能 | 目标 |
|---|---------|------|
| 1 | Focus Mode 专注模式 | 用户设置白名单应用组，非白名单应用计入分心时间，状态栏一键切换 |
| 2 | 自定义日期范围统计 | 任意起止日期查看数据，含快捷选项（近 7/30 天、本月/上月） |
| 3 | 应用搜索 | AppUsageList 排行榜中模糊搜索过滤应用名 |
| 4 | 多语言 i18n | 中英文切换，默认跟随系统，react-i18next 实现 |
| 5 | 自动更新 autoUpdater | electron-updater 对接 GitHub Releases，设置页显示版本+检查更新 |

---

## 一、产品目标

1. **深度专注体验**: Focus Mode 让用户主动管理"该做什么"，从被动记录升级为主动引导，非白名单应用形成心理负反馈
2. **灵活数据探索**: 自定义日期范围让用户自由切片查看任意时段的使用习惯，不再受固定 Today/Weekly/Monthly 限制
3. **快速定位信息**: 应用搜索解决排行榜长列表的查找痛点，当追踪应用超过 20 个时尤为重要
4. **国际化覆盖**: 中英文切换降低非母语用户门槛，为后续分发到国际用户做准备
5. **持续迭代能力**: 自动更新机制确保用户始终使用最新版本，降低 bug 报告中的版本不一致问题

---

## 二、用户故事

| ID | 作为… | 我想要… | 以便… |
|----|-------|---------|-------|
| US-06 | 需要深度工作的程序员 | 开启专注模式后只允许 VS Code / Terminal / 浏览器（工作相关） | 其他应用（聊天/视频）的使用时间被标记为"分心"，提醒自己回到正轨 |
| US-07 | 自由职业者 | 在状态栏一键切换专注模式开关 | 快速进入/退出工作状态，不打断当前任务的思维流 |
| US-08 | 月度复盘者 | 选择 5 月 15 日到 6 月 7 日这个自定义时间段查看数据 | 按项目周期而非自然月来复盘使用习惯 |
| US-09 | 多应用用户 | 在排行榜搜索框输入"Chrome"快速找到 Chrome 的数据 | 不用在 30 多个应用列表中逐个翻找 |
| US-10 | 非中文母语用户 | 将界面语言切换为英文 | 无障碍使用软件的所有功能 |
| US-11 | 追求最新版的用户 | 在设置页点击"检查更新"自动下载安装最新版本 | 不错过功能更新和 bug 修复 |
| US-12 | 学生备考者 | 设置专注白名单为"仅学习相关应用" | 强迫自己在复习期间不被游戏/社交软件分心，形成自律习惯 |

---

## 三、需求池

---

### P0 — 核心体验（必须交付，用户感知最强）

---

#### F-09: Focus Mode 专注模式

**背景**: 现有追踪系统只"记录"不"引导"。用户需要一种主动约束机制，提升自控力。

**概念模型**:
- **白名单应用组**: 用户在设置中选择「专注应用」，这些应用的使用会计入"专注时间"
- **分心时间**: 任何不在白名单中的应用使用时长自动归入"分心时间"
- **专注模式开关**: 状态栏一键切换 On/Off，开启后追踪逻辑以白名单为基准
- **视觉反馈**: 今日页面同时显示专注时间 vs 分心时间的对比卡片

**增量变更**:

**数据层** (`electron/db/queries.ts`):
- 新增 `getFocusWhitelist()` — 从 settings 表读取 `focus_whitelist` JSON 数组
- 新增 `setFocusWhitelist(appNames: string[])` — 写入 settings 表
- 新增 `getFocusModeStatus()` — 从 settings 表读取 `focus_mode_enabled` (boolean, 默认 false)
- 新增 `setFocusModeStatus(enabled: boolean)` — 写入 settings 表
- 修改 `getTodaySummary()` — 当 Focus Mode 开启时，返回数据中区分 `focused_total` 和 `distracted_total`
- 新增 `getFocusReport(date: string)` — 查询今日专注/分心时间明细，按应用拆分

**设置层** (`settings` 表):
- 新增键 `focus_mode_enabled` (boolean, 默认 "false")
- 新增键 `focus_whitelist` (JSON string array, 默认 "[]")

**追踪层** (`electron/tracker.ts` 或 `electron/services/tracker-service.ts`):
- 在 `handleAppSwitch()` 中检查 `focus_mode_enabled`
- 若开启：当前应用不在白名单中 → 标记为 `distraction` 类型事件，写入 `app_events` 时额外字段
- 或者简单方案：不修改 app_events 表结构，在查询层动态判断应用是否在白名单

**IPC 层** (`electron/main.ts` + `electron/preload.ts`):
- 新增 `focus:get-status` → 返回 `{ enabled: boolean, whitelist: string[] }`
- 新增 `focus:toggle` → 切换开/关，参数 `enabled: boolean`
- 新增 `focus:set-whitelist` → 更新白名单，参数 `appNames: string[]`
- 新增 `focus:get-report` → 获取专注报告数据

**UI 层**:

*设置页——新增「专注模式」分区* (`src/pages/SettingsPage.tsx`):
- 添加应用搜索选择器（MUI Autocomplete + Checkbox），从已有追踪数据中列出所有应用名
- 选中应用加入白名单，显示为 Chip 列表
- "保存"按钮调用 `focus:set-whitelist` IPC

*状态栏——新增 Focus Mode Toggle* (`src/components/StatusBar.tsx`):
- 新增图标按钮（如 `Focus` / `EyeOff` icon，lucide-react）
- 未开启：显示灰色图标 + "专注模式 · 关"
- 已开启：显示主题色图标（如紫色）+ "专注模式 · 开"，带脉冲动画提示
- 点击调用 `focus:toggle` IPC，即时生效

*今日页面——专注/分心对比* (`src/pages/TodayPage.tsx`):
- 新增两个并排 DurationCard：左侧"专注时间"（绿色调），右侧"分心时间"（橙/红色调）
- 仅 Focus Mode 开启时显示；关闭时退出现有卡片
- 饼图可切换"按应用 / 按专注/分心"视图

*AppUsageList 排行列表——新增分心标记* (`src/components/AppUsageList.tsx`):
- 当 Focus Mode 开启时，非白名单应用行尾显示 🔴 警告图标（或 "分心" Chip）
- 白名单应用显示 🟢 对号图标（或 "专注" Chip）

**验收标准**:
- [ ] 设置页可为应用分配白名单（多选），白名单持久化
- [ ] 状态栏一键切换专注模式 On/Off，点击响应 < 200ms
- [ ] 开启后，非白名单应用使用时今日页面显示"分心时间"增长
- [ ] AppUsageList 中非白名单应用有视觉警告标识
- [ ] 今日页面专注/分心对比卡片数据正确
- [ ] 关闭专注模式后，追踪行为恢复普通模式（不影响历史数据）
- [ ] 白名单为空时开启专注模式：所有时间计入分心（极端情况处理）

**涉及文件**: `electron/db/queries.ts`, `electron/main.ts`, `electron/preload.ts`, `electron/services/tracker-service.ts`, `src/pages/SettingsPage.tsx`, `src/pages/TodayPage.tsx`, `src/components/StatusBar.tsx`, `src/components/AppUsageList.tsx`, `src/components/DurationCard.tsx`, `src/types/models.ts`, `src/types/electron.ts`

---

#### F-10: 应用搜索

**背景**: 当追踪应用超过 20 个时，用户在 AppUsageList 中翻找特定应用效率低。

**增量变更**:

**UI 层** (`src/components/AppUsageList.tsx`):
- 在列表顶部新增 `TextField` 搜索框（MUI TextField + SearchIcon）
- 输入时实时过滤列表（前端模糊匹配，不触发 IPC）
- 空结果时显示"未找到匹配应用"
- 搜索框右侧显示 "X" 清除按钮（或使用 MUI InputAdornment）

**过滤逻辑**:
- 模糊匹配：`appName.toLowerCase().includes(query.toLowerCase())`
- 匹配范围：应用名（app_name 字段）
- 性能要求：支持 200+ 应用列表，过滤延迟 < 50ms

**验收标准**:
- [ ] 搜索框实时过滤应用列表
- [ ] 大小写不敏感
- [ ] 支持部分匹配（输入"chr"可匹配"Chrome"）
- [ ] 清除搜索词恢复完整列表
- [ ] 空结果显示友好提示
- [ ] 在 50+ 应用列表中过滤无明显卡顿

**涉及文件**: `src/components/AppUsageList.tsx`

---

#### F-11: 自动更新 (Auto Updater)

**背景**: 应用通过 GitHub Releases 分发，需要自动更新能力覆盖已安装用户。

**增量变更**:

**依赖**: 新增 `electron-updater` 到 package.json (`dependencies`)

**构建配置** (`electron-builder.yml`):
- 添加 `publish` 配置段：
  ```yaml
  publish:
    provider: github
    owner: <repo-owner>
    repo: <repo-name>
  ```

**主进程** (`electron/main.ts`):
- 引入 `autoUpdater` from `electron-updater`
- 在 `app.on('ready')` 后调用 `autoUpdater.checkForUpdatesAndNotify()`
- 注册 Update 事件：
  - `update-available` → 通知渲染进程（IPC `app:update-available`）
  - `update-downloaded` → 通知渲染进程（IPC `app:update-downloaded`），提示用户重启安装
  - `error` → 静默处理（避免频繁弹窗打扰）
- 新增 `app:check-for-updates` IPC 通道（手动检查）
- 新增 `app:install-update` IPC 通道（重启安装）
- 新增 `app:get-version` IPC 通道（当前版本号，或在已有 `app:getVersion` 基础上增强）

**IPC 层**:
- 新增 `app:check-for-updates` → 手动触发检查
- 新增 `app:install-update` → 退出并安装更新
- 新增推送事件 `app:update-available` → 主→渲染，携带版本号
- 新增推送事件 `app:update-downloaded` → 主→渲染，通知可安装
- (可能已有 `app:getVersion`，检查后复用或增强)

**UI 层** (`src/pages/SettingsPage.tsx` 或新增 `src/components/settings/AboutSection.tsx`):
- 显示当前版本号（`vX.Y.Z`）
- "检查更新"按钮（MUI Button + Loading spinner）
  - 检查中：按钮显示 loading 状态
  - 已是最新：显示绿色 Chip "已是最新版本"
  - 有新版本：显示蓝色 Chip "发现新版本 vX.Y.Z"，按钮变为"下载更新"
  - 下载完成：按钮变为"安装并重启"
- 更新状态通过 Zustand Store 管理（`updateStore.ts` 或扩展 `settingsStore.ts`）

**开发环境注意**:
- 开发模式下 `electron-updater` 不执行检查（`app.isPackaged` 为 false 时跳过）
- 可使用 `dev-app-update.yml` 配置文件进行本地测试

**验收标准**:
- [ ] 启动时自动检查更新（仅生产构建）
- [ ] 设置页显示当前版本号
- [ ] "检查更新"按钮可用，手动触发检查
- [ ] 发现新版本时通知用户，可选择下载
- [ ] 下载完成后提示安装并重启
- [ ] 开发模式下不干扰（不弹更新提示）
- [ ] 网络错误时优雅降级（不弹 error 对话框）

**涉及文件**: `electron/main.ts`, `electron/preload.ts`, `src/pages/SettingsPage.tsx`, `electron-builder.yml`, `package.json`, `src/types/electron.ts`

---

### P1 — 数据分析增强（迭代交付）

---

#### F-12: 自定义日期范围统计

**背景**: 当前 Today/Weekly/Monthly 三页固定时间窗口。用户需要灵活选择任意日期范围查看数据。

**增量变更**:

**数据层** (`electron/db/queries.ts`):
- 新增 `getCustomRangeReport(startDate: string, endDate: string)` → 查询 daily_summary 在日期范围内的聚合数据
- 新增 `getCustomRangeAppRanking(startDate: string, endDate: string, limit: number)` → 按应用聚合排名
- 新增 `getCustomRangeDailyTrend(startDate: string, endDate: string)` → 每日总时长趋势（供折线图使用）

**IPC 层**:
- 新增 `data:get-custom-range-report` 通道，参数 `{ startDate, endDate }`
- 新增 `data:get-custom-range-app-ranking` 通道
- 新增 `data:get-custom-range-daily-trend` 通道

**UI 层——页面** (`src/pages/CustomRangePage.tsx` 新增):
- 新增 `CustomRangePage.tsx` 作为第四页面（侧边栏新增导航项 `DateRangeIcon`）
- 页面顶部：日期范围选择器（MUI DatePicker x2，起止日期）+ 快捷选项 Chips
- 快捷选项：近 7 天 / 近 30 天 / 本月 / 上月（点击自动填充日期选择器）
- 统计卡片：总时长、活跃天数、日均时长、使用最多应用
- 图表区：复用现有 `TimeChart.tsx`（柱状图/折线图）+ `DistributionPieChart` 或复用饼图组件
- 排行列表：复用 `AppUsageList.tsx`（自动按聚合数据渲染）

**导航层** (`src/components/layout/Sidebar.tsx`):
- 新增「自定义」导航项（icon: CalendarRange / DateRange，lucide-react）
- 路由：`/custom` → `CustomRangePage`

**复用策略**:
- `TimeChart.tsx` 需支持 `data` prop 传入自定义日期范围数据（当前可能已支持或需小幅适配）
- 饼图组件复用 `DistributionPieChart` 逻辑
- `AppUsageList.tsx` 复用（含搜索功能 F-10）
- 快捷选项 Chip 点击 → 自动填充 DatePicker → 自动触发数据查询

**验收标准**:
- [ ] 日期选择器可选择任意起止日期（不晚于今天）
- [ ] 快捷选项（近 7/30 天、本月/上月）自动填充并查询
- [ ] 自定义范围图表使用真实数据正确渲染
- [ ] 应用排行按选择范围内的总时长降序排列
- [ ] 空数据范围显示"该时间段无数据"
- [ ] 切换回 Today/Weekly/Monthly 页面时各自独立工作

**涉及文件**: `electron/db/queries.ts`, `electron/main.ts`, `electron/preload.ts`, `src/pages/CustomRangePage.tsx` (新增), `src/components/layout/Sidebar.tsx`, `src/components/TimeChart.tsx`, `src/components/AppUsageList.tsx`, `src/types/models.ts`, `src/types/electron.ts`

---

### P2 — 国际化与体验增强

---

#### F-13: 多语言 i18n 支持

**背景**: 当前所有 UI 文本硬编码为中文。国际化是软件走向成熟的关键一步。

**技术选型**: `react-i18next` + `i18next` + `i18next-browser-languagedetector`

**增量变更**:

**依赖**: 新增 `react-i18next`, `i18next`, `i18next-browser-languagedetector` 到 package.json

**i18n 配置** (`src/i18n/index.ts` 新增):
- `i18next` 初始化配置
- 语言检测：`i18next-browser-languagedetector`，检测顺序：
  1. 本地存储 (`localStorage.getItem('language')`)
  2. 系统语言 (`navigator.language`)
  3. 默认回退：`zh-CN`
- 资源文件懒加载或内联（项目规模小时直接 import）
- fallbackLng: `zh-CN`

**翻译资源** (`src/i18n/locales/` 新增):
- `zh-CN.json` — 中文翻译键值对
- `en.json` — 英文翻译键值对
- 覆盖范围：所有页面、组件、设置项、图表标签、通知消息、菜单项
- 键命名规范：`{domain}.{component}.{key}`（如 `today.totalTime`, `settings.focus.title`）

**设置持久化**:
- 在 `settings` 表新增键 `language` (string, 默认 `"system"`)
- 用户在设置页选择语言后写入 settings 表 + i18next.changeLanguage()
- 应用启动时从 settings 读取语言首选项，覆盖检测结果

**UI 层——语言切换** (`src/pages/SettingsPage.tsx`):
- 设置页新增「语言 / Language」分区
- 选择控件：MUI ToggleButtonGroup 或 Select，选项：中文 / English / 跟随系统
- 切换后即时生效（i18next.changeLanguage），无需重启

**需翻译的文件清单**（全量覆盖）:
| 文件 | 翻译内容 |
|------|----------|
| `src/components/layout/Sidebar.tsx` | 导航项文字：今日/周报/月报/自定义/设置 |
| `src/pages/TodayPage.tsx` | 标题、卡片标签、图表标题、排行表头 |
| `src/pages/WeeklyPage.tsx` | 标题、环比文字、图表标题 |
| `src/pages/MonthlyPage.tsx` | 标题、环比文字、图表标题 |
| `src/pages/CustomRangePage.tsx` | 标题、快捷选项、统计卡片标签 |
| `src/pages/SettingsPage.tsx` | 所有设置分区标题和说明文字 |
| `src/components/StatusBar.tsx` | 追踪状态文字、专注模式状态 |
| `src/components/AppUsageList.tsx` | 搜索框 placeholder、表头、空状态提示 |
| `src/components/DurationCard.tsx` | 卡片标签（专注时间/分心时间等） |
| `src/components/TimeChart.tsx` | 图表标题、坐标轴标签、tooltip |
| `src/components/AboutDialog.tsx` | 关于信息 |
| `src/components/ErrorBoundary.tsx` | 错误提示 |
| `electron/main.ts` 托盘菜单 | 托盘右键菜单文字（今日概况/暂停/恢复/退出等） |

> 注意：主进程托盘菜单的文字也需翻译。方案：在 preload 暴露语言变更事件，托盘管理器监听并重建菜单；或简化方案——托盘菜单在渲染进程构建后通过 IPC 传递给主进程。

**验收标准**:
- [ ] 设置页可切换语言，切换后即时生效
- [ ] 默认跟随系统语言
- [ ] 中文界面所有文字正常显示（无 key 泄露）
- [ ] 英文界面所有文字正常显示（无 key 泄露）
- [ ] 设置持久化，重启后保持语言选择
- [ ] 托盘菜单文字随语言切换更新

**涉及文件**: `src/i18n/index.ts` (新增), `src/i18n/locales/zh-CN.json` (新增), `src/i18n/locales/en.json` (新增), `src/pages/SettingsPage.tsx`, `electron/main.ts` (托盘菜单), `package.json`, **以及上述翻译清单中所有 UI 文件**

---

## 四、UI 设计概要

### 4.1 页面导航变化

```
侧边栏导航（v3）
├── 📊 今日          (TodayPage)
├── 📈 周报          (WeeklyPage)
├── 📅 月报          (MonthlyPage)
├── 📆 自定义        (CustomRangePage) ← 新增
├── ⚙️ 设置          (SettingsPage)
```

### 4.2 今日页面——开启 Focus Mode 后的变化

```
┌──────────────────────────────────────────────────┐
│  🔔 专注模式 · 开  [状态栏]                       │
├──────────────────────┬───────────────────────────┤
│  🟢 专注时间          │  🟠 分心时间               │
│     4h 32m           │     1h 15m               │
│   VS Code / Chrome   │  WeChat / Steam / ...    │
├──────────────────────┴───────────────────────────┤
│  按应用 / 按专注·分心  [切换]                      │
│  ┌─────────────────────────────────────────────┐ │
│  │          饼图 / 柱状图                        │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  应用排行                           🔍 搜索...    │
│  ├─ VS Code   2h 30m  ████████░░  77%  🟢 专注   │
│  ├─ Chrome    1h 15m  ████░░░░░░  38%  🟢 专注   │
│  ├─ WeChat      45m  ██░░░░░░░░  12%  🔴 分心   │
│  └─ Steam       30m  █░░░░░░░░░   8%  🔴 分心   │
└──────────────────────────────────────────────────┘
```

### 4.3 自定义日期范围页面

```
┌──────────────────────────────────────────────────┐
│  自定义范围                                       │
│                                                   │
│  快捷选择: [近 7 天] [近 30 天] [本月] [上月]      │
│                                                   │
│  起始日期: [2026-05-15]  截止日期: [2026-06-07]   │
│                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐ │
│  │ 总时长    │ │ 活跃天数  │ │ 日均时长  │ │Top应用│ │
│  │ 48h 30m  │ │   23 天   │ │  2h 06m  │ │VS Code│ │
│  └──────────┘ └──────────┘ └──────────┘ └──────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │          日趋势折线图（复用 TimeChart）        │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │          应用排行（复用 AppUsageList）         │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 4.4 设置页——新增分区

```
设置页（v3 增量部分）
├── 专注模式 ← 新增
│   ├── 白名单应用选择器（MUI Autocomplete multi-select）
│   └── 已选白名单 Chip 列表
├── 语言 / Language ← 新增
│   ├── [中文] [English] [跟随系统] ToggleButtonGroup
│   └── 即时生效提示文字
├── 关于 ← 增强
│   ├── 当前版本：v3.0.0
│   └── [检查更新] 按钮（含状态指示）
└── 已有分区（使用限制 / 应用分类 / 隐私 / 数据管理 / 导出）
```

### 4.5 状态栏变化

```
修改前 (v2):
│ 🔴 正在追踪: VS Code │

修改后 (v3):
│ 🔴 正在追踪: VS Code  │  🎯 专注模式 · 开 │
                          ↑ 新增 Toggle，点击切换
```

---

## 五、与现有系统交互

### 5.1 涉及已有模块的变化

| 已有模块 | v3 交互方式 | 变化类型 |
|----------|-----------|----------|
| `electron/db/queries.ts` | 新增焦点模式查询、自定义范围查询、语言设置查询 | **扩展** |
| `electron/main.ts` | 新增 focus / update / custom-range IPC 通道 | **扩展** |
| `electron/preload.ts` | 新增对应 electronAPI 声明 | **扩展** |
| `electron/services/tracker-service.ts` | 在 app switch 回调中检查 focus_mode_enabled | **修改** |
| `electron/tray/tray-manager.ts` | 托盘菜单文字需支持语言切换 | **修改** |
| `src/components/layout/Sidebar.tsx` | 新增「自定义」导航项 | **修改** |
| `src/components/StatusBar.tsx` | 新增专注模式 Toggle | **修改** |
| `src/components/AppUsageList.tsx` | 新增搜索框 + 分心标记 | **修改** |
| `src/components/DurationCard.tsx` | 支持专注/分心双卡片 + 新的颜色主题 | **修改** |
| `src/components/TimeChart.tsx` | 支持自定义日期范围数据传入 | **修改** |
| `src/pages/TodayPage.tsx` | 专注/分心对比卡片 + 切换视图 | **修改** |
| `src/pages/SettingsPage.tsx` | 新增专注模式分区、语言分区、版本+更新分区 | **修改** |
| `src/pages/WeeklyPage.tsx` | 无直接变化（与 v2 环比逻辑兼容） | 不变 |
| `src/pages/MonthlyPage.tsx` | 无直接变化 | 不变 |
| `src/types/models.ts` | 新增 FocusMode、CustomRange 等类型 | **扩展** |
| `src/types/electron.ts` | 新增 IPC 接口声明 | **扩展** |
| `src/store/settingsStore.ts` | 新增 focusMode、language、updateState | **扩展** |
| `src/utils/constants.ts` | 新增相关常量 | **扩展** |
| `electron-builder.yml` | 新增 publish 配置 | **修改** |
| `package.json` | 新增 react-i18next、electron-updater 依赖 | **修改** |

### 5.2 新增文件

| 新增文件 | 说明 |
|----------|------|
| `src/pages/CustomRangePage.tsx` | 自定义日期范围统计页面 |
| `src/i18n/index.ts` | i18n 初始化配置 |
| `src/i18n/locales/zh-CN.json` | 中文翻译资源 |
| `src/i18n/locales/en.json` | 英文翻译资源 |
| `src/store/updateStore.ts` | 自动更新状态管理（或合并入 settingsStore） |

### 5.3 数据库变化

| 变更 | 说明 |
|------|------|
| `settings` 表新增 `focus_mode_enabled` (boolean) | 聚焦模式开关状态 |
| `settings` 表新增 `focus_whitelist` (JSON string) | 白名单应用列表（JSON 数组） |
| `settings` 表新增 `language` (string) | 语言首选项（"zh-CN" / "en" / "system"） |

> 注意: 不需要新增数据库表。专注模式白名单存储为 settings 中的 JSON 字符串，与现有架构一致。

---

## 六、实现顺序建议

```
Phase 1（P0，2-3 天）
  ├─ F-10: 应用搜索（最简单，独立改一个文件）
  ├─ F-11: 自动更新（基础设施，尽早建立分发管道）
  └─ F-09: Focus Mode 专注模式（核心功能，跨层改动多）

Phase 2（P1，1-2 天）
  └─ F-12: 自定义日期范围统计（新增页面 + 若干查询）

Phase 3（P2，1-2 天）
  └─ F-13: 多语言 i18n（全量翻译 + 组件适配，工作量最大但优先级最低）
```

---

## 七、不纳入本次迭代

以下功能明确不纳入 v3 范围：

- 专注模式定时计划（如"工作日 9:00-18:00 自动开启"）—— 留待 v4
- 云同步 / 多设备数据合并 —— 架构复杂度高，留待 v4
- 自定义配色主题 —— 需求不够明确，留待调研
- 移动端配套 App —— 跨平台跨度大，单独立项

---

## 八、待确认问题

| # | 问题 | 备选方案 | 建议 |
|---|------|----------|------|
| 1 | **专注模式触发分心提醒的时机？** | A) 切换应用时即时提醒（可能频繁打扰）；B) 分心累计超过 N 分钟后提醒；C) 仅标记不提醒（UI 可见即可） | **建议 C**，v3 不引入主动提醒弹窗，UI 标记已足够形成心理反馈。主动提醒可在 v4 作为「分心警戒线」功能迭代 |
| 2 | **托盘菜单翻译如何实现？** | A) 渲染进程构建后通过 IPC 传递菜单模板；B) 主进程独立加载语言资源（node.js 版 i18next）；C) 托盘菜单保持英文（简单方案） | **建议 A**，复用渲染进程翻译资源，避免主进程重复维护 |
| 3 | **自定义日期范围页面是否替换 Weekly/Monthly 页面？** | A) 独立页面（保留 Weekly/Monthly）；B) 升级 Weekly/Monthly 支持日期调整（替换现有页面） | **建议 A**，保留 Weekly/Monthly 作为快捷视图，自定义范围作为高级功能。互不干扰 |
| 4 | **自动更新的更新源？** | A) GitHub Releases（electron-updater 原生支持）；B) 私有更新服务器（需自建 infra） | **建议 A**，GitHub Releases 零成本、零配置，适合开源/小团队项目 |
| 5 | **i18n 翻译键的命名空间策略？** | A) 单一 `translation.json` 超大文件；B) 按页面拆分 namespace（`today.json`, `settings.json` 等） | **建议 A**（v3 阶段），当前 5 个页面翻译量不大，单一文件更易维护。后续翻译量增长到 500+ 条时再拆分 |

---

*文档版本：v1.0 | 作者：许清楚 (Xu) 产品经理 | 日期：2026-06-07*
