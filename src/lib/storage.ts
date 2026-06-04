import type { ProjectState } from "../types/domain";

export const STORAGE_KEY = "coffee-scheduling-tool-project";

export function exportProject(state: ProjectState): string {
  return JSON.stringify(state, null, 2);
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
  return parsed;
}
