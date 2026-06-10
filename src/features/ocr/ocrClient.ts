import type { OcrScheduleImportResponse } from "../../types/domain";

export type OcrScheduleImportErrorCode =
  | "MISSING_API_KEY"
  | "INVALID_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "MODEL_FAILED"
  | "PARSE_FAILED"
  | "NO_VALID_BLOCKS"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE";

type OcrScheduleImportErrorResponse = {
  error?: {
    code?: OcrScheduleImportErrorCode;
    message?: string;
  };
};

export const OCR_IMAGE_ACCEPT = ".png,.jpg,.jpeg,.bmp,image/png,image/jpeg,image/bmp";
export const OCR_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

export function validateOcrImage(file: File) {
  const allowedTypes = new Set(["image/png", "image/jpeg", "image/bmp"]);
  const allowedExtensions = /\.(png|jpe?g|bmp)$/i;

  if (!allowedTypes.has(file.type) && !allowedExtensions.test(file.name)) {
    return "仅支持 PNG、JPG、JPEG、BMP 图片。";
  }

  if (file.size > OCR_MAX_FILE_SIZE_BYTES) {
    return "图片不能超过 8MB。";
  }

  return undefined;
}

export async function importScheduleImage(file: File): Promise<OcrScheduleImportResponse> {
  const validationError = validateOcrImage(file);
  if (validationError) throw new Error(validationError);

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/ocr/schedule", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as OcrScheduleImportErrorResponse;
    throw new Error(payload.error?.message ?? "课表识别失败，请稍后重试。");
  }

  return (await response.json()) as OcrScheduleImportResponse;
}
