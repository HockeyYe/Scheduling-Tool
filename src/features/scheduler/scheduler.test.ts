import { describe, expect, it } from "vitest";
import { generateTimeSlots } from "../../lib/time";
import { createDefaultProject } from "../project/defaultProject";
import { canAssignEmployee, generateSchedule } from "./scheduler";

describe("generateSchedule", () => {
  it("does not assign employees in busy slots", () => {
    const project = createDefaultProject();
    const result = generateSchedule(project);

    for (const assignment of result.assignments) {
      const status = project.availability[assignment.employeeId]?.[assignment.slotId];
      expect(status).not.toBe("busy");
    }
  });

  it("does not assign employees in commute buffers around busy slots", () => {
    const project = createDefaultProject();
    const employee = project.employees[0];
    const slots = generateTimeSlots();
    project.employees = [employee];
    project.availability = {
      [employee.id]: Object.fromEntries(slots.map((slot) => [slot.id, "available"])),
    };
    project.availability[employee.id]["mon-10:00"] = "busy";
    project.staffingRules = [
      { id: "rule_test", label: "测试", start: "09:30", end: "11:00", requiredCount: 1 },
    ];

    const result = generateSchedule(project);
    const assignedSlotIds = result.assignments
      .filter((assignment) => assignment.employeeId === employee.id)
      .map((assignment) => assignment.slotId);

    expect(assignedSlotIds).not.toContain("mon-09:30");
    expect(assignedSlotIds).not.toContain("mon-10:00");
    expect(assignedSlotIds).not.toContain("mon-10:30");
  });

  it("uses exact busy time blocks for non half-hour course boundaries", () => {
    const project = createDefaultProject();
    const employee = project.employees[0];
    const slots = generateTimeSlots();
    project.employees = [employee];
    project.availability = {
      [employee.id]: Object.fromEntries(slots.map((slot) => [slot.id, "available"])),
    };
    project.busyTimeBlocks = [
      {
        id: "block_course",
        employeeId: employee.id,
        day: "mon",
        start: "10:00",
        end: "11:15",
        source: "ocr",
      },
    ];

    expect(canAssignEmployee(project, "mon-09:00", employee.id)).toBe(true);
    expect(canAssignEmployee(project, "mon-09:30", employee.id)).toBe(false);
    expect(canAssignEmployee(project, "mon-10:00", employee.id)).toBe(false);
    expect(canAssignEmployee(project, "mon-11:00", employee.id)).toBe(false);
    expect(canAssignEmployee(project, "mon-11:30", employee.id)).toBe(true);
  });

  it("does not double-apply commute buffers to slots derived from exact busy blocks", () => {
    const project = createDefaultProject();
    const employee = project.employees[0];
    const slots = generateTimeSlots();
    project.employees = [employee];
    project.availability = {
      [employee.id]: Object.fromEntries(slots.map((slot) => [slot.id, "available"])),
    };
    project.busyTimeBlocks = [
      {
        id: "block_ocr_course",
        employeeId: employee.id,
        day: "mon",
        start: "10:00",
        end: "11:15",
        source: "ocr",
      },
    ];

    for (const slotId of ["mon-09:30", "mon-10:00", "mon-10:30", "mon-11:00"]) {
      project.availability[employee.id][slotId] = "busy";
    }

    expect(canAssignEmployee(project, "mon-09:00", employee.id)).toBe(true);
    expect(canAssignEmployee(project, "mon-09:30", employee.id)).toBe(false);
    expect(canAssignEmployee(project, "mon-11:00", employee.id)).toBe(false);
    expect(canAssignEmployee(project, "mon-11:30", employee.id)).toBe(true);
  });

  it("reports shortages when every employee is unavailable", () => {
    const project = createDefaultProject();
    const slots = generateTimeSlots();
    project.availability = Object.fromEntries(
      project.employees.map((employee) => [
        employee.id,
        Object.fromEntries(slots.map((slot) => [slot.id, "busy"])),
      ]),
    );

    const result = generateSchedule(project);

    expect(result.assignments).toHaveLength(0);
    expect(result.shortages.length).toBeGreaterThan(0);
    expect(result.shortages[0]).toMatchObject({
      assignedCount: 0,
    });
  });
});
