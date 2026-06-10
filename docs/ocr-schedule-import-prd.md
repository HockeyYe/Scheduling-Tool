# OCR 识别课表填充忙碌时间需求文档

## 1. 背景

当前 Coffee Scheduling Tool MVP 已支持排班负责人按员工手动录入周一至周五的可排班、忙碌、不偏好时间。实际使用中，员工通常会直接提交课程表截图，排班负责人再逐格标记忙碌时间，录入成本高，且容易漏标。

经过产品验证，接入 GLM-4.6V-Flash 能够直接理解课表截图并提取课程时间；同时该模型属于智谱官方免费视觉模型，适合承担“图片识别 + 课程时间结构化解析”的一体化任务。因此本期引入轻量后端能力，在保持 Cloudflare 架构和本地优先数据模式的前提下，实现“上传课表图片后自动覆盖当前员工忙碌时间”。

参考官方文档：

- 智谱 Chat Completions API 支持多模态消息输入，可通过 `image_url` 传入图片的 base64 data URL。
- 智谱模型概览中，`GLM-4.6V-Flash` 属于免费视觉模型，具备视觉推理能力。
- 智谱快速开始文档示例中，多模态输入使用 `messages[].content` 数组，同时包含 `text` 与 `image_url`。
- Cloudflare Pages Functions 可在 Pages 项目中加入服务端代码，不需要单独维护传统后端服务器。
- Cloudflare Workers/Pages 的 API Key 应通过 Secret 保存，不能写入前端代码或普通环境变量。

## 2. 产品目标

- 让排班负责人可以为当前选中员工上传一张课程表截图。
- 系统自动识别课程时间，并把识别出的课程时间转换为该员工的忙碌时间。
- 第一版不要求用户逐条确认，识别完成后直接覆盖当前员工原有忙碌时间。
- 覆盖后立即更新可用时间表、已有排班结果、缺人统计和员工工时统计。
- 在低置信度时明确提示用户复查，但仍按识别结果执行覆盖。
- API Key 只保存在 Cloudflare 后端 Secret 中，不暴露给浏览器。

## 3. 范围

### 3.1 本期必做

- 在“员工与可用时间”页面，为当前选中员工提供“识别课表”入口。
- 支持上传单张图片。
- 支持的格式：`png`、`jpg`、`jpeg`、`bmp`。前端可额外接受 `webp` 并提示不支持，或直接不展示为可选文件。
- 图片大小限制：前端和后端均限制不超过 8MB。
- 通过 Cloudflare Pages Functions 或 Worker 代理调用智谱 API。
- 后端调用 GLM-4.6V-Flash，直接从课表图片中解析结构化课程时间块。
- 只保留课程的 `employeeId`、`day`、`start`、`end`、`source`，不保存课程名、地点、教师等标签。
- 将解析出的周一至周五课程时间写入 `busyTimeBlocks`，`source` 为 `ocr`。
- 按现有 15 分钟通勤缓冲规则，把课程原始时间映射到 30 分钟排班格，并设置为 `busy`。
- 本期采用完全替换策略：识别成功后，覆盖该员工原有忙碌时间，包括手动编辑产生的忙碌状态。
- 识别出周末、晚上或营业时间外课程时，只在结果摘要中提示，不影响当前排班格。
- 若置信度低，展示复查提示，但仍然执行覆盖。
- 如果已有排班结果，被覆盖为忙碌的时间段应移除该员工已有排班，并重新计算缺人、工时、偏好冲突等结果。

### 3.2 本期不做

- 不支持 PDF、Excel、Word、教务系统链接。
- 不支持多图批量上传。
- 不支持跨员工批量识别。
- 不支持识别结果逐条确认后再写入。
- 不支持保留或展示课程名称、地点、教室。
- 不支持识别课表周次、单双周、节假日调课。
- 不支持把 OCR/AI 用作排班算法本身。
- 不新增登录、数据库、云同步或多人协作。

## 4. 用户角色与使用场景

主要用户是学校咖啡店排班负责人。负责人拿到某位员工发来的课表截图后，希望快速把这位员工的课程时间录入为忙碌时间，再继续生成或调整本周排班。

典型场景：

1. 负责人进入“员工与可用时间”页面。
2. 在左侧员工列表中选择员工。
3. 点击“识别课表”。
4. 上传该员工的课表截图。
5. 系统显示识别中状态。
6. 识别完成后，当前员工原有忙碌时间被新识别结果覆盖。
7. 页面提示覆盖了多少个课程时间块、影响了多少个排班格。
8. 如果置信度低，提示用户复查当前员工时间表。

## 5. 核心交互设计

### 5.1 页面入口

位置：`员工与可用时间` 页面，中间“可用时间录入”面板顶部工具区。

入口建议：

- 主按钮：`识别课表`
- 图标：优先使用 lucide-react 中的 `ScanText`、`Upload` 或相近图标。
- 按钮只在已选择员工时可用。
- 未选择员工时按钮置灰，提示“请先选择员工”。

按钮旁建议显示一句轻量提示：

```text
上传当前员工的课表图片，识别结果会覆盖该员工现有忙碌时间。
```

### 5.2 上传弹窗

点击“识别课表”后打开弹窗或抽屉。

弹窗内容：

- 标题：`识别课表`
- 当前员工：显示员工姓名。
- 文件上传区：
  - 支持点击选择图片。
  - 支持拖拽图片到上传区。
  - 显示格式与大小限制：`PNG / JPG / JPEG / BMP，8MB 内`。
- 覆盖说明：
  - `识别完成后会覆盖该员工当前所有忙碌时间，包括手动标记的忙碌时间。`
- 操作按钮：
  - `取消`
  - `开始识别`

交互规则：

- 未选择文件时，`开始识别` 不可点击。
- 文件类型不支持时，在上传区下方显示错误。
- 文件超过 8MB 时，不发起请求，直接提示。
- 上传弹窗中不提供 API Key 输入，API Key 由 Cloudflare 后端 Secret 管理。

### 5.3 识别中状态

用户点击“开始识别”后：

- 弹窗保持打开。
- 显示进度状态：`正在识别课表...`
- 禁用关闭以外的重复提交操作，或允许关闭但后台不继续处理。
- 建议展示两个步骤：
  - `正在读取图片文字`
  - `正在整理课程时间`

第一版不需要真实进度条，只需 loading 状态。

### 5.4 成功结果反馈

识别成功并写入后，弹窗可自动关闭，同时页面顶部 toast 提示：

```text
已为「员工姓名」覆盖忙碌时间：识别到 12 段课程，影响 28 个排班格。
```

如果有营业时间外或周末课程：

```text
已覆盖忙碌时间。另有 3 段课程不在当前排班范围内，未写入排班格。
```

如果置信度低：

```text
识别结果置信度较低，已按结果覆盖忙碌时间，请复查该员工时间表。
```

低置信度提示不阻断写入。

### 5.5 失败反馈

失败时不改变当前员工数据。

常见失败提示：

- 文件格式错误：`仅支持 PNG、JPG、JPEG、BMP 图片。`
- 文件过大：`图片不能超过 8MB。`
- 多模态识别失败：`课表识别失败，请稍后重试。`
- API Key 未配置：`课表识别服务尚未配置，请在 Cloudflare Secret 中配置 GLM_API_KEY。`
- 解析为空：`未识别到有效课程时间，当前忙碌时间未改变。`

### 5.6 覆盖后的表格反馈

识别写入后：

- 当前员工可用时间表立即刷新。
- 被 OCR 识别影响的忙碌格显示为现有 `忙碌` 状态。
- 第一版不需要给 OCR 忙碌格增加单独颜色，避免新增复杂视觉语义。
- 可在员工详情或工具区显示最近一次识别摘要：

```text
最近 OCR：识别 12 段课程，覆盖 28 个忙碌格，置信度正常。
```

该摘要可作为临时 UI 状态，不要求持久化。

## 6. 业务规则

### 6.1 识别结果覆盖策略

本期采用强覆盖：

- 覆盖当前员工所有 `busyTimeBlocks`。
- 覆盖当前员工所有 `availability[employeeId][slotId] === "busy"` 的格子。
- 保留当前员工 `dispreferred` 状态，除非该格被新 OCR 忙碌时间覆盖为 `busy`。
- 保留当前员工 `available` 状态。
- 覆盖后，新 OCR 课程影响到的格子统一设置为 `busy`。

解释：

- 用户当前明确选择“识别课表”时，产品语义是“用这张新课表重建该员工课程忙碌时间”。
- 即使原来有手动忙碌标记，本期也视为旧课程忙碌数据，一并替换。

### 6.2 时间范围处理

当前排班范围固定为：

- 周一至周五。
- 默认营业时间 `08:00-16:30`。
- 30 分钟粒度。

OCR 识别出的课程时间按以下规则处理：

- 周一至周五的课程进入 `busyTimeBlocks`。
- 周末课程不写入 `busyTimeBlocks`，只计入摘要提示。
- 营业时间外课程可以保留为 `busyTimeBlocks`，但不会影响 30 分钟排班格；为减少数据噪音，第一版建议只保存与当前排班时间范围有交集的课程块。
- 开始或结束时间不是 30 分钟边界时，必须保存原始时间，不要四舍五入。
- 映射排班格时沿用现有缓冲规则：课程开始前 15 分钟到课程结束后 15 分钟，只要与 30 分钟排班格重叠，该格就是忙碌。

### 6.3 置信度规则

GLM-4.6V-Flash 的多模态调用不应假设一定会返回传统 OCR 行级概率。本期置信度采用“模型自评 + 后端校验”的组合方式：

- Prompt 要求模型输出 `confidence.level`，可选值为 `normal`、`low`、`unknown`。
- 如果模型明确表示图片模糊、文字遮挡、星期或时间无法确定，应输出 `low`。
- 如果模型输出存在 JSON 修复、时间格式异常、日期缺失、课程时间互相冲突等问题，后端应把置信度降为 `low` 或直接判为解析失败。
- 如果模型没有给出可信的置信度信息，后端返回 `unknown`，前端按低置信度文案提示复查。

低置信度时：

- 不阻断覆盖。
- 返回 `confidenceLevel: "low"`。
- 前端显示复查提示。

### 6.4 空结果规则

如果 OCR 成功但无法解析出任何有效课程时间：

- 不覆盖当前员工忙碌时间。
- 提示用户未识别到有效课程时间。
- 允许用户重新上传更清晰图片。

## 7. 数据设计

### 7.1 现有类型复用

继续使用现有 `BusyTimeBlock`：

```ts
type BusyTimeBlock = {
  id: string;
  employeeId: string;
  day: DayKey;
  start: string;
  end: string;
  label?: string;
  source?: "manual" | "ocr" | "import";
};
```

本期 OCR 写入时：

- `employeeId` 为当前选中员工。
- `day` 为解析出的 `mon | tue | wed | thu | fri`。
- `start` 和 `end` 保存课程原始起止时间。
- `source` 固定为 `ocr`。
- `label` 不写入，或统一留空。

### 7.2 建议新增前端/后端传输类型

```ts
type OcrScheduleBlock = {
  day: DayKey;
  start: string;
  end: string;
};

type OcrScheduleImportResponse = {
  blocks: OcrScheduleBlock[];
  ignoredBlocks: Array<{
    reason: "weekend" | "out_of_range" | "invalid_time";
    rawText?: string;
  }>;
  confidence: {
    level: "normal" | "low" | "unknown";
    notes?: string[];
  };
  rawText?: string;
};
```

`rawText` 可用于本次调试或错误提示，第一版不需要持久化到项目数据。若担心隐私和日志风险，后端可以不返回完整模型原文，只返回结构化结果与置信度说明。

### 7.3 Store 层建议新增 action

```ts
replaceEmployeeBusyTimeFromOcr: (
  employeeId: string,
  blocks: Array<{
    day: DayKey;
    start: string;
    end: string;
  }>,
) => void;
```

行为：

- 删除该员工现有 `busyTimeBlocks`。
- 删除或清空该员工现有 `availability` 中所有 `busy` 状态。
- 为 OCR blocks 创建新的 `busyTimeBlocks`，`source: "ocr"`。
- 根据缓冲重叠规则计算受影响 slotIds。
- 将这些 slotIds 设置为 `busy`。
- 如果存在 `scheduleResult`，移除该员工在这些忙碌 slot 中的 assignment。
- 统一调用一次 `recalculateScheduleResult(get())`。

注意：

- 本 action 不应影响其他员工。
- 本 action 不应改变 `dispreferred`，除非被新 OCR busy 覆盖。
- 本 action 不应自动生成新的排班。

## 8. 技术架构

### 8.1 推荐架构

```text
React 前端
  |
  | 上传图片 FormData
  v
Cloudflare Pages Function / Worker
  |
  | 调用 GLM-4.6V-Flash，从图片直接解析课程时间 JSON
  v
结构化课程时间 blocks
  |
  v
React 前端写入 Zustand store + localStorage
```

采用后端代理的原因：

- API Key 不暴露在浏览器中。
- 便于统一限制文件大小和类型。
- 便于后续替换视觉模型或切换到专门 OCR 服务。
- 贴合 Cloudflare Pages/Workers 的轻量后端能力。

### 8.2 Cloudflare 侧接口

建议新增：

```text
POST /api/ocr/schedule
```

请求：

- `multipart/form-data`
- 字段：
  - `file`: 图片文件

响应成功：

```json
{
  "blocks": [
    { "day": "mon", "start": "10:00", "end": "11:15" }
  ],
  "ignoredBlocks": [],
  "confidence": {
    "level": "normal",
    "notes": []
  }
}
```

响应失败：

```json
{
  "error": {
    "code": "MODEL_FAILED",
    "message": "课表识别失败，请稍后重试。"
  }
}
```

### 8.3 环境变量与 Secret

Cloudflare Secret：

```text
GLM_API_KEY
```

可选普通环境变量：

```text
GLM_CHAT_ENDPOINT=https://open.bigmodel.cn/api/paas/v4/chat/completions
GLM_VISION_MODEL=glm-4.6v-flash
```

要求：

- `GLM_API_KEY` 必须用 Cloudflare Secret 配置。
- 不允许提交 `.env`、`.dev.vars` 或任何真实 Key。
- 前端永远不读取或展示 API Key。

### 8.4 智谱调用流程

后端收到图片后，将图片转成 base64 data URL，并通过 Chat Completions 的多模态消息传给 GLM-4.6V-Flash。

- Endpoint：`https://open.bigmodel.cn/api/paas/v4/chat/completions`
- Method：`POST`
- Header：
  - `Authorization: Bearer ${GLM_API_KEY}`
  - `Content-Type: application/json`
- Model：`glm-4.6v-flash`
- 输入：图片 data URL + 结构化解析指令。
- 输出：严格 JSON。

建议 system prompt：

```text
你是课表图片解析器。请直接阅读用户上传的课表图片，提取周一至周五的课程时间。
只输出 JSON，不要输出解释。
day 只能是 mon、tue、wed、thu、fri。
start 和 end 必须是 HH:mm 24 小时格式。
无法确定日期或时间的条目不要输出到 blocks，放入 ignoredBlocks。
不要输出课程名称、地点、教师。
如果图片模糊、文字遮挡、星期或时间无法确定，请将 confidence.level 设为 low。
```

建议输出 JSON 结构：

```json
{
  "blocks": [
    { "day": "mon", "start": "10:00", "end": "11:15" }
  ],
  "ignoredBlocks": [
    { "reason": "invalid_time", "rawText": "..." }
  ],
  "confidence": {
    "level": "normal",
    "notes": []
  }
}
```

后端必须校验模型输出，不能直接信任。

请求体示例：

```json
{
  "model": "glm-4.6v-flash",
  "messages": [
    {
      "role": "system",
      "content": "你是课表图片解析器，只输出 JSON。"
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "请从这张课表图片中提取周一至周五课程时间。"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,..."
          }
        }
      ]
    }
  ],
  "temperature": 0.1
}
```

## 9. 解析与校验规则

后端拿到 GLM 输出后必须做校验：

- `day` 必须属于 `mon | tue | wed | thu | fri`。
- `start`、`end` 必须匹配 `HH:mm`。
- `start < end`。
- 时间不得跨天。
- 重复 block 去重。
- 完全重叠或相邻课程可以不合并，第一版保持原始块更利于调试。
- 无效 block 放入 `ignoredBlocks`，不传给前端写入。

前端收到 blocks 后也应做轻量防御校验，避免异常响应污染 store。

## 10. 与排班结果联动

OCR 覆盖完成后：

- 如果当前没有 `scheduleResult`，只更新员工可用时间表。
- 如果已有 `scheduleResult`：
  - 删除该员工在新忙碌格中的 assignment。
  - 重新计算缺人时段。
  - 重新计算员工工时。
  - 重新计算偏好冲突和短班风险。
- 不自动重新生成完整排班。

原因：

- 用户可能已经手动调整过排班，OCR 导入只应移除违反硬约束的安排。
- 是否重新生成完整排班由用户继续点击“生成排班”决定。

## 11. 错误处理

### 11.1 前端错误

- 未选择员工：禁用入口。
- 未选择文件：禁用提交。
- 文件类型不支持：阻止提交并提示。
- 文件超过 8MB：阻止提交并提示。

### 11.2 后端错误

错误码建议：

- `MISSING_API_KEY`: Cloudflare Secret 未配置。
- `INVALID_FILE_TYPE`: 文件格式不支持。
- `FILE_TOO_LARGE`: 文件超过 8MB。
- `MODEL_FAILED`: 智谱多模态模型调用失败。
- `PARSE_FAILED`: GLM-4.6V-Flash 结构化解析失败。
- `NO_VALID_BLOCKS`: 未解析到有效课程时间。
- `UPSTREAM_RATE_LIMITED`: 上游限流。
- `UPSTREAM_UNAVAILABLE`: 上游服务不可用。

后端不应把上游完整错误体直接透传给前端，避免泄露内部信息或 API 细节。

## 12. 安全与隐私

- API Key 只存在 Cloudflare Secret。
- 图片只在本次请求中转发给智谱，不在本项目后端持久化。
- 前端不把图片存入 localStorage。
- 前端只持久化最终 busy blocks 和 availability。
- 如果后续增加日志，不能记录图片 base64、模型完整输出或 API Key。
- 请求接口需限制方法为 `POST`，并校验 `Content-Type`。

## 13. 开发拆分建议

### 13.1 Cloudflare 后端

新增文件建议：

```text
functions/
  api/
    ocr/
      schedule.ts
```

职责：

- 接收图片。
- 校验文件类型和大小。
- 调用智谱 OCR。
- 计算置信度。
- 调用 GLM-4.6V-Flash 解析结构化 JSON。
- 校验并返回标准响应。

### 13.2 前端 API client

新增文件建议：

```text
src/features/ocr/ocrClient.ts
```

职责：

- 封装 `/api/ocr/schedule` 请求。
- 处理 loading、错误和响应类型。
- 不包含任何 GLM API Key 或上游 endpoint。

### 13.3 Store

修改：

```text
src/features/project/useProjectStore.ts
src/types/domain.ts
src/lib/time.ts
```

建议：

- 在 store 增加 `replaceEmployeeBusyTimeFromOcr`。
- 若现有 `time.ts` 已有重叠判断能力，复用它。
- 若没有统一函数，新增纯函数用于把 `BusyTimeBlock[]` 映射成受影响 slotIds。

### 13.4 UI

修改：

```text
src/app/App.tsx
src/styles/globals.css
```

建议：

- 在当前单文件 UI 中先实现入口和弹窗。
- 不急于大拆组件，避免 OCR 功能和 UI 重构互相放大风险。
- 弹窗样式沿用现有按钮、badge、panel、toast 风格。

### 13.5 测试

建议优先补 store 和纯函数测试：

- OCR blocks 覆盖当前员工所有旧 busy。
- OCR blocks 不影响其他员工。
- OCR blocks 按 15 分钟缓冲映射到 busy slot。
- 已有排班中，员工在新 busy slot 的 assignment 被移除。
- 低置信度响应仍然会写入。
- 空 blocks 不覆盖现有数据。

后端测试可用 mock fetch：

- 文件类型校验。
- 文件大小校验。
- OCR 上游失败。
- GLM 输出非法 JSON。
- GLM 输出含非法 day/time。

## 14. 验收标准

### 14.1 基础流程

- 选择员工后，可以点击“识别课表”。
- 上传支持格式且小于 8MB 的图片后，可以开始识别。
- 识别完成后，当前员工可用时间表出现新的忙碌格。
- 当前员工原有忙碌格被完全替换。
- 其他员工的忙碌时间不受影响。

### 14.2 覆盖逻辑

- 原手动标记为 busy 的格子，如果不在新 OCR 结果中，会恢复为 available。
- 原 dispreferred 格子，如果不在新 OCR 结果中，保持 dispreferred。
- 新 OCR 结果影响的格子统一变为 busy。
- OCR 课程原始时间不是 30 分钟边界时，仍按 15 分钟缓冲和重叠规则正确映射。

### 14.3 排班联动

- 如果已有排班结果，OCR 覆盖后该员工不会继续出现在新 busy slot 中。
- 因移除 assignment 产生的缺人时段会显示在结果页。
- 员工工时统计会更新。
- 系统不会自动重新生成完整排班。

### 14.4 置信度与失败

- 低置信度时，系统提示用户复查。
- 低置信度不会阻断写入。
- OCR 或解析失败时，不改变当前员工数据。
- 未解析到有效课程时，不改变当前员工数据。

### 14.5 安全

- 浏览器网络请求中看不到智谱 API Key。
- 代码仓库中没有真实 API Key。
- Cloudflare Secret 未配置时，前端能看到明确错误提示。

## 15. 后续版本规划

- 增加识别结果确认面板，支持逐条编辑、删除、确认后再写入。
- 支持保留课程名、地点，用于复查。
- 支持多图上传。
- 支持 PDF 课表。
- 支持单双周、周次范围。
- 支持 OCR 历史记录和撤销。
- 支持“只替换 OCR 来源忙碌时间，保留手动忙碌时间”的更温和策略。
- 支持用户在 UI 中配置 OCR 置信度阈值。
