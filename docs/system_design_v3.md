# Screen Time Monitor v3 — 增量系统设计文档

> 版本: v3.0 | 作者: 李稳建 (Architect) | 日期: 2026-06-07 | 基准: docs/system_design.md (v1)
>
> 本文档仅描述 v3 相对于当前代码库的增量变更，不重复已有架构。

---

## 1. 整体架构变更概览

### 1.1 模块变化矩阵

| 模块 | 变化类型 | 说明 |
|------|----------|------|
| `electron/main.ts` | **修改** | 新增 focus/update/custom-range IPC 处理器；app ready 后调用 autoUpdater |
| `electron/preload.ts` | **修改** | 新增 focus/update/custom-range/language IPC 声明 |
| `electron/tracker.ts` | **修改** | 在 `finalizeCurrentEvent()` 中读取 focus_mode，标记 distraction_type |
| `electron/db/queries.ts` | **修改** | 新增聚焦模式查询、自定义范围查询、FocusReport 查询 |
| `electron/db/migrations.ts` | **修改** | 新增 v2 迁移（app_events 加 distraction_type 列），或保持不变 |
| `electron-builder.yml` | **修改** | 新增 publish 配置段 |
| `package.json` | **修改** | 新增 electron-updater, react-i18next, i18next, i18next-browser-languagedetector |
| `src/App.tsx` | **修改** | NAV_ITEMS 新增 CustomRange；新增 /custom 路由 |
| `src/types/models.ts` | **修改** | 新增 FocusModeStatus, FocusReportData, CustomRangeReport, UpdateState, Language 等类型 |
| `src/types/electron.ts` | **修改** | 新增 focus/update/custom-range/language IPC 接口 |
| `src/store/settingsStore.ts` | **修改** | 新增 focusWhitelist, focusModeEnabled, language 状态 |
| `src/store/updateStore.ts` | **新增** | 自动更新状态管理 |
| `src/pages/TodayPage.tsx` | **修改** | Focus Mode 开启时显示专注/分心对比卡片 + 视图切换 |
| `src/pages/SettingsPage.tsx` | **修改** | 新增专注模式分区 + 语言分区 + 更新分区 |
| `src/pages/CustomRangePage.tsx` | **新增** | 自定义日期范围统计页面 |
| `src/components/StatusBar.tsx` | **修改** | 新增 Focus Mode Toggle 按钮 |
| `src/components/AppUsageList.tsx` | **修改** | 新增搜索框 + 专注/分心 Chip |
| `src/components/DurationCard.tsx` | **修改** | 新增 icon props 支持 |
| `src/i18n/index.ts` | **新增** | i18next 初始化配置 |
| `src/i18n/locales/zh-CN.json` | **新增** | 中文翻译资源 |
| `src/i18n/locales/en.json` | **新增** | 英文翻译资源 |
| `src/utils/constants.ts` | **修改** | 新增 focus/update/language 相关常量 |

### 1.2 不变模块

| 模块 | 说明 |
|------|------|
| `electron/db/database.ts` | 数据库连接管理无变化 |
| `electron/notifications.ts` | 通知服务无变化 |
| `src/pages/WeeklyPage.tsx` | 无直接变化 |
| `src/pages/MonthlyPage.tsx` | 无直接变化 |
| `src/components/TimeChart.tsx` | 复用，无变化（CustomRangePage 通过 data prop 传入不同数据） |
| `src/components/AboutDialog.tsx` | 无变化 |
| `src/components/ErrorBoundary.tsx` | 无变化 |
| `src/contexts/ThemeContext.tsx` | 无变化 |

---

## 2. 数据模型设计

### 2.1 新增 TypeScript 类型 (src/types/models.ts)

```typescript
// ─── F-09: Focus Mode ──────────────────────────────────────────

/** Focus mode status returned by getFocusStatus(). */
export interface FocusModeStatus {
  enabled: boolean;
  whitelist: string[];
}

/** Focus report for a specific date, broken down by app. */
export interface FocusReportData {
  date: string;
  focused_apps: AppUsageItem[];
  distracted_apps: AppUsageItem[];
  focused_total_seconds: number;
  distracted_total_seconds: number;
  total_seconds: number;
}

// ─── F-12: Custom Range ────────────────────────────────────────

/** Aggregated custom date range report. */
export interface CustomRangeReport {
  total_seconds: number;
  formatted_total: string;
  active_days: number;
  daily_average_seconds: number;
  formatted_daily_average: string;
  top_app_name: string | null;
  top_app_duration: number;
}

/** Daily trend data point for custom range chart. */
export interface DailyTrendItem {
  date: string;
  total_seconds: number;
}

/** App ranking for custom date range. */
export interface CustomRangeAppRankingItem {
  app_name: string;
  total_duration: number;
}

// ─── Extend TodaySummaryData ────────────────────────────────────

/** v3 扩展: TodaySummaryData 新增 focus 相关字段。 */
// 修改 TodaySummaryData 接口（扩展）:
// - 新增 focused_total_seconds?: number  (仅 Focus Mode 开启时返回)
// - 新增 distracted_total_seconds?: number (仅 Focus Mode 开启时返回)

// ─── Extend AppUsageItem ────────────────────────────────────────

/** v3 扩展: AppUsageItem 新增专注标记字段。 */
// 修改 AppUsageItem 接口（扩展）:
// - 新增 is_focused?: boolean  (仅 Focus Mode 开启时返回)

// ─── F-11: Auto Update ─────────────────────────────────────────

/** Auto-update state managed by updateStore. */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateInfo {
  status: UpdateStatus;
  version?: string;
  error?: string;
}
```

> **注意**: `app_events` 表结构不新增列。专注/分心判定在查询层动态完成——通过对比 `app_name` 与 `settings` 表中的 `focus_whitelist` JSON 数组。PRD 已明确此方案。
>
> 如果需要标记事件本身（而非仅在查询时判断），可选择在不修改表结构的前提下，利用 `window_title` 字段做标签（如 `[FOCUSED]` 前缀），但 PRD 明确选择"不修改 app_events 表结构"。当前设计严格遵循 PRD 决策。

### 2.2 数据库 settings 表新增 Key

| Key | Value 类型 | 默认值 | 说明 |
|-----|-----------|--------|------|
| `focus_mode_enabled` | `"true"` / `"false"` | `"false"` | 专注模式开关 |
| `focus_whitelist` | JSON string array | `"[]"` | 白名单应用列表，如 `["Code.exe","chrome.exe"]` |
| `language` | `"zh-CN"` / `"en"` / `"system"` | `"system"` | 语言首选项 |

---

## 3. Zustand Store 设计

### 3.1 settingsStore 扩展 (src/store/settingsStore.ts)

```typescript
interface SettingsState {
  // ── 现有字段（不变）────────────────────────────────────────
  autoStart: boolean;
  idleThresholdMinutes: number;
  autoTrackOnLaunch: boolean;
  notificationsEnabled: boolean;
  dataRetentionDays: number;
  privacyMode: boolean;
  showTray: boolean;
  limits: UsageLimit[];
  limitsLoading: boolean;
  limitsError: string | null;

  // ── F-09: Focus Mode（新增）────────────────────────────────
  focusModeEnabled: boolean;
  focusWhitelist: string[];

  // ── F-13: Language（新增）───────────────────────────────────
  language: 'zh-CN' | 'en' | 'system';

  // ── 现有 actions（不变）─────────────────────────────────────
  loadSettings: () => Promise<void>;
  updateSetting: (key: string, value: string) => Promise<void>;
  setAutoStart: (enabled: boolean) => Promise<void>;
  setIdleThreshold: (minutes: number) => Promise<void>;
  setPrivacyMode: (enabled: boolean) => Promise<void>;
  setShowTray: (enabled: boolean) => Promise<void>;
  loadLimits: () => Promise<void>;
  setLimit: (appName: string, limitMinutes: number) => Promise<void>;
  deleteLimit: (id: number) => Promise<void>;

  // ── F-09: Focus Mode actions（新增）─────────────────────────
  toggleFocusMode: () => Promise<void>;
  setFocusWhitelist: (appNames: string[]) => Promise<void>;

  // ── F-13: Language action（新增）────────────────────────────
  setLanguage: (lang: 'zh-CN' | 'en' | 'system') => Promise<void>;

  reset: () => void;
}
```

### 3.2 updateStore (src/store/updateStore.ts, 新增)

```typescript
interface UpdateState {
  // ── State ───────────────────────────────────────────────────
  status: UpdateStatus;       // 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  latestVersion: string | null;
  error: string | null;

  // ── Actions ─────────────────────────────────────────────────
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  setUpdateAvailable: (version: string) => void;
  setUpdateDownloaded: (version: string) => void;
  setUpdateError: (error: string) => void;
  reset: () => void;
}
```

### 3.3 trackerStore 扩展

```typescript
// trackerStore 新增:
//   focusReport: FocusReportData | null
//   focusReportLoading: boolean
//   fetchFocusReport: (date: string) => Promise<void>

// 新增 Custom Range 相关:
//   customReport: CustomRangeReport | null
//   customTrendData: DailyTrendItem[]
//   customAppRanking: AppUsageItem[]
//   customLoading: boolean
//   fetchCustomReport: (startDate: string, endDate: string) => Promise<void>
```

---

## 4. IPC 通道设计

### 4.1 完整 IPC 通道表

#### F-09: Focus Mode

| 通道名 | 方向 | 请求类型 | 响应类型 | 说明 |
|--------|------|----------|----------|------|
| `focus:get-status` | Renderer→Main (invoke) | 无 | `IpcResponse<FocusModeStatus>` | 获取专注模式状态和白名单 |
| `focus:toggle` | Renderer→Main (invoke) | `boolean` (enabled) | `IpcResponse<void>` | 切换专注模式开关 |
| `focus:set-whitelist` | Renderer→Main (invoke) | `string[]` (appNames) | `IpcResponse<void>` | 更新白名单 |
| `focus:get-report` | Renderer→Main (invoke) | `{ date: string }` | `IpcResponse<FocusReportData>` | 获取某日专注/分心报告 |

#### F-11: Auto Update

| 通道名 | 方向 | 请求类型 | 响应类型 | 说明 |
|--------|------|----------|----------|------|
| `app:check-for-updates` | Renderer→Main (invoke) | 无 | `IpcResponse<{ updateAvailable: boolean; version?: string }>` | 手动检查更新 |
| `app:install-update` | Renderer→Main (invoke) | 无 | `IpcResponse<void>` | 安装并重启 |
| `app:update-available` | Main→Renderer (send) | — | `{ version: string }` | 推送：发现新版本 |
| `app:update-downloaded` | Main→Renderer (send) | — | `{ version: string }` | 推送：下载完成 |

#### F-12: Custom Range

| 通道名 | 方向 | 请求类型 | 响应类型 | 说明 |
|--------|------|----------|----------|------|
| `data:get-custom-range-report` | Renderer→Main (invoke) | `{ startDate: string; endDate: string }` | `IpcResponse<CustomRangeReport>` | 自定义范围聚合报告 |
| `data:get-custom-range-trend` | Renderer→Main (invoke) | `{ startDate: string; endDate: string }` | `IpcResponse<DailyTrendItem[]>` | 每日趋势数据（折线图） |
| `data:get-custom-range-ranking` | Renderer→Main (invoke) | `{ startDate: string; endDate: string; limit: number }` | `IpcResponse<AppUsageItem[]>` | 日期范围内的应用排行 |

#### F-13: i18n (Tray Menu)

| 通道名 | 方向 | 请求类型 | 响应类型 | 说明 |
|--------|------|----------|----------|------|
| `tray:update-menu-labels` | Renderer→Main (send) | `{ labels: Record<string, string> }` | — | 通知主进程更新托盘菜单标签语言 |

### 4.2 通道名常量 (src/types/electron.ts 新增)

```typescript
// Focus
FOCUS_GET_STATUS: 'focus:get-status',
FOCUS_TOGGLE: 'focus:toggle',
FOCUS_SET_WHITELIST: 'focus:set-whitelist',
FOCUS_GET_REPORT: 'focus:get-report',

// Update
APP_CHECK_FOR_UPDATES: 'app:check-for-updates',
APP_INSTALL_UPDATE: 'app:install-update',
APP_UPDATE_AVAILABLE: 'app:update-available',
APP_UPDATE_DOWNLOADED: 'app:update-downloaded',

// Custom Range
DATA_GET_CUSTOM_RANGE_REPORT: 'data:get-custom-range-report',
DATA_GET_CUSTOM_RANGE_TREND: 'data:get-custom-range-trend',
DATA_GET_CUSTOM_RANGE_RANKING: 'data:get-custom-range-ranking',

// Tray i18n
TRAY_UPDATE_MENU_LABELS: 'tray:update-menu-labels',
```

---

## 5. 组件树变更

### 5.1 受影响的组件层次

```
App.tsx (修改)
├── ThemeProvider (不变)
│   ├── HashRouter (不变)
│   │   ├── Sidebar (修改: NAV_ITEMS 新增 CustomRange)
│   │   ├── main (不变)
│   │   │   ├── / → TodayPage (修改: F-09 专注/分心对比卡片)
│   │   │   │   ├── DurationCard (修改: icon prop)
│   │   │   │   ├── AppUsageList (修改: F-09 Chip + F-10 搜索框)
│   │   │   │   └── TimeChart (不变)
│   │   │   ├── /weekly → WeeklyPage (不变)
│   │   │   ├── /monthly → MonthlyPage (不变)
│   │   │   ├── /custom → CustomRangePage (新增: F-12)
│   │   │   │   ├── TimeChart (复用)
│   │   │   │   └── AppUsageList (复用)
│   │   │   └── /settings → SettingsPage (修改: F-09/F-11/F-13)
│   │   ├── StatusBar (修改: F-09 Focus Mode Toggle)
│   │   └── AboutDialog (不变)
```

### 5.2 新增/修改组件 Props 变化

**DurationCard** — 新增 props:
```typescript
interface DurationCardProps {
  title: string;
  value: string;
  subtitle?: string;
  color?: string;
  icon?: React.ReactNode;     // 新增: 卡片左侧图标
  chip?: React.ReactNode;     // 新增: 右上角 Chip（如 "专注"/"分心"）
}
```

**AppUsageList** — 新增 props:
```typescript
interface AppUsageListProps {
  apps: AppUsageItem[];
  title?: string;
  emptyMessage?: string;
  focusModeEnabled?: boolean;    // 新增: 是否显示专注/分心 Chip
  focusWhitelist?: string[];     // 新增: 白名单列表（用于判断标记）
}
```

**StatusBar** — 不新增 props，内部从 store 读取 focusModeEnabled。

---

## 6. 数据流设计

### 6.1 Focus Mode 开启 → 追踪 → UI 更新

```
用户点击 StatusBar Toggle
  → StatusBar 调用 electronAPI.focus.toggle(true)
    → Main: IPC 'focus:toggle' handler
      → queries.setSetting('focus_mode_enabled', 'true')
      → 返回 IpcResponse<{ success: true }>
  → settingsStore.toggleFocusMode() 更新本地 state
  → TodayPage useEffect 检测 focusModeEnabled 变化
    → 调用 electronAPI.focus.getReport(today)
      → Main: IPC 'focus:get-report' handler
        → 查询 daily_summary today
        → 读取 focus_whitelist
        → 动态分类: focused_apps vs distracted_apps
        → 返回 FocusReportData
  → TodayPage 渲染:
    - 两个 DurationCard (绿色专注 + 橙色分心)
    - AppUsageList 每行显示 🟢/🔴 Chip
```

**Tracker 层逻辑** (在 `WindowTracker.poll()` 中):
```
// 应用切换时检查 Focus Mode
if (this.currentApp 改变) {
  const focusEnabled = this.queries.getSetting('focus_mode_enabled') === 'true';
  // 不修改事件数据结构，仅记录日志
  if (focusEnabled) {
    const whitelistJson = this.queries.getSetting('focus_whitelist') || '[]';
    const whitelist = JSON.parse(whitelistJson);
    const isFocused = whitelist.includes(this.currentApp);
    console.log(`[Focus] ${this.currentApp}: ${isFocused ? 'FOCUSED' : 'DISTRACTED'}`);
  }
  // 继续正常记录事件（app_events 不增加字段）
}
```

### 6.2 自动更新检测 → 下载 → 通知

```
app.whenReady()
  → if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify()
    }
  → autoUpdater.on('update-available', (info) => {
      mainWindow.webContents.send('app:update-available', { version: info.version })
    })
    → 渲染进程: ipcRenderer.on('app:update-available', ...)
      → updateStore.setUpdateAvailable(version)

  → autoUpdater.on('update-downloaded', (info) => {
      mainWindow.webContents.send('app:update-downloaded', { version: info.version })
    })
    → 渲染进程: ipcRenderer.on('app:update-downloaded', ...)
      → updateStore.setUpdateDownloaded(version)
      → SettingsPage 按钮变为 "安装并重启"

手动检查:
  SettingsPage "检查更新" → updateStore.checkForUpdates()
    → window.electronAPI.app.checkForUpdates()
      → Main: autoUpdater.checkForUpdates()

安装:
  SettingsPage "安装并重启" → updateStore.installUpdate()
    → window.electronAPI.app.installUpdate()
      → Main: autoUpdater.quitAndInstall()
```

### 6.3 语言切换流程

```
用户在 SettingsPage 选择语言
  → settingsStore.setLanguage('en')
    → i18next.changeLanguage('en')
    → window.electronAPI.settings.set('language', 'en')
    → 所有使用了 t() 的组件立即重新渲染
    → SettingsPage 构建托盘菜单翻译 labels
      → window.electronAPI.tray.updateMenuLabels({
          todaySummary: t('tray.todaySummary'),
          pauseTracking: t('tray.pauseTracking'),
          resumeTracking: t('tray.resumeTracking'),
          openPanel: t('tray.openPanel'),
          quit: t('tray.quit'),
        })
      → Main: IPC 'tray:update-menu-labels' 接收 labels
        → rebuildTrayMenuWithLabels(labels)
```

---

## 7. 路由变更

### 当前路由 (App.tsx)
```typescript
<Route path="/" element={<TodayPage />} />
<Route path="/weekly" element={<WeeklyPage />} />
<Route path="/monthly" element={<MonthlyPage />} />
<Route path="/settings" element={<SettingsPage />} />
```

### v3 路由
```typescript
<Route path="/" element={<TodayPage />} />
<Route path="/weekly" element={<WeeklyPage />} />
<Route path="/monthly" element={<MonthlyPage />} />
<Route path="/custom" element={<CustomRangePage />} />       // 新增
<Route path="/settings" element={<SettingsPage />} />
```

### NAV_ITEMS 变更
```typescript
const NAV_ITEMS = [
  { label: 'Today', path: '/', icon: <TodayIcon /> },
  { label: 'Weekly', path: '/weekly', icon: <WeekIcon /> },
  { label: 'Monthly', path: '/monthly', icon: <MonthIcon /> },
  { label: 'Custom', path: '/custom', icon: <CalendarMonthIcon /> },  // 新增
  { label: 'Settings', path: '/settings', icon: <SettingsIcon /> },
];
```

---

## 8. 依赖管理

### 8.1 新增 npm 包

| 包名 | 版本建议 | 用途 |
|------|----------|------|
| `electron-updater` | `^6.3.0` | 自动更新检查与下载（F-11） |
| `react-i18next` | `^15.0.0` | React i18n 集成（F-13） |
| `i18next` | `^24.0.0` | 核心 i18n 框架（F-13） |
| `i18next-browser-languagedetector` | `^8.0.0` | 浏览器语言检测（F-13） |

### 8.2 安装命令
```bash
npm install electron-updater react-i18next i18next i18next-browser-languagedetector
```

---

## 9. 构建配置变更

### 9.1 electron-builder.yml 新增 publish 配置

```yaml
publish:
  provider: github
  owner: <repo-owner>
  repo: <repo-name>
```

> 注意：实际 `owner` 和 `repo` 需要在部署前配置为实际的 GitHub 仓库路径。开发阶段可留空注释。

---

## 10. 风险与注意事项

### 10.1 类型安全

- **Focus whitelist JSON 解析风险**: `settings` 表中 `focus_whitelist` 存储为 JSON 字符串，查询层解析时需 try-catch 保护。格式错误时回退为 `[]`。
- **IPC 接口扩展兼容性**: 修改 `ElectronAPI` 类型时需保持向后兼容，`getTodaySummary()` 返回的 `TodaySummaryData` 新增字段应为 optional。

### 10.2 向后兼容

- Focus Mode 关闭时，所有行为与 v2 完全一致。
- `focus_mode_enabled` settings key 不存在时默认视为 `false`。
- 白名单为空 + 开启 Focus Mode 时，所有时间归入"分心时间"（符合 PRD 要求）。
- 自定义日期范围页面独立存在，不替换 Weekly/Monthly。

### 10.3 Edge Cases

| 场景 | 处理方式 |
|------|----------|
| Focus Mode 开启时白名单为空 | 所有应用计入分心时间，UI 中专注时间为 0 |
| Focus Mode 开启后修改白名单 | 修改即时生效，已有追踪数据不受影响 |
| 自动更新检测网络错误 | 静默处理，不弹错误提示；updateStore 状态置为 'error' |
| 开发模式下 autoUpdater | `app.isPackaged === false` 时跳过所有自动更新逻辑 |
| 语言切换后未翻译的组件 | i18next fallbackLng 回退到 zh-CN |
| 自定义范围无数据 | 返回空报告（total_seconds=0），UI 显示 "该时间段无数据" |
| 托盘菜单翻译 labels 传递 | 如果渲染进程语言切换时主窗口未显示，批量重建菜单的代码跳过（无副作用） |
| sidebarCollapsed 与 i18n 导航文字 | collapsed 时不显示标签文字，无影响 |

### 10.4 架构决策记录 (ADR)

| # | 决策 | 理由 |
|---|------|------|
| 1 | 不修改 app_events 表结构 | PRD 明确要求 + 避免数据迁移复杂度 |
| 2 | Focus whitelist 存储为 settings JSON | 与现有 KV 设置架构一致，无需新建表 |
| 3 | 托盘菜单翻译使用渲染进程 IPC | 复用渲染进程翻译资源，避免主进程重复维护 i18n |
| 4 | CustomRangePage 独立页面（不替换 Weekly/Monthly） | 保留快捷视图，自定义范围作为高级功能 |
| 5 | i18n 单一 translation.json | 当前 5 个页面翻译量不大，单一文件更易维护 |
| 6 | updateStore 独立于 settingsStore | 关注点分离，update 生命周期与 settings 无关 |

### 10.5 当前代码库中的 Sidebar

当前 Sidebar 内联在 `App.tsx` 中（`Sidebar` 函数组件），非独立文件。修改时直接在 `App.tsx` 中操作 `NAV_ITEMS` 数组和 `Routes` 配置即可。

---

*文档版本：v1.0 | 作者：李稳建 (Architect) | 日期：2026-06-07*
