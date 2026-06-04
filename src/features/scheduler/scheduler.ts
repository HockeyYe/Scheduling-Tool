import {
  DAYS,
  generateTimeSlots,
  getRequiredCount,
  slotHours,
} from "../../lib/time";
import type {
  AvailabilityStatus,
  Employee,
  EmployeeScheduleStats,
  ScheduleAssignment,
  ScheduleResult,
  SchedulerInput,
  Shortage,
  TimeSlot,
} from "../../types/domain";

function assignedInSlot(assignments: ScheduleAssignment[], slotId: string) {
  return assignments
    .filter((assignment) => assignment.slotId === slotId)
    .map((assignment) => assignment.employeeId);
}

function employeeSlotIds(assignments: ScheduleAssignment[], employeeId: string) {
  return assignments
    .filter((assignment) => assignment.employeeId === employeeId)
    .map((assignment) => assignment.slotId);
}

function getStatus(
  input: SchedulerInput,
  employeeId: string,
  slotId: string,
): AvailabilityStatus {
  return input.availability[employeeId]?.[slotId] ?? "available";
}

function hasAdjacentAssignment(
  slots: TimeSlot[],
  assignments: ScheduleAssignment[],
  employeeId: string,
  slot: TimeSlot,
) {
  const employeeSlots = new Set(employeeSlotIds(assignments, employeeId));
  return slots.some(
    (candidate) =>
      candidate.day === slot.day &&
      (candidate.index === slot.index - 1 || candidate.index === slot.index + 1) &&
      employeeSlots.has(candidate.id),
  );
}

function currentHours(assignments: ScheduleAssignment[], employeeId: string) {
  return slotHours(assignments.filter((item) => item.employeeId === employeeId).length);
}

function scoreCandidate(
  input: SchedulerInput,
  slots: TimeSlot[],
  assignments: ScheduleAssignment[],
  employee: Employee,
  slot: TimeSlot,
) {
  const hours = currentHours(assignments, employee.id);
  const status = getStatus(input, employee.id, slot.id);
  const targetGap = Math.max(0, employee.targetHoursPerWeek - hours);
  const underTargetReward = targetGap * input.schedulerOptions.fairnessWeight;
  const continuityReward = hasAdjacentAssignment(slots, assignments, employee.id, slot)
    ? input.schedulerOptions.continuityWeight * 2
    : 0;
  const preferencePenalty =
    status === "dispreferred" ? input.schedulerOptions.preferenceWeight * 2 : 0;
  const overTargetPenalty =
    hours >= employee.targetHoursPerWeek
      ? (hours - employee.targetHoursPerWeek + 0.5) *
        input.schedulerOptions.fairnessWeight
      : 0;
  const fragmentPenalty =
    !hasAdjacentAssignment(slots, assignments, employee.id, slot) && hours > 0
      ? input.schedulerOptions.continuityWeight
      : 0;

  return (
    1000 +
    underTargetReward +
    continuityReward -
    preferencePenalty -
    overTargetPenalty -
    fragmentPenalty
  );
}

function buildStats(input: SchedulerInput, assignments: ScheduleAssignment[]) {
  return input.employees.map<EmployeeScheduleStats>((employee) => ({
    employeeId: employee.id,
    totalHours: currentHours(assignments, employee.id),
    targetHours: employee.targetHoursPerWeek,
  }));
}

function contiguousRunLength(
  slots: TimeSlot[],
  assignments: ScheduleAssignment[],
  assignment: ScheduleAssignment,
) {
  const slot = slots.find((item) => item.id === assignment.slotId);
  if (!slot) return 0;
  const assigned = new Set(employeeSlotIds(assignments, assignment.employeeId));
  let count = 1;
  for (const direction of [-1, 1]) {
    let index = slot.index + direction;
    while (true) {
      const neighbor = slots.find(
        (candidate) => candidate.day === slot.day && candidate.index === index,
      );
      if (!neighbor || !assigned.has(neighbor.id)) break;
      count += 1;
      index += direction;
    }
  }
  return slotHours(count);
}

function flagShortShifts(
  input: SchedulerInput,
  slots: TimeSlot[],
  assignments: ScheduleAssignment[],
) {
  const warnings: string[] = [];
  for (const assignment of assignments) {
    const runHours = contiguousRunLength(slots, assignments, assignment);
    if (runHours < input.schedulerOptions.minShiftHours) {
      assignment.shortShiftRisk = true;
      warnings.push(assignment.slotId);
    }
  }
  return Array.from(new Set(warnings));
}

export function generateSchedule(input: SchedulerInput): ScheduleResult {
  const slots = generateTimeSlots();
  const assignments: ScheduleAssignment[] = [];
  const shortages: Shortage[] = [];
  let preferenceConflictCount = 0;

  for (const slot of slots) {
    const requiredCount = getRequiredCount(slot, input.staffingRules);
    for (let position = 0; position < requiredCount; position += 1) {
      const alreadyAssigned = new Set(assignedInSlot(assignments, slot.id));
      const candidates = input.employees
        .filter((employee) => !alreadyAssigned.has(employee.id))
        .filter((employee) => {
          const status = getStatus(input, employee.id, slot.id);
          return status !== "busy" && status !== "banned";
        })
        .map((employee) => ({
          employee,
          score: scoreCandidate(input, slots, assignments, employee, slot),
        }))
        .sort((a, b) => b.score - a.score);

      const chosen = candidates[0]?.employee;
      if (!chosen) break;

      const status = getStatus(input, chosen.id, slot.id);
      if (status === "dispreferred") preferenceConflictCount += 1;
      assignments.push({
        slotId: slot.id,
        employeeId: chosen.id,
        preferenceConflict: status === "dispreferred",
      });
    }

    const assignedCount = assignedInSlot(assignments, slot.id).length;
    if (assignedCount < requiredCount) {
      shortages.push({
        slotId: slot.id,
        requiredCount,
        assignedCount,
        missingCount: requiredCount - assignedCount,
      });
    }
  }

  const shortShiftWarnings = flagShortShifts(input, slots, assignments);
  const score =
    shortages.reduce(
      (total, shortage) =>
        total + shortage.missingCount * input.schedulerOptions.shortageWeight * 100,
      0,
    ) +
    preferenceConflictCount * input.schedulerOptions.preferenceWeight +
    shortShiftWarnings.length * input.schedulerOptions.continuityWeight;

  return {
    assignments,
    shortages,
    employeeStats: buildStats(input, assignments),
    preferenceConflictCount,
    shortShiftWarnings,
    score,
  };
}

export function recalculateScheduleResult(input: SchedulerInput): ScheduleResult {
  const slots = generateTimeSlots();
  const assignments = input.scheduleResult?.assignments.map((item) => ({ ...item })) ?? [];
  const shortages: Shortage[] = [];

  for (const slot of slots) {
    const requiredCount = getRequiredCount(slot, input.staffingRules);
    const assignedCount = assignedInSlot(assignments, slot.id).length;
    if (assignedCount < requiredCount) {
      shortages.push({
        slotId: slot.id,
        requiredCount,
        assignedCount,
        missingCount: requiredCount - assignedCount,
      });
    }
  }

  const preferenceConflictCount = assignments.filter((assignment) =>
    assignment.preferenceConflict,
  ).length;

  return {
    assignments,
    shortages,
    employeeStats: buildStats(input, assignments),
    preferenceConflictCount,
    shortShiftWarnings: flagShortShifts(input, slots, assignments),
    score: shortages.length * input.schedulerOptions.shortageWeight * 100,
  };
}

export function canAssignEmployee(
  input: SchedulerInput,
  slotId: string,
  employeeId: string,
) {
  const status = getStatus(input, employeeId, slotId);
  const assignments = input.scheduleResult?.assignments ?? [];
  return (
    status !== "busy" &&
    status !== "banned" &&
    !assignments.some(
      (assignment) => assignment.slotId === slotId && assignment.employeeId === employeeId,
    )
  );
}

export function describeSlot(slotId: string) {
  const slots = generateTimeSlots();
  const slot = slots.find((item) => item.id === slotId);
  if (!slot) return slotId;
  const day = DAYS.find((item) => item.key === slot.day)?.label ?? slot.day;
  return `${day} ${slot.start}-${slot.end}`;
}
