import type { BusyTimeBlock, DayKey, OcrScheduleBlock, StaffingRule, TimeSlot } from "../types/domain";

export const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "周一" },
  { key: "tue", label: "周二" },
  { key: "wed", label: "周三" },
  { key: "thu", label: "周四" },
  { key: "fri", label: "周五" },
];

export const DEFAULT_START = "08:00";
export const DEFAULT_END = "16:30";
export const SLOT_MINUTES = 30;
export const COMMUTE_BUFFER_MINUTES = 15;

export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function generateTimeSlots(
  start = DEFAULT_START,
  end = DEFAULT_END,
  stepMinutes = SLOT_MINUTES,
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  let index = 0;
  for (
    let current = timeToMinutes(start);
    current < timeToMinutes(end);
    current += stepMinutes
  ) {
    for (const day of DAYS) {
      slots.push({
        id: `${day.key}-${minutesToTime(current)}`,
        day: day.key,
        start: minutesToTime(current),
        end: minutesToTime(current + stepMinutes),
        index,
      });
    }
    index += 1;
  }
  return slots;
}

export function getSlotsForDay(slots: TimeSlot[], day: DayKey) {
  return slots.filter((slot) => slot.day === day);
}

export function getRequiredCount(slot: TimeSlot, rules: StaffingRule[]) {
  const slotStart = timeToMinutes(slot.start);
  const match = rules.find(
    (rule) =>
      slotStart >= timeToMinutes(rule.start) && slotStart < timeToMinutes(rule.end),
  );
  return match?.requiredCount ?? 0;
}

export function slotLabel(slot: TimeSlot) {
  return `${slot.start}-${slot.end}`;
}

export function slotHours(slotCount: number) {
  return (slotCount * SLOT_MINUTES) / 60;
}

export function rangesOverlap(
  startMinutes: number,
  endMinutes: number,
  otherStartMinutes: number,
  otherEndMinutes: number,
) {
  return startMinutes < otherEndMinutes && endMinutes > otherStartMinutes;
}

export function isValidTimeString(value: unknown) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function isValidTimeRange(start: string, end: string) {
  return isValidTimeString(start) && isValidTimeString(end) && timeToMinutes(start) < timeToMinutes(end);
}

export function getBusySlotIdsFromBlocks(
  blocks: Array<Pick<BusyTimeBlock | OcrScheduleBlock, "day" | "start" | "end">>,
  slots = generateTimeSlots(),
) {
  return slots
    .filter((slot) =>
      blocks.some((block) => {
        if (slot.day !== block.day || !isValidTimeRange(block.start, block.end)) return false;
        return rangesOverlap(
          timeToMinutes(slot.start),
          timeToMinutes(slot.end),
          timeToMinutes(block.start) - COMMUTE_BUFFER_MINUTES,
          timeToMinutes(block.end) + COMMUTE_BUFFER_MINUTES,
        );
      }),
    )
    .map((slot) => slot.id);
}

export function blockOverlapsScheduleRange(
  block: Pick<BusyTimeBlock | OcrScheduleBlock, "day" | "start" | "end">,
  slots = generateTimeSlots(),
) {
  return getBusySlotIdsFromBlocks([block], slots).length > 0;
}
