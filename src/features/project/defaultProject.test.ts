import { describe, expect, it } from "vitest";
import { generateTimeSlots } from "../../lib/time";
import { buildDefaultAvailability, createDefaultProject } from "./defaultProject";
import type { Employee } from "../../types/domain";

describe("createDefaultProject", () => {
  it("starts with three blank new employees", () => {
    const project = createDefaultProject();

    expect(project.employees.map((employee) => employee.name)).toEqual([
      "新员工1",
      "新员工2",
      "新员工3",
    ]);
  });

  it("marks every default employee slot as available", () => {
    const project = createDefaultProject();
    const slots = generateTimeSlots();

    for (const employee of project.employees) {
      expect(project.availability[employee.id]).toBeDefined();
      for (const slot of slots) {
        expect(project.availability[employee.id][slot.id]).toBe("available");
      }
    }
  });
});

describe("buildDefaultAvailability", () => {
  it("creates an all-available schedule for a newly added employee", () => {
    const employee: Employee = {
      id: "emp_new",
      name: "新员工4",
      targetHoursPerWeek: 8,
    };
    const availability = buildDefaultAvailability([employee]);
    const slots = generateTimeSlots();

    expect(Object.values(availability[employee.id])).toHaveLength(slots.length);
    expect(new Set(Object.values(availability[employee.id]))).toEqual(new Set(["available"]));
  });
});
