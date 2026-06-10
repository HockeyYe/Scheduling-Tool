import { generateTimeSlots } from "../../lib/time";
import type {
  AvailabilityMap,
  Employee,
  ProjectState,
  StaffingRule,
} from "../../types/domain";

export const defaultEmployees: Employee[] = [
  { id: "emp_1", name: "新员工1", targetHoursPerWeek: 8 },
  { id: "emp_2", name: "新员工2", targetHoursPerWeek: 8 },
  { id: "emp_3", name: "新员工3", targetHoursPerWeek: 8 },
];

export const defaultStaffingRules: StaffingRule[] = [
  { id: "rule_morning", label: "早班高峰", start: "08:00", end: "10:00", requiredCount: 2 },
  { id: "rule_mid", label: "上午常规", start: "10:00", end: "12:00", requiredCount: 1 },
  { id: "rule_lunch", label: "午间高峰", start: "12:00", end: "14:00", requiredCount: 2 },
  { id: "rule_afternoon", label: "下午常规", start: "14:00", end: "16:30", requiredCount: 1 },
];

export function buildDefaultAvailability(employees = defaultEmployees): AvailabilityMap {
  const slots = generateTimeSlots();
  return Object.fromEntries(
    employees.map((employee) => [
      employee.id,
      Object.fromEntries(
        slots.map((slot) => [slot.id, "available"]),
      ),
    ]),
  );
}

export function createDefaultProject(): ProjectState {
  return {
    employees: defaultEmployees,
    availability: buildDefaultAvailability(),
    staffingRules: defaultStaffingRules,
    schedulerOptions: {
      minShiftHours: 1,
      shortageWeight: 90,
      fairnessWeight: 60,
      preferenceWeight: 60,
      continuityWeight: 60,
    },
  };
}
