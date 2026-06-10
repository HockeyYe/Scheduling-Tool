type Env = {
  GLM_API_KEY?: string;
  GLM_CHAT_ENDPOINT?: string;
  GLM_VISION_MODEL?: string;
};

type PagesContext = {
  request: Request;
  env: Env;
};

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri";

type OcrScheduleBlock = {
  day: DayKey;
  start: string;
  end: string;
};

type OcrIgnoredBlock = {
  reason: "weekend" | "out_of_range" | "invalid_time" | "uncertain";
  rawText?: string;
};

type OcrConfidence = {
  level: "normal" | "low" | "unknown";
  notes?: string[];
};

type ModelSchedulePayload = {
  blocks?: unknown;
  ignoredBlocks?: unknown;
  confidence?: unknown;
};

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const CHAT_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const VISION_MODEL = "glm-4.6v-flash";
const COMMUTE_BUFFER_MINUTES = 15;
const SCHEDULE_START_MINUTES = 8 * 60;
const SCHEDULE_END_MINUTES = 16 * 60 + 30;
const DAY_KEYS = new Set(["mon", "tue", "wed", "thu", "fri"]);
const IGNORED_REASONS = new Set(["weekend", "out_of_range", "invalid_time", "uncertain"]);

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

function errorResponse(code: string, message: string, status = 400) {
  return jsonResponse({ error: { code, message } }, { status });
}

function isSupportedImage(file: File) {
  const allowedTypes = new Set(["image/png", "image/jpeg", "image/bmp"]);
  return allowedTypes.has(file.type) || /\.(png|jpe?g|bmp)$/i.test(file.name);
}

function isTimeString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function rangesOverlap(
  startMinutes: number,
  endMinutes: number,
  otherStartMinutes: number,
  otherEndMinutes: number,
) {
  return startMinutes < otherEndMinutes && endMinutes > otherStartMinutes;
}

function overlapsScheduleRange(start: string, end: string) {
  return rangesOverlap(
    timeToMinutes(start) - COMMUTE_BUFFER_MINUTES,
    timeToMinutes(end) + COMMUTE_BUFFER_MINUTES,
    SCHEDULE_START_MINUTES,
    SCHEDULE_END_MINUTES,
  );
}

function stripCodeFence(content: string) {
  const trimmed = content.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

function extractContentText(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (part && typeof part === "object" && "text" in part) {
        return typeof part.text === "string" ? part.text : "";
      }
      return "";
    })
    .join("\n");
}

function normalizeConfidence(confidence: unknown, forcedLow: boolean): OcrConfidence {
  if (forcedLow) {
    return { level: "low", notes: ["部分识别结果需要后端修正或丢弃。"] };
  }

  if (!confidence || typeof confidence !== "object") {
    return { level: "unknown", notes: ["模型未返回置信度。"] };
  }

  const raw = confidence as Record<string, unknown>;
  const level =
    raw.level === "normal" || raw.level === "low" || raw.level === "unknown"
      ? raw.level
      : "unknown";
  const notes = Array.isArray(raw.notes)
    ? raw.notes.filter((item): item is string => typeof item === "string")
    : undefined;

  return { level, notes };
}

function normalizeIgnoredBlocks(value: unknown): OcrIgnoredBlock[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      reason: IGNORED_REASONS.has(String(item.reason))
        ? (item.reason as OcrIgnoredBlock["reason"])
        : "uncertain",
      rawText: typeof item.rawText === "string" ? item.rawText : undefined,
    }));
}

function normalizeBlocks(payload: ModelSchedulePayload) {
  const blocks: OcrScheduleBlock[] = [];
  const ignoredBlocks = normalizeIgnoredBlocks(payload.ignoredBlocks);
  let forcedLowConfidence = false;
  const seen = new Set<string>();

  if (Array.isArray(payload.blocks)) {
    for (const item of payload.blocks) {
      if (!item || typeof item !== "object") {
        forcedLowConfidence = true;
        ignoredBlocks.push({ reason: "invalid_time" });
        continue;
      }

      const block = item as Record<string, unknown>;
      const day = typeof block.day === "string" ? block.day : undefined;
      const start = typeof block.start === "string" ? block.start : undefined;
      const end = typeof block.end === "string" ? block.end : undefined;

      if (
        !day ||
        !DAY_KEYS.has(day) ||
        !isTimeString(start) ||
        !isTimeString(end) ||
        timeToMinutes(start) >= timeToMinutes(end)
      ) {
        forcedLowConfidence = true;
        ignoredBlocks.push({
          reason: "invalid_time",
          rawText: typeof block.rawText === "string" ? block.rawText : undefined,
        });
        continue;
      }

      if (!overlapsScheduleRange(start, end)) {
        ignoredBlocks.push({ reason: "out_of_range" });
        continue;
      }

      const key = `${day}-${start}-${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push({ day: day as DayKey, start, end });
    }
  }

  return {
    blocks,
    ignoredBlocks,
    confidence: normalizeConfidence(payload.confidence, forcedLowConfidence),
  };
}

function parseModelPayload(content: string) {
  const parsed = JSON.parse(stripCodeFence(content)) as ModelSchedulePayload;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid model payload");
  }
  return normalizeBlocks(parsed);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function buildPrompt() {
  return [
    "请从这张课表图片中提取周一至周五课程时间。",
    "只输出 JSON，不要输出解释、Markdown 或代码块。",
    "JSON 结构必须是：",
    '{"blocks":[{"day":"mon","start":"10:00","end":"11:15"}],"ignoredBlocks":[],"confidence":{"level":"normal","notes":[]}}',
    "day 只能是 mon、tue、wed、thu、fri。",
    "start 和 end 必须是 HH:mm 24 小时格式。",
    "当前排班范围是 08:00-16:30，课程前后有 15 分钟通勤缓冲；完全不影响此范围的课程请放入 ignoredBlocks，reason 为 out_of_range。",
    "无法确定日期或时间的条目不要放入 blocks，请放入 ignoredBlocks。",
    "不要输出课程名称、地点、教师。",
    "如果图片模糊、文字遮挡、星期或时间无法确定，请将 confidence.level 设为 low。",
  ].join("\n");
}

export const onRequestPost = async ({ request, env }: PagesContext) => {
  if (!env.GLM_API_KEY) {
    return errorResponse(
      "MISSING_API_KEY",
      "课表识别服务尚未配置，请在 Cloudflare Secret 中配置 GLM_API_KEY。",
      500,
    );
  }

  const formData = await request.formData().catch(() => undefined);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return errorResponse("INVALID_FILE_TYPE", "请上传一张课表图片。");
  }

  if (!isSupportedImage(file)) {
    return errorResponse("INVALID_FILE_TYPE", "仅支持 PNG、JPG、JPEG、BMP 图片。");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return errorResponse("FILE_TOO_LARGE", "图片不能超过 8MB。");
  }

  const dataUrl = `data:${file.type || "image/jpeg"};base64,${arrayBufferToBase64(
    await file.arrayBuffer(),
  )}`;

  const upstream = await fetch(env.GLM_CHAT_ENDPOINT ?? CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.GLM_VISION_MODEL ?? VISION_MODEL,
      messages: [
        {
          role: "system",
          content: "你是课表图片解析器。你只能输出严格 JSON。",
        },
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt() },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
    }),
  }).catch(() => undefined);

  if (!upstream) {
    return errorResponse("UPSTREAM_UNAVAILABLE", "课表识别服务暂时不可用，请稍后重试。", 502);
  }

  if (upstream.status === 429) {
    return errorResponse("UPSTREAM_RATE_LIMITED", "课表识别请求过于频繁，请稍后再试。", 429);
  }

  if (!upstream.ok) {
    return errorResponse("MODEL_FAILED", "课表识别失败，请稍后重试。", 502);
  }

  const upstreamPayload = (await upstream.json().catch(() => undefined)) as
    | { choices?: Array<{ message?: { content?: unknown } }> }
    | undefined;
  const content = extractContentText(upstreamPayload?.choices?.[0]?.message?.content);

  if (!content) {
    return errorResponse("PARSE_FAILED", "课表识别结果格式异常，请换一张更清晰的图片重试。", 502);
  }

  try {
    const normalized = parseModelPayload(content);
    if (!normalized.blocks.length) {
      return errorResponse("NO_VALID_BLOCKS", "未识别到有效课程时间，当前忙碌时间未改变。");
    }
    return jsonResponse(normalized);
  } catch {
    return errorResponse("PARSE_FAILED", "课表识别结果格式异常，请换一张更清晰的图片重试。", 502);
  }
};

export const onRequestGet = () =>
  errorResponse("METHOD_NOT_ALLOWED", "请使用 POST 上传课表图片。", 405);
