import { describe, expect, it } from "vitest";
import { generateTimeSlots } from "../../lib/time";
import { createDefaultProject } from "../project/defaultProject";
import { generateSchedule } from "./scheduler";

describe("generateSchedule", () => {
  it("does not assign employees in busy or banned slots", () => {
    const project = createDefaultProject();
    const result = generateSchedule(project);

    for (const assignment of result.assignments) {
      const status = project.availability[assignment.employeeId]?.[assignment.slotId];
      expect(["busy", "banned"]).not.toContain(status);
    }
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
