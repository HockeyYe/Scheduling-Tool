export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri";

export type AvailabilityStatus =
  | "available"
  | "busy"
  | "dispreferred";

export type Employee = {
  id: string;
  name: string;
  targetHoursPerWeek: number;
};

export type TimeSlot = {
  id: string;
  day: DayKey;
  start: string;
  end: string;
  index: number;
};

export type BusyTimeBlock = {
  id: string;
  employeeId: string;
  day: DayKey;
  start: string;
  end: string;
  label?: string;
  source?: "manual" | "ocr" | "import";
};

export type StaffingRule = {
  id: string;
  label: string;
  start: string;
  end: string;
  requiredCount: number;
};

export type SchedulerOptions = {
  minShiftHours: number;
  shortageWeight: number;
  fairnessWeight: number;
  preferenceWeight: number;
  continuityWeight: number;
};

export type AvailabilityMap = Record<string, Record<string, AvailabilityStatus>>;

export type ScheduleAssignment = {
  slotId: string;
  employeeId: string;
  preferenceConflict?: boolean;
  shortShiftRisk?: boolean;
};

export type Shortage = {
  slotId: string;
  requiredCount: number;
  assignedCount: number;
  missingCount: number;
};

export type EmployeeScheduleStats = {
  employeeId: string;
  totalHours: number;
  targetHours: number;
};

export type ScheduleResult = {
  assignments: ScheduleAssignment[];
  shortages: Shortage[];
  employeeStats: EmployeeScheduleStats[];
  preferenceConflictCount: number;
  shortShiftWarnings: string[];
  score: number;
};

export type ProjectState = {
  employees: Employee[];
  availability: AvailabilityMap;
  busyTimeBlocks?: BusyTimeBlock[];
  staffingRules: StaffingRule[];
  schedulerOptions: SchedulerOptions;
  scheduleResult?: ScheduleResult;
};

export type SchedulerInput = ProjectState;
