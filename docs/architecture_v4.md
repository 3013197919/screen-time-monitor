# Screen Time Monitor v4 增量架构设计

> 版本: v4.0 | 日期: 2026-06-07 | 基准版本: v3.0
>
> 本文档仅描述 v4 增量变更的架构设计，不重复已有架构。已有架构详见 `docs/system_design_v3.md`。

---

## 一、总体变更概览

v4 是「体验打磨」版本，4 个需求均为独立模块，改动范围可控。核心原则：**最小化对已有功能的入侵**。

| 需求 ID | 需求名称 | 涉及文件数 | 新增文件 | 修改文件 | 变更类型 |
|---------|---------|-----------|---------|---------|---------|
| E-01 | 首次使用引导 (Onboarding Wizard) | 5 | 1 | 4 | 新增组件 + 入口逻辑 |
| E-02 | 深色/浅色主题增强 | 5 | 0 | 5 | UI 增强（不改底层机制） |
| E-03 | 开机自启完善 | 7 | 1 | 6 | 引入新库 + 可靠性增强 |
| E-04 | 通知提醒（番茄钟+久坐） | 9 | 2 | 7 | 新增服务 + Store 扩展 |

> **不变模块**: ThemeContext 底层、数据库 Schema、追踪引擎核心逻辑、所有数据页面、托盘管理器。

---

## 二、新增/修改文件清单

### 2.1 新增文件

| # | 文件路径 | 所属需求 | 说明 |
|---|---------|---------|------|
| 1 | `src/components/onboarding/OnboardingWizard.tsx` | E-01 | 全屏 Dialog 引导向导，3 步 MUI Stepper |
| 2 | `electron/services/auto-launch-service.ts` | E-03 | 封装 `auto-launch` 库，提供 enable/disable/isEnabled |
| 3 | `electron/services/reminder-service.ts` | E-04 | 番茄钟 + 久坐提醒定时器服务 |
| 4 | `src/hooks/useReminder.ts` | E-04 | 渲染进程监听 Main→Renderer 推送事件，弹出 Web Notification |

### 2.2 修改文件

| # | 文件路径 | 所属需求 | 变更说明 |
|---|---------|---------|---------|
| 1 | `src/App.tsx` | E-01, E-02, E-04 | 新增 onboarding 入口逻辑、useReminder hook 挂载、深色模式 scrollbar/Drawer 微调 |
| 2 | `src/pages/SettingsPage.tsx` | E-01, E-02, E-03, E-04 | 新增「提醒」分区、「外观」分区（从通用中移出）、「重新引导」按钮、自启 Switch loading 状态 |
| 3 | `src/components/StatusBar.tsx` | E-02 | 新增主题快捷切换图标按钮（三态循环） |
| 4 | `electron/main.ts` | E-03, E-04 | `settings:set` 增强（auto_start 联动 AutoLaunchService）、启动时初始化 ReminderService、注册新 IPC 通道 |
| 5 | `electron/preload.ts` | E-03, E-04 | 新增 `app.getAutoStartStatus`、`reminder.onPomodoro`、`reminder.onSedentary` 接口 |
| 6 | `electron/tracker.ts` | E-04 | 追踪状态变化时通知 ReminderService |
| 7 | `src/store/settingsStore.ts` | E-03, E-04 | 新增 4 个提醒状态字段 + 4 个 actions；`setAutoStart` 增强（带回弹逻辑）；`loadSettings` 扩展 |
| 8 | `src/types/electron.ts` | E-03, E-04 | 新增 ElectronAPI 接口字段、IPC_CHANNELS 常量 |
| 9 | `src/i18n/locales/zh-CN.json` | E-01, E-02, E-03, E-04 | 新增 onboarding、reminder、theme-switch、appearance 等翻译 key |
| 10 | `src/i18n/locales/en.json` | E-01, E-02, E-03, E-04 | 同上，英文版本 |
| 11 | `package.json` | E-03 | 新增 `auto-launch` 依赖 |

### 2.3 不变文件

| 模块 | 说明 |
|------|------|
| `src/contexts/ThemeContext.tsx` | **不变** — E-02 仅消费其接口，不修改底层 |
| `electron/db/database.ts` | 数据库连接管理无变化 |
| `electron/db/migrations.ts` | Schema 无变化（不新增表） |
| `electron/db/queries.ts` | 查询层无变化 |
| `electron/tray/tray-manager.ts` 或 `electron/main.ts` 中 tray 逻辑 | 托盘菜单无变化 |
| `src/pages/TodayPage.tsx` | 无变化 |
| `src/pages/WeeklyPage.tsx` | 无变化 |
| `src/pages/MonthlyPage.tsx` | 无变化 |
| `src/pages/CustomRangePage.tsx` | 无变化 |
| `src/components/AppUsageList.tsx` | 无变化 |
| `src/components/TimeChart.tsx` | 无变化 |
| `src/store/trackerStore.ts` | 无变化 |

---

## 三、数据流设计

### 3.1 E-02: 主题快捷切换

```
StatusBar 主题图标点击
  │
  ├─→ useThemeMode().setMode(nextMode)
  │     │
  │     └─→ ThemeMode state 更新 → resolvedMode 计算 → MUI Theme 重建 → 全局重渲染
  │
  └─→ localStorage.setItem('theme', nextMode)  // 持久化

SettingsPage 外观分区 ToggleButtonGroup 点击
  │
  └─→ useThemeMode().setMode(selectedMode)  // 同上流程

App.tsx createAppTheme()
  │
  └─→ 根据 resolvedMode 微调 scrollbar 颜色、Drawer border
```

**关键点**: 纯前端流，无 IPC 通信。ThemeContext 底层不动，仅在其上层增加消费点。

### 3.2 E-03: 开机自启完善

```
SettingsPage Switch 点击
  │
  ├─→ settingsStore.setAutoStart(enabled)
  │     │
  │     ├─→ set({ autoStart: enabled })  // 乐观更新 UI
  │     │
  │     └─→ electronAPI.settings.set('auto_start', String(enabled))
  │           │
  │           └─→ [主进程] settings:set handler
  │                 │
  │                 ├─→ queries.setSetting('auto_start', value)  // DB 持久化
  │                 │
  │                 └─→ if key === 'auto_start':
  │                       value === 'true'
  │                         ? autoLaunchService.enable()   // 写注册表 + 写 DB
  │                         : autoLaunchService.disable()  // 删注册表 + 写 DB
  │
  └─→ Switch disabled + CircularProgress (等待 IPC 返回)
        │
        ├─→ 成功 → Switch 恢复
        └─→ 失败 → Switch 回弹 + Snackbar 提示

应用启动时（main.ts app.whenReady）
  │
  └─→ AutoLaunchService.init()
        │
        ├─→ 从 DB 读取 auto_start
        ├─→ 调用 autoLauncher.isEnabled()
        └─→ 若 DB 值与注册表不一致 → 以 DB 为准同步注册表
```

### 3.3 E-04: 通知提醒

```
设置页修改提醒设置
  │
  ├─→ settingsStore.setPomodoroEnabled/setPomodoroInterval/...
  │     │
  │     ├─→ set({ ... })  // 更新 Zustand state
  │     │
  │     └─→ electronAPI.settings.set(key, String(value))
  │           │
  │           └─→ [主进程] settings:set handler → queries.setSetting(...)
  │                 → ReminderService 在下次 tick 时自动读取最新值（不重启定时器）

追踪状态变化 → ReminderService 响应
  │
  ├─→ [主进程] WindowTracker
  │     │
  │     ├─→ start() / resume() → ReminderService.onTrackingStarted()
  │     ├─→ pause() → ReminderService.onTrackingPaused()
  │     └─→ idle detected → ReminderService.onIdleDetected()
  │
  └─→ ReminderService 内部定时器（每 60s 检查）
        │
        ├─→ 番茄钟: now - lastReminder >= pomodoroInterval && isTracking?
        │     │
        │     └─→ mainWindow.webContents.send('reminder:pomodoro-triggered')
        │           │
        │           └─→ [渲染进程] useReminder hook 监听到事件
        │                 │
        │                 └─→ new Notification('番茄钟提醒', { body: '...' })
        │
        └─→ 久坐: accumulatedSedentary >= sedentaryInterval && isTracking?
              │
              └─→ mainWindow.webContents.send('reminder:sedentary-triggered')
                    │
                    └─→ [渲染进程] useReminder hook
                          │
                          └─→ new Notification('久坐提醒', { body: '...' })
                               → 重置久坐计时器
```

**追踪状态变化的连锁反应**:

| 事件 | 番茄钟计时器 | 久坐计时器 |
|------|------------|-----------|
| start() / resume() | 继续累加（不清零） | 从 0 开始计时 |
| pause() | 暂停累加（保持当前值） | 重置为 0 |
| idle detected | 暂停累加 | 重置为 0 |
| stop() | 重置为 0 | 重置为 0 |

### 3.4 E-01: Onboarding Wizard

```
应用启动 (AppContent mount)
  │
  ├─→ useEffect 检查 localStorage.getItem('onboarding_completed')
  │
  ├─→ 若 null → setShowOnboarding(true)
  │     │
  │     └─→ <OnboardingWizard /> 全屏 Dialog 渲染
  │           │
  │           ├─→ Step 1 (欢迎) → 3 个 Feature Card（纯展示）
  │           ├─→ Step 2 (偏好设置)
  │           │     ├─→ 开机自启 Switch → settingsStore.setAutoStart()
  │           │     ├─→ 番茄钟 Switch/Select → settingsStore.setPomodoroEnabled/Interval()
  │           │     └─→ 久坐 Switch/Select → settingsStore.setSedentaryEnabled/Interval()
  │           │
  │           └─→ Step 3 (完成)
  │                 ├─→ 显示已选设置摘要（从 settingsStore 读取当前值）
  │                 ├─→ 点击「开始使用」
  │                 │     ├─→ localStorage.setItem('onboarding_completed', 'true')
  │                 │     └─→ setShowOnboarding(false)
  │                 └─→ Dialog 关闭 → 正常界面呈现
  │
  └─→ 若存在「true」→ 正常界面，跳过 Wizard

设置页「重新运行引导向导」
  │
  ├─→ localStorage.removeItem('onboarding_completed')
  ├─→ setShowOnboarding(true)
  └─→ Wizard Step 2 回填当前设置值（非默认值）
```

---

## 四、关键接口与类型

### 4.1 新增 IPC 通道

#### E-03: 开机自启

| 通道 | 方向 | 参数 | 返回 | 说明 |
|------|------|------|------|------|
| `app:get-auto-start-status` | Renderer→Main (invoke) | 无 | `{ enabled: boolean }` | 查询注册表自启状态 |

**电文格式 —— 已有通道 `settings:set` 增强**：
- 当 key === `'auto_start'` 时，除 DB 写入外，额外调用 `AutoLaunchService.enable()` / `disable()`
- 原有逻辑 `app.setLoginItemSettings({ openAtLogin: ... })` **移除**，完全由 AutoLaunchService 接管

#### E-04: 通知提醒

| 通道 | 方向 | 参数 | 说明 |
|------|------|------|------|
| `reminder:pomodoro-triggered` | Main→Renderer (send) | `{ intervalMinutes: number }` | 番茄钟到时推送 |
| `reminder:sedentary-triggered` | Main→Renderer (send) | `{ accumulatedMinutes: number }` | 久坐到时推送 |

> E-01 无新增 IPC 通道（Onboarding 纯前端逻辑）。

### 4.2 新增 TypeScript 类型

```typescript
// ── E-03: Auto-launch 类型 ──────────────────────────────

// AutoLaunchService 接口（仅 main process 使用）
interface AutoLaunchService {
  enable(): Promise<void>;
  disable(): Promise<void>;
  isEnabled(): Promise<boolean>;
}

// ── E-04: Reminder 类型 ─────────────────────────────────

// ReminderService 接口（仅 main process 使用）
interface ReminderService {
  onTrackingStarted(): void;
  onTrackingPaused(): void;
  onIdleDetected(): void;
  updateSettings(settings: ReminderSettings): void;
  destroy(): void;
}

interface ReminderSettings {
  pomodoroEnabled: boolean;
  pomodoroInterval: number;    // 分钟
  sedentaryEnabled: boolean;
  sedentaryInterval: number;   // 分钟
}

// ── ElectronAPI 扩展（src/types/electron.ts）────────────

interface ElectronAPI {
  // ... 已有字段不变 ...

  app: {
    // ... 已有 ...
    /** E-03: 查询注册表自启状态 */
    getAutoStartStatus: () => Promise<{ enabled: boolean }>;
  };

  reminder: {
    /** E-04: 订阅番茄钟提醒 */
    onPomodoro: (callback: (data: { intervalMinutes: number }) => void) => () => void;
    /** E-04: 订阅久坐提醒 */
    onSedentary: (callback: (data: { accumulatedMinutes: number }) => void) => () => void;
  };
}
```

### 4.3 新增 Settings Store 状态字段

```typescript
// src/store/settingsStore.ts — SettingsState 接口扩展

interface SettingsState {
  // ... 已有字段不变 ...

  // ── v4: E-04 提醒设置 ─────────────────────────────────
  pomodoroEnabled: boolean;       // 默认 true
  pomodoroInterval: number;       // 默认 25（分钟）
  sedentaryEnabled: boolean;      // 默认 true
  sedentaryInterval: number;      // 默认 60（分钟）

  // ── v4: E-04 新增 actions ─────────────────────────────
  setPomodoroEnabled: (enabled: boolean) => Promise<void>;
  setPomodoroInterval: (minutes: number) => Promise<void>;
  setSedentaryEnabled: (enabled: boolean) => Promise<void>;
  setSedentaryInterval: (minutes: number) => Promise<void>;
}
```

### 4.4 Settings 表新增 Key

| Key | 类型 | 默认值 | 所属需求 | 说明 |
|-----|------|--------|----------|------|
| `pomodoro_enabled` | `"true"` / `"false"` | `"true"` | E-04 | 番茄钟提醒开关 |
| `pomodoro_interval` | number string | `"25"` | E-04 | 番茄钟间隔（分钟），步长 5 |
| `sedentary_enabled` | `"true"` / `"false"` | `"true"` | E-04 | 久坐提醒开关 |
| `sedentary_interval` | number string | `"60"` | E-04 | 久坐间隔（分钟），步长 10 |

> 注: `auto_start` key 已在 v2 中存在，本次不新增。`onboarding_completed` 使用 localStorage 不在 settings 表。

### 4.5 Settings Store 的 SETTINGS_KEYS 扩展

```typescript
const SETTINGS_KEYS = {
  // ... 已有 key 不变 ...
  POMODORO_ENABLED: 'pomodoro_enabled',
  POMODORO_INTERVAL: 'pomodoro_interval',
  SEDENTARY_ENABLED: 'sedentary_enabled',
  SEDENTARY_INTERVAL: 'sedentary_interval',
} as const;
```

### 4.6 `settings:get-all` 返回 Key 列表扩展

`electron/main.ts` 中 `settings:get-all` handler 的 keys 数组新增：
```
'pomodoro_enabled', 'pomodoro_interval', 'sedentary_enabled', 'sedentary_interval'
```

---

## 五、组件树变更

### 5.1 变更前 (v3)

```
App
└─ ThemeContextProvider
   └─ ThemedApp
      ├─ CssBaseline
      ├─ HashRouter
      │  └─ AppContent
      │     ├─ Sidebar
      │     ├─ AnimatedRoutes
      │     │  ├─ TodayPage
      │     │  ├─ WeeklyPage
      │     │  ├─ MonthlyPage
      │     │  ├─ CustomRangePage
      │     │  └─ SettingsPage
      │     ├─ StatusBar
      │     └─ AboutDialog
      └─ [ErrorBoundary]
```

### 5.2 变更后 (v4)

```
App
└─ ThemeContextProvider           ← 不变
   └─ ThemedApp
      ├─ CssBaseline
      ├─ HashRouter
      │  └─ AppContent
      │     ├─ Sidebar
      │     ├─ AnimatedRoutes
      │     │  ├─ TodayPage
      │     │  ├─ WeeklyPage
      │     │  ├─ MonthlyPage
      │     │  ├─ CustomRangePage
      │     │  └─ SettingsPage    ← 修改：新增「提醒」「外观」分区 +「重新引导」按钮
      │     ├─ StatusBar          ← 修改：新增主题快捷切换图标
      │     ├─ AboutDialog
      │     └─ OnboardingWizard   ← 新增 (E-01)：全屏 Dialog，覆盖在所有内容上方
      │          (condition: showOnboarding === true)
      └─ [ErrorBoundary]
```

### 5.3 OnboardingWizard 挂载位置

OnboardingWizard 作为全屏 Dialog 挂载在 `AppContent` 内部（而非 ThemedApp 外部），原因：
- 需要访问 ThemeContext（MUI Dialog 需要正确的 theme）
- 需要访问 i18n（`useTranslation`）
- 需要访问 settingsStore（Step 2 写入设置）

```
AppContent
├── <Box sx={{ display: 'flex' }}>
│   ├── Sidebar
│   ├── AnimatedRoutes
│   └── StatusBar
├── <AboutDialog />
└── {showOnboarding && <OnboardingWizard onClose={...} />}
```

### 5.4 SettingsPage 分区布局变更

```
v3 分区顺序:                     v4 分区顺序:
  Tracking                         Tracking              (不变)
  App Limits                       App Limits            (不变)
  App Categories                   App Categories        (不变)
  Focus Mode                       Focus Mode            (不变)
  About                            Notifications         (新增 E-04)
  General (含 Theme + Language)    Appearance            (新独立 E-02)
  Data Management                  Language              (不变)
                                   About                 (不变)
                                   General (精简: 仅有自启 + 托盘)
                                   Data Management       (不变)
                                   ── 重新运行引导向导 ── (新增 E-01)
```

---

## 六、任务列表

实现顺序: **E-02 → E-03 → E-04 → E-01**

### Phase 1: E-02 主题增强

#### T-02-1: StatusBar 新增主题快捷切换图标
- **涉及文件**: `src/components/StatusBar.tsx`, `src/i18n/locales/zh-CN.json`, `src/i18n/locales/en.json`
- **依赖**: 无
- **验收标准**:
  - [ ] 状态栏右侧显示主题图标按钮（Sun/Moon/Monitor，使用 lucide-react 图标）
  - [ ] 点击可在 light→dark→system→light 三态循环
  - [ ] 切换即时生效，调用 `useThemeMode().setMode()` 完成
  - [ ] Tooltip 正确显示当前主题名称（走 i18n）
  - [ ] 图标颜色正确：light=黄色 Sun，dark=蓝色 Moon，system=灰色 Monitor

#### T-02-2: SettingsPage 主题分区重构
- **涉及文件**: `src/pages/SettingsPage.tsx`, `src/i18n/locales/zh-CN.json`, `src/i18n/locales/en.json`
- **依赖**: 无（可与 T-02-1 并行）
- **验收标准**:
  - [ ] 新增独立「外观 / Appearance」Section（从"通用"中移出）
  - [ ] 使用 ToggleButtonGroup 替代原 Select + MenuItem（风格与语言切换一致）
  - [ ] 三个 ToggleButton: [浅色] [深色] [跟随系统]
  - [ ] 点击直接调用 `setThemeMode()`，即显效果
  - [ ] 原 Select 实现已完整移除

#### T-02-3: MUI 主题深色模式微调
- **涉及文件**: `src/App.tsx`
- **依赖**: 无（可与 T-02-1/T-02-2 并行）
- **验收标准**:
  - [ ] 深色模式下 `::-webkit-scrollbar-thumb` 颜色更暗
  - [ ] 深色模式下 `MuiDrawer-paper` 的 border 颜色加深
  - [ ] 所有文本、卡片、图表、按钮在深色模式下清晰可读

### Phase 2: E-03 开机自启完善

#### T-03-1: 安装 auto-launch 依赖并创建 AutoLaunchService
- **涉及文件**: `electron/services/auto-launch-service.ts` (新增), `package.json`
- **依赖**: 无
- **验收标准**:
  - [ ] `npm install auto-launch@^5.0.6` 成功安装
  - [ ] `AutoLaunchService` 封装 `enable()`, `disable()`, `isEnabled()` 方法
  - [ ] 构造函数正确传入 `{ name: 'Screen Time Monitor', path: process.execPath }`
  - [ ] 开发者模式 (`app.isPackaged === false`) 下不触发注册表修改

#### T-03-2: electron/main.ts 集成 AutoLaunchService
- **涉及文件**: `electron/main.ts`
- **依赖**: T-03-1
- **验收标准**:
  - [ ] 应用启动时初始化 `AutoLaunchService` 实例
  - [ ] 启动时执行自检：若 DB `auto_start = true` 但注册表缺失 → 自动修复
  - [ ] `settings:set` handler 中 key === `auto_start` 时调用 AutoLaunchService
  - [ ] 移除原有的 `app.setLoginItemSettings()` 调用

#### T-03-3: preload + types 新增 IPC 接口
- **涉及文件**: `electron/preload.ts`, `src/types/electron.ts`
- **依赖**: T-03-2
- **验收标准**:
  - [ ] `preload.ts` 新增 `app.getAutoStartStatus` 接口
  - [ ] `src/types/electron.ts` ElectronAPI 接口扩展 `getAutoStartStatus`
  - [ ] `IPC_CHANNELS` 新增 `APP_GET_AUTO_START_STATUS` 常量
  - [ ] `main.ts` 注册 `app:get-auto-start-status` handler

#### T-03-4: SettingsPage + Store 自启增强
- **涉及文件**: `src/pages/SettingsPage.tsx`, `src/store/settingsStore.ts`, `src/i18n/locales/zh-CN.json`, `src/i18n/locales/en.json`
- **依赖**: T-03-3
- **验收标准**:
  - [ ] 点击 Switch 时添加 loading 状态（Switch disabled + CircularProgress）
  - [ ] `setAutoStart` 调用失败时 Switch 回弹到原状态 + Snackbar 提示
  - [ ] Switch 下方新增帮助文字（走 i18n）
  - [ ] 应用启动时自检修复注册表成功

### Phase 3: E-04 通知提醒

#### T-04-1: Settings Store 扩展提醒状态
- **涉及文件**: `src/store/settingsStore.ts`
- **依赖**: 无
- **验收标准**:
  - [ ] 新增 4 个状态字段: `pomodoroEnabled`, `pomodoroInterval`, `sedentaryEnabled`, `sedentaryInterval`
  - [ ] 新增 4 个 actions: `setPomodoroEnabled`, `setPomodoroInterval`, `setSedentaryEnabled`, `setSedentaryInterval`
  - [ ] `loadSettings()` 中正确读取 4 个新 key
  - [ ] `SETTINGS_KEYS` 常量扩展 4 个 key

#### T-04-2: ReminderService 主进程定时器服务
- **涉及文件**: `electron/services/reminder-service.ts` (新增)
- **依赖**: 无（可与 T-04-1 并行）
- **验收标准**:
  - [ ] 番茄钟计时器：每 60s 检查，累计时间 >= pomodoroInterval 时触发
  - [ ] 久坐计时器：追踪 active 时累加，达到 sedentaryInterval 时触发并重置
  - [ ] `onTrackingStarted()`: 番茄钟继续累加，久坐从 0 开始
  - [ ] `onTrackingPaused()`: 番茄钟暂停累加，久坐重置为 0
  - [ ] `onIdleDetected()`: 久坐重置为 0
  - [ ] 设置变更时自动读取 settings 表最新值
  - [ ] `destroy()` 方法清理所有定时器

#### T-04-3: main.ts + tracker.ts 集成 ReminderService
- **涉及文件**: `electron/main.ts`, `electron/tracker.ts`
- **依赖**: T-04-2
- **验收标准**:
  - [ ] main.ts 启动时初始化 ReminderService
  - [ ] main.ts 注册 `reminder:pomodoro-triggered` 和 `reminder:sedentary-triggered` push 通道
  - [ ] tracker.ts 在 start/resume/pause/idle 事件中通知 ReminderService
  - [ ] main.ts cleanup 中调用 `reminderService.destroy()`

#### T-04-4: preload + types + useReminder hook
- **涉及文件**: `electron/preload.ts`, `src/types/electron.ts`, `src/hooks/useReminder.ts` (新增)
- **依赖**: T-04-3
- **验收标准**:
  - [ ] preload.ts 新增 `reminder.onPomodoro` 和 `reminder.onSedentary` 接口
  - [ ] types/electron.ts ElectronAPI 新增 `reminder` 字段
  - [ ] `IPC_CHANNELS` 新增 `REMINDER_POMODORO_TRIGGERED` 和 `REMINDER_SEDENTARY_TRIGGERED`
  - [ ] useReminder hook 监听两个事件，弹出 Web Notification
  - [ ] 通知权限检查：`default` → 请求；`denied` → 静默跳过
  - [ ] 通知文案走 i18n

#### T-04-5: SettingsPage 新增「提醒」分区
- **涉及文件**: `src/pages/SettingsPage.tsx`, `src/i18n/locales/zh-CN.json`, `src/i18n/locales/en.json`
- **依赖**: T-04-1, T-04-4
- **验收标准**:
  - [ ] 新增「提醒 / Notifications」Section
  - [ ] 番茄钟: Switch（默认 on）+ Select 时间选择器（15-60 分钟，步长 5，默认 25）
  - [ ] 久坐: Switch（默认 on）+ Select 时间选择器（30-120 分钟，步长 10，默认 60）
  - [ ] 每个设置项有帮助文字（走 i18n）
  - [ ] 重启后设置持久化保持

#### T-04-6: App.tsx 集成 useReminder hook
- **涉及文件**: `src/App.tsx`
- **依赖**: T-04-4
- **验收标准**:
  - [ ] AppContent 中调用 `useReminder()`
  - [ ] 番茄钟和久坐通知正常弹出
  - [ ] 通知文案正确使用当前语言

### Phase 4: E-01 首次使用引导

#### T-01-1: OnboardingWizard 核心组件
- **涉及文件**: `src/components/onboarding/OnboardingWizard.tsx` (新增), `src/i18n/locales/zh-CN.json`, `src/i18n/locales/en.json`
- **依赖**: T-03-4 (自启接口), T-04-1 (提醒 Store 字段 + actions)
- **验收标准**:
  - [ ] 全屏 MUI Dialog，使用 MUI Stepper 展示 3 步
  - [ ] Step 1「欢迎」: Logo + 3 个 Feature Card
    - 「自动追踪」: 无需手动操作，自动记录每个应用的使用时长
    - 「数据洞察」: 日报/周报/月报，可视化你的时间去向
    - 「专注模式」: 设置白名单，屏蔽分心应用，保持专注
  - [ ] Step 2「偏好设置」:
    - 开机自启 Switch → 调用 `settingsStore.setAutoStart()`
    - 番茄钟提醒 Switch + 时间选择器 → 调用 `setPomodoroEnabled/Interval()`
    - 久坐提醒 Switch + 时间选择器 → 调用 `setSedentaryEnabled/Interval()`
  - [ ] Step 3「完成」:
    - CheckCircleOutline 大图标 + 绿色
    - 「一切就绪！」文案
    - 已选设置摘要（从 settingsStore 读取当前值显示）
    - 「开始使用」按钮
  - [ ] 每步底部「上一步」/「下一步」/「跳过」按钮（Step 3 无跳过）
  - [ ] Step 1 和 Step 2「跳过」→ 使用默认值进入 Step 3
  - [ ] 所有文案走 i18n

#### T-01-2: App.tsx 集成 Onboarding 入口
- **涉及文件**: `src/App.tsx`
- **依赖**: T-01-1
- **验收标准**:
  - [ ] AppContent 中新增 `showOnboarding` state
  - [ ] useEffect 检查 `localStorage.getItem('onboarding_completed')`
  - [ ] 首次启动自动展示 Wizard
  - [ ] Step 3「开始使用」→ 写入 localStorage + 关闭 Dialog
  - [ ] 关闭后正常进入主界面

#### T-01-3: SettingsPage 新增「重新运行引导向导」
- **涉及文件**: `src/pages/SettingsPage.tsx`, `src/i18n/locales/zh-CN.json`, `src/i18n/locales/en.json`
- **依赖**: T-01-2
- **验收标准**:
  - [ ] 设置页底部新增「重新运行引导向导」按钮（MUI Button variant="outlined"）
  - [ ] 点击后清除 `localStorage.removeItem('onboarding_completed')`
  - [ ] 重新触发 Wizard（`setShowOnboarding(true)` 需要跨组件传递）
  - [ ] 重跑时 Step 2 回填当前设置值（非默认值）

---

## 七、依赖包清单

### 7.1 新增依赖

| 包名 | 版本 | 类型 | 用途 | 所属需求 |
|------|------|------|------|----------|
| `auto-launch` | `^5.0.6` | dependency | 跨平台开机自启，通过注册表/plist/.desktop 实现 | E-03 |

### 7.2 无需新增/升级的已有依赖

| 场景 | 已有依赖 | 说明 |
|------|---------|------|
| Stepper 组件 | `@mui/material` ^6.0.0 | MUI Stepper 已内置，无需额外包 |
| 主题图标 | `lucide-react` ^0.500.0 | Sun/Moon/Monitor 图标已有 |
| Web Notification | 浏览器内置 API | 无需额外包 |
| Store 状态管理 | `zustand` ^5.0.0 | 仅扩展字段和 actions |
| i18n | `react-i18next` ^17.0.8 + `i18next` ^26.3.1 | 仅新增翻译 key |

---

## 八、待明确/风险项

### 8.1 待确认决策（PRD 已建议，需项目组确认）

| # | 决策项 | PRD 建议 | 影响 |
|---|--------|---------|------|
| 1 | Onboarding 触发判断 | 仅 localStorage | 不依赖 IPC，首屏加载更快。清缓存后重新引导反而合理 |
| 2 | 主题三态循环 | light→dark→system→light | 操作最简单，system 也是合法主题之一 |
| 3 | 番茄钟「重置」按钮 | v4 不加 | 减少 UI 复杂度，v4.1 可补充 |
| 4 | 久坐 idle 检测粒度 | 复用现有 5 分钟空闲阈值 | 保持一致性，减少重复代码 |
| 5 | 重跑引导时回填设置 | 回填当前值 | 用户感知这是「查看并修改」而非「重新选择」 |
| 6 | auto-launch 管理员权限 | 仅 HKCU | 覆盖绝大多数场景，减少复杂度 |

### 8.2 技术风险

| # | 风险项 | 影响范围 | 缓解措施 |
|---|--------|---------|---------|
| 1 | `auto-launch` 在 Windows 11 最新版本的兼容性 | E-03 | 验收标准要求开发者模式跳过；建议在 Windows 10 + 11 分别测试 |
| 2 | `active-win` 不可用时 ReminderService 状态获取 | E-04 | 开发模式下需确保 ReminderService 不会因 active-win 为 null 而崩溃；追踪状态由 WindowTracker 显式通知 |
| 3 | Web Notification API 在 Electron 中的权限 | E-04 | Electron 内 Notification 权限通常为 `granted`；增加 `denied` 静默降级处理 |
| 4 | MUI Stepper 在三步场景下的响应式表现 | E-01 | 全屏 Dialog 有足够空间；horizontal stepper 在三步时是最佳选择 |
| 5 | Onboarding 重跑时跨组件状态传递 | E-01 | SettingsPage 需要触发 AppContent 的 `showOnboarding` state。两种方案：A) 通过 URL query parameter 传递；B) 通过 Zustand store。**建议 A**（最小侵入，类似 `navigate('/?onboarding=true')`），或 B 新增 `uiStore` |
| 6 | 多个通知同时弹出的 UX | E-04 | 番茄钟（25min）和久坐（60min）周期不同，同时触发的概率极低。若同时触发，浏览器会排队显示 |

### 8.3 架构约束

| # | 约束 | 说明 |
|---|------|------|
| 1 | ThemeContext 底层不可修改 | E-02 仅消费 `useThemeMode()` 接口，不动 Provider 内部实现 |
| 2 | 数据库 Schema 不新增表 | 所有新配置走 settings KV 表 |
| 3 | ReminderService 不直接操作 DOM/UI | 通过 IPC push 事件到渲染进程，由 useReminder hook 弹出通知 |
| 4 | OnboardingWizard 不修改路由 | 作为全屏 Dialog 覆盖，不影响 react-router 的现有路由结构 |
| 5 | 不引入新的 Store | 提醒状态复用 settingsStore；Onboarding 状态在 AppContent 本地 state |
| 6 | AutoLaunchService 与现有 auto_start 逻辑兼容 | 启动时 OR 逻辑确保注册表与 DB 一致 |

---

*文档版本：v1.0 | 作者：高见远 (Gao) 架构师 | 日期：2026-06-07*
