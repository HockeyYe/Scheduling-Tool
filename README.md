# Coffee Scheduling Tool MVP

一个面向学校咖啡店排班负责人的轻量级静态网页工具。它可以在浏览器内录入店员可用时间、设置门店人力需求、自动生成周一至周五排班表，并支持本地保存和导出。

当前版本是最小 MVP：无后端、无数据库、无登录系统，所有数据保存在浏览器 `localStorage` 中。

## Features

- 员工管理：添加、删除、重命名员工，设置每周目标工时。
- 可用时间录入：按周一至周五、30 分钟粒度标记 `可排`、`忙碌`、`不偏好`，支持拖拽矩形选区后批量修改状态。
- 人力规则：默认 4 个营业时段，可调整每段所需人数。
- 排班算法：浏览器内运行 TypeScript 评分贪心算法。
- 结果查看：周视图排班表、缺人时段、高亮提示、员工工时统计。
- 手动调整：移除某时段员工，为缺人时段手动添加可用员工。
- 导出能力：项目 JSON、Excel 排班表、排班图片。
- 本地保存：刷新页面后数据不丢失。

## Tech Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- Zustand
- lucide-react
- xlsx
- html-to-image
- Vitest

## Project Architecture

```text
.
├── docs/
│   ├── 需求文档.md
│   ├── 技术栈文档.md
│   ├── availability-batch-editing-prd.md
│   ├── html-prototype.html
│   └── interactive-slider-prototype.html
├── src/
│   ├── app/
│   │   └── App.tsx
│   ├── features/
│   │   ├── exports/
│   │   │   └── exports.ts
│   │   ├── project/
│   │   │   ├── defaultProject.ts
│   │   │   └── useProjectStore.ts
│   │   └── scheduler/
│   │       ├── scheduler.ts
│   │       └── scheduler.test.ts
│   ├── lib/
│   │   ├── ids.ts
│   │   ├── storage.ts
│   │   ├── time.ts
│   │   └── time.test.ts
│   ├── styles/
│   │   └── globals.css
│   ├── types/
│   │   └── domain.ts
│   └── main.tsx
├── index.html
├── package.json
├── vite.config.ts
└── tailwind.config.ts
```

### Layer Responsibilities

#### `src/app`

页面展示层。当前 MVP 的主要 React UI 都集中在 `App.tsx` 中，包括：

- 左侧导航
- 顶部工具栏
- 员工与可用时间页
- 规则设置页
- 排班结果页
- 手动调整控件

MVP 阶段先集中在一个文件中，方便快速跑通。后续可以拆成 `EmployeeList`、`AvailabilityGrid`、`RulesPage`、`ScheduleTable` 等组件。

#### `src/features/project`

项目状态层。

- `defaultProject.ts`：示例员工、默认人力规则、默认可用时间。
- `useProjectStore.ts`：Zustand store，负责员工、可用时间、人力规则、算法参数、排班结果和 `localStorage` 持久化。

#### `src/features/scheduler`

排班算法层。

- `scheduler.ts`：纯 TypeScript 评分贪心排班算法。
- `scheduler.test.ts`：算法测试，验证硬约束和缺人提示。

算法会避开 `busy` 时间；`dispreferred` 可以排，但会降低候选员工评分。

排班还会为 `busy` 时间前后各预留 15 分钟通勤缓冲。判断方式不是简单四舍五入，而是检查 30 分钟排班格是否与“忙碌区间 + 缓冲”重叠；只要重叠，该格就不能排。

#### `src/features/exports`

导出层。

- JSON 导出/导入使用浏览器 File API。
- Excel 导出使用 `xlsx`。
- 图片导出使用 `html-to-image`。

#### `src/lib`

通用工具层。

- `time.ts`：生成周一至周五 08:00-16:30 的 30 分钟时间格。
- `storage.ts`：项目 JSON 序列化和解析。
- `ids.ts`：简单 ID 生成。

#### `src/types`

领域类型定义，包括 `Employee`、`AvailabilityStatus`、`TimeSlot`、`StaffingRule`、`SchedulerOptions`、`ScheduleResult` 等。

其中 `busyTimeBlocks` 是可选的精确忙碌区间数据，供后续 OCR/AI 课表导入使用，可以保留 `10:00-11:15` 这类非 30 分钟边界，再由排班算法按 15 分钟缓冲判断是否可排。

## Data Flow

```text
用户操作
  ↓
React UI
  ↓
Zustand Store
  ↓
localStorage 自动保存
  ↓
点击生成排班
  ↓
generateSchedule(input)
  ↓
ScheduleResult
  ↓
结果页展示 / 手动调整 / 导出
```

## Scheduling Model

MVP 固定营业范围：

- 周一至周五
- 08:00-16:30
- 30 分钟粒度
- 每天 17 个时间格
- 一周 85 个时间格

默认人力规则：

| 时段 | 所需人数 |
| --- | ---: |
| 08:00-10:00 | 2 |
| 10:00-12:00 | 1 |
| 12:00-14:00 | 2 |
| 14:00-16:30 | 1 |

### Commute Buffer

上课/忙碌时间默认前后各有 15 分钟通勤缓冲。由于排班表是 30 分钟粒度，系统使用区间重叠判断是否可排：

```text
slot.start < busyEndWithBuffer && slot.end > busyStartWithBuffer
```

例如课程 `10:00-11:15` 会按 `09:45-11:30` 判断不可排，因此 `09:30-10:00` 不可排，但 `09:00-09:30` 和 `11:30-12:00` 可排。

## Availability Editing

“员工与可用时间”页当前按单个员工编辑一周时间表。

- 单击或拖拽时间格可以选中一个或多个格子。
- 拖拽选区为矩形范围，适合快速标记连续课程或整段空闲时间。
- 选中格子后，点击上方 `可排`、`忙碌`、`不偏好` 按钮批量应用状态。
- 状态按钮只有在存在选区时可用，选中状态会使用与表格标签一致的颜色反馈。
- 将时间格改为 `忙碌` 后，如果该员工已在对应时段被排班，会自动从排班结果中移除并重新计算缺人和工时统计。

## Getting Started

### Install

```bash
npm install
```

### Run Locally

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173/
```

### Test

```bash
npm run test
```

### Build

```bash
npm run build
```

Production files are generated in `dist/`.

### Preview Production Build

```bash
npm run preview
```

## GitHub / Repository Notes

Recommended files to commit:

- `src/`
- `docs/`
- `index.html`
- `package.json`
- `package-lock.json`
- `README.md`
- config files such as `vite.config.ts`, `tailwind.config.ts`, `tsconfig*.json`

Do not commit:

- `node_modules/`
- `dist/`
- `external/`
- local logs or environment files

These are already covered by `.gitignore`.

## Current MVP Limitations

- 不支持账号登录。
- 不支持云端同步。
- 不支持多人协作。
- 不支持 OCR 识别课表截图。
- 不使用 AI 大模型。
- 不支持多门店。
- 不支持任意复杂日期例外规则。
- 可用时间批量选择当前只支持单员工表格内的矩形选区，不支持跨员工编辑或 Excel 式 Ctrl/Shift 追加选择。
- 排班算法是“稳定可解释、足够好”的 MVP 评分贪心算法，不是全局最优求解器。

## Suggested Next Refactors

- 将 `src/app/App.tsx` 拆成更小的 UI 组件。
- 将 Excel 和图片导出改为动态加载，降低首屏 bundle 体积。
- 增加更完整的手动替换员工交互。
- 为 Zustand store 增加更多单元测试。
- 后续如数据规模变大，可从 `localStorage` 迁移到 IndexedDB。
