import { DAYS } from "./time";
import type {
  AvailabilityMap,
  AvailabilityStatus,
  BusyTimeBlock,
  ProjectState,
} from "../types/domain";

export const STORAGE_KEY = "coffee-scheduling-tool-project";

export function exportProject(state: ProjectState): string {
  return JSON.stringify(state, null, 2);
}

function normalizeAvailabilityStatus(status: unknown): AvailabilityStatus {
  if (status === "busy" || status === "banned") return "busy";
  if (status === "dispreferred") return "dispreferred";
  return "available";
}

function normalizeAvailability(availability: ProjectState["availability"]): AvailabilityMap {
  return Object.fromEntries(
    Object.entries(availability).map(([employeeId, slots]) => [
      employeeId,
      Object.fromEntries(
        Object.entries(slots).map(([slotId, status]) => [
          slotId,
          normalizeAvailabilityStatus(status),
        ]),
      ),
    ]),
  );
}

function isTimeString(value: unknown) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function normalizeBusyTimeBlocks(blocks: unknown): BusyTimeBlock[] | undefined {
  if (!Array.isArray(blocks)) return undefined;
  const dayKeys = new Set(DAYS.map((day) => day.key));

  return blocks
    .filter((block): block is Record<string, unknown> => {
      if (!block || typeof block !== "object") return false;
      return (
        typeof block.id === "string" &&
        typeof block.employeeId === "string" &&
        typeof block.day === "string" &&
        dayKeys.has(block.day as BusyTimeBlock["day"]) &&
        isTimeString(block.start) &&
        isTimeString(block.end)
      );
    })
    .map((block) => ({
      id: block.id as string,
      employeeId: block.employeeId as string,
      day: block.day as BusyTimeBlock["day"],
      start: block.start as string,
      end: block.end as string,
      label: typeof block.label === "string" ? block.label : undefined,
      source:
        block.source === "manual" || block.source === "ocr" || block.source === "import"
          ? block.source
          : undefined,
    }));
}

export function normalizeProjectState(state: ProjectState): ProjectState {
  return {
    ...state,
    availability: normalizeAvailability(state.availability),
    busyTimeBlocks: normalizeBusyTimeBlocks(state.busyTimeBlocks),
  };
}

export function importProject(json: string): ProjectState {
  const parsed = JSON.parse(json) as ProjectState;
  if (!Array.isArray(parsed.employees)) {
    throw new Error("项目 JSON 缺少员工列表");
  }
  if (!parsed.availability || typeof parsed.availability !== "object") {
    throw new Error("项目 JSON 缺少可用时间数据");
  }
  if (!Array.isArray(parsed.staffingRules)) {
    throw new Error("项目 JSON 缺少人力规则");
  }
  return normalizeProjectState(parsed);
}
