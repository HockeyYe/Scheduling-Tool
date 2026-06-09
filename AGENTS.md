# AGENTS.md

本文件是本项目的 agent 开工前必读说明。每次开始新任务前，请先阅读本文件，再结合当前用户请求和实际代码状态行动。

## 项目概述

本项目是 `Coffee Scheduling Tool MVP`，一个面向学校咖啡店排班负责人的轻量级本地网页工具。

核心目标：

- 录入员工每周一至周五的可排班、忙碌、不偏好时间。
- 设置门店每个营业时段所需人数。
- 在浏览器内自动生成周一至周五排班表。
- 明确展示缺人时段、员工工时统计和偏好冲突。
- 支持手动调整排班结果。
- 支持本地保存，以及导入/导出 JSON、Excel、排班图片。

当前定位：

- 静态前端应用。
- 无后端。
- 无数据库。
- 无登录系统。
- 无多人协作。
- 所有核心数据保存在浏览器 `localStorage` 中。
- 排班算法在浏览器中用 TypeScript 运行，追求稳定、可解释、足够好的 MVP 结果，而不是全局最优求解。

默认排班模型：

- 排班范围：周一至周五。
- 默认营业时间：`08:00-16:30`。
- 时间粒度：30 分钟。
- 每天 17 个时间格，一周 85 个时间格。
- 默认人力规则：
  - `08:00-10:00` 需要 2 人。
  - `10:00-12:00` 需要 1 人。
  - `12:00-14:00` 需要 2 人。
  - `14:00-16:30` 需要 1 人。

## 技术栈

运行与构建：

- Vite
- React
- TypeScript
- Vitest

状态与数据：

- Zustand
- Zustand `persist` 中间件
- 浏览器 `localStorage`
- 浏览器 File API

样式与 UI：

- Tailwind CSS
- 全局 CSS 变量与手写布局样式
- lucide-react 图标
- 当前未实际引入 shadcn/ui 组件库，不要假设已存在 shadcn 组件。

导出：

- `xlsx` 用于 Excel 导出。
- `html-to-image` 用于排班图片导出。

常用命令：

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
npm run test
npm run build
npm run preview
```

## 目录职责

```text
src/
  app/
    App.tsx
  features/
    exports/
      exports.ts
    project/
      defaultProject.ts
      useProjectStore.ts
    scheduler/
      scheduler.ts
      scheduler.test.ts
  lib/
    ids.ts
    storage.ts
    time.ts
    time.test.ts
  styles/
    globals.css
  types/
    domain.ts
docs/
  需求文档.md
  技术栈文档.md
  html-prototype.html
  interactive-slider-prototype.html
```

主要职责：

- `src/app/App.tsx`：当前 MVP 的主要 React UI，包含导航、员工录入、规则设置、排班结果、手动调整和导出按钮。
- `src/types/domain.ts`：领域模型类型定义。修改数据结构时优先从这里开始。
- `src/lib/time.ts`：时间格生成、时间转换、按天筛选、计算所需人数等通用时间逻辑。
- `src/lib/storage.ts`：项目 JSON 导入/导出和基础校验。
- `src/lib/ids.ts`：本地 ID 生成。
- `src/features/project/defaultProject.ts`：示例员工、默认可用时间、人力规则和算法参数。
- `src/features/project/useProjectStore.ts`：Zustand store，负责状态变更、持久化、生成排班、手动调整和导入项目。
- `src/features/scheduler/scheduler.ts`：纯 TypeScript 排班算法和结果重算逻辑。
- `src/features/exports/exports.ts`：JSON、Excel、图片导出。
- `src/styles/globals.css`：全局视觉样式、响应式布局、表格/按钮/徽标等样式。
- `docs/`：产品需求、技术方案和早期原型参考。

## 核心数据约定

主要类型在 `src/types/domain.ts`：

- `DayKey` 固定为 `mon | tue | wed | thu | fri`。
- `AvailabilityStatus` 固定为：
  - `available`：可排班。
  - `busy`：课程/忙碌时间，硬约束，不可排。
  - `dispreferred`：不偏好但可排，软约束，会降低优先级。
- `TimeSlot.id` 当前格式为 `${day}-${HH:mm}`，例如 `mon-08:00`。
- `StaffingRule` 不包含 day 字段，当前同一组时段规则应用于周一至周五所有天。
- `AvailabilityMap` 结构是 `employeeId -> slotId -> status`。
- `ScheduleResult.assignments` 是扁平列表，同一时段可有多个员工。
- 每个时间格代表 0.5 小时，工时通过排班格数计算。

持久化约定：

- Zustand persist 的 key 是 `coffee-scheduling-tool-project`。
- 导出的项目 JSON 应包含：
  - `employees`
  - `availability`
  - `staffingRules`
  - `schedulerOptions`
  - `scheduleResult`
- 修改状态结构时，必须考虑旧 `localStorage` 数据和导入 JSON 的兼容性。

## 排班算法约定

当前算法位置：`src/features/scheduler/scheduler.ts`。

算法性质：

- 评分贪心算法。
- 每个时间格按 `getRequiredCount` 计算需要人数。
- 对每个岗位筛选可用员工，并按评分选择最高者。
- 生成后计算缺人、员工工时、偏好冲突、短班风险和总分。

硬约束：

- `busy` 时间不能排。
- 同一员工同一时间格不能重复排。
- 不允许为了凑满人数强行违反硬约束。
- 无法满足人数时必须保留已能安排的人，并记录 shortage。

软约束：

- `dispreferred` 可以排，但会扣偏好分。
- 尽量接近员工目标工时。
- 尽量保持班次连续。
- 尽量减少碎片化排班。
- `minShiftHours` 用于标记短班风险，目前不是阻止排班的硬拦截。

修改算法时必须同步关注：

- `scheduler.test.ts`
- `useProjectStore.ts` 中的 `generate`、`recalculateScheduleResult`、手动增删排班逻辑
- UI 中缺人、短班、员工统计的展示
- Excel 和图片导出结果是否仍和网页一致

## 开发约定

代码风格：

- 使用 TypeScript 严格模式。
- 所有新创建的文件和文件夹必须使用规范英文命名；除非用户特别强调，文件内部正文内容默认使用中文书写。
- 保持领域逻辑尽量纯函数化，尤其是 `scheduler.ts` 和 `time.ts`。
- UI 可以逐步拆分，但不要在没有必要时制造过度抽象。
- 新增类型优先放在 `src/types/domain.ts`，避免散落重复定义。
- 修改时间、排班、导出等核心逻辑时，优先补充或更新 Vitest 测试。
- 中文 UI 文案和中文文档统一使用 UTF-8 编码。

React/Zustand：

- 状态源以 `useProjectStore` 为准。
- 不要在组件内另建一套与 store 长期并行的业务状态。
- 修改员工、可用时间、人力规则后，如果已有排班结果，需要考虑是否重算 `scheduleResult`。
- 手动调整排班后必须重新计算缺人和员工统计。

时间与规则：

- 默认时间格由 `generateTimeSlots()` 统一生成，不要在多个文件里手写 85 个格子。
- 所需人数通过 `getRequiredCount(slot, staffingRules)` 计算。
- 如果未来支持不同日期规则，需要先调整 `StaffingRule` 类型和所有调用方，不要只改 UI。

导出：

- Excel 导出必须和网页周视图中的排班结果一致。
- 图片导出依赖 DOM 节点，请注意不要破坏 `scheduleRef` 的包裹范围。
- JSON 导入必须做基础结构校验，不要直接信任外部文件。

样式：

- 现有视觉主要在 `src/styles/globals.css` 中维护。
- 已有 CSS 变量包括颜色、间距、圆角、侧栏宽度、字号比例等，优先复用。
- 保持桌面和手机布局可用，改动大布局后检查响应式断点。

## 禁止事项

除非用户明确要求并确认范围，否则不要做以下事情：

- 不要引入后端服务、数据库、登录系统或云同步。
- 不要把排班核心改成依赖 AI 模型、远程 API 或网络服务。
- 不要引入 OR-Tools、WebAssembly 优化器或复杂全局求解器作为 MVP 默认路径。
- 不要强行安排 `busy` 的员工。
- 不要隐藏或吞掉缺人时段；无法排满时必须明确展示 shortage。
- 不要让导出结果与网页显示结果不一致。
- 不要随意更改 `TimeSlot.id` 格式，否则会破坏 availability、assignments、导入导出和 localStorage 数据。
- 不要随意清空或迁移 `localStorage` key，除非提供兼容迁移方案。
- 不要提交或依赖 `node_modules/`、`dist/`、`build/`、`.env*`、本地日志、编辑器配置。
- 不要在未检查现有数据流的情况下，把业务规则只写在 UI 层。
- 不要假设 README 或 docs 中的设计一定已经完整实现；以当前 `src/` 代码为准。

## 任务开始检查清单

每次接手任务前：

1. 阅读本文件。
2. 看用户当前目标，判断涉及 UI、算法、数据、导出还是文档。
3. 查看相关源码文件，不要只凭 README 推断。
4. 如果会改核心行为，先找对应测试。
5. 默认不要为了验证而配置测试环境、安装依赖或运行测试，因为沙盒环境下这类操作非常消耗 token 和时间；除非用户明确要求，否则由用户手动测试效果并反馈。
6. 大改 UI 后也不要主动配置浏览器或测试环境，除非用户明确要求；只需说明改动点和建议用户手动检查的路径。
7. 不要覆盖用户未要求修改的文件和改动。

## 当前已知限制

- 当前 MVP 不支持登录、云同步、多人协作、多门店、审批流、通知推送、OCR 和 AI 排班。
- `StaffingRule` 目前是全周共享规则，不支持同一时段在不同日期有不同人数。
- `minShiftHours` 当前主要用于短班风险标记，不是严格阻止排班的硬规则。
- `src/app/App.tsx` 仍是较大的单文件 UI，后续可以按页面和组件逐步拆分。
- 本仓库可能没有安装 `node_modules`，第一次运行测试或构建前需要先执行 `npm install`。
