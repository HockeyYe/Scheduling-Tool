import { generateTimeSlots } from "../../lib/time";
import type {
  AvailabilityMap,
  AvailabilityStatus,
  Employee,
  ProjectState,
  StaffingRule,
} from "../../types/domain";

export const defaultEmployees: Employee[] = [
  { id: "emp_lin", name: "林小满", targetHoursPerWeek: 12 },
  { id: "emp_zhou", name: "周予安", targetHoursPerWeek: 12 },
  { id: "emp_chen", name: "陈一诺", targetHoursPerWeek: 10 },
  { id: "emp_xu", name: "许知夏", targetHoursPerWeek: 8 },
  { id: "emp_shen", name: "沈嘉禾", targetHoursPerWeek: 10 },
  { id: "emp_gu", name: "顾南星", targetHoursPerWeek: 8 },
];

export const defaultStaffingRules: StaffingRule[] = [
  { id: "rule_morning", label: "早班高峰", start: "08:00", end: "10:00", requiredCount: 2 },
  { id: "rule_mid", label: "上午常规", start: "10:00", end: "12:00", requiredCount: 1 },
  { id: "rule_lunch", label: "午间高峰", start: "12:00", end: "14:00", requiredCount: 2 },
  { id: "rule_afternoon", label: "下午常规", start: "14:00", end: "16:30", requiredCount: 1 },
];

const sampleStatuses: AvailabilityStatus[] = [
  "available",
  "available",
  "busy",
  "available",
  "dispreferred",
  "available",
];

export function buildDefaultAvailability(employees = defaultEmployees): AvailabilityMap {
  const slots = generateTimeSlots();
  return Object.fromEntries(
    employees.map((employee, employeeIndex) => [
      employee.id,
      Object.fromEntries(
        slots.map((slot) => [
          slot.id,
          sampleStatuses[(slot.index + employeeIndex + slot.day.length) % sampleStatuses.length],
        ]),
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
