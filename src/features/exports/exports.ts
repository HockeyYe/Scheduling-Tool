import { toPng } from "html-to-image";
import * as XLSX from "xlsx";
import { DAYS, generateTimeSlots, getRequiredCount } from "../../lib/time";
import type { ProjectState, ScheduleResult } from "../../types/domain";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, json: string) {
  downloadBlob(filename, new Blob([json], { type: "application/json;charset=utf-8" }));
}

export function exportScheduleToExcel(result: ScheduleResult, project: ProjectState) {
  const slots = generateTimeSlots();
  const rows = slots
    .filter((slot) => slot.day === "mon")
    .map((slotForTime) => {
      const row: Record<string, string | number> = { 时间: slotForTime.start };
      for (const day of DAYS) {
        const slot = slots.find(
          (candidate) => candidate.day === day.key && candidate.start === slotForTime.start,
        );
        if (!slot) continue;
        const required = getRequiredCount(slot, project.staffingRules);
        const assignments = result.assignments.filter(
          (assignment) => assignment.slotId === slot.id,
        );
        const names = assignments
          .map(
            (assignment) =>
              project.employees.find((employee) => employee.id === assignment.employeeId)?.name,
          )
          .filter(Boolean)
          .join(" / ");
        row[day.label] =
          assignments.length < required
            ? `${names || "未排"}（缺 ${required - assignments.length} 人）`
            : names;
      }
      return row;
    });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "排班表");
  XLSX.writeFile(workbook, "coffee-schedule.xlsx");
}

export async function exportScheduleImage(node: HTMLElement) {
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
  });
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  downloadBlob("coffee-schedule.png", blob);
}
