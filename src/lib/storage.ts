import type { AvailabilityMap, AvailabilityStatus, ProjectState } from "../types/domain";

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

export function normalizeProjectState(state: ProjectState): ProjectState {
  return {
    ...state,
    availability: normalizeAvailability(state.availability),
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
