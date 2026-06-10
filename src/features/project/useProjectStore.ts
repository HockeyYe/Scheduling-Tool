import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createId } from "../../lib/ids";
import { importProject, normalizeProjectState } from "../../lib/storage";
import {
  blockOverlapsScheduleRange,
  generateTimeSlots,
  getBusySlotIdsFromBlocks,
  isValidTimeRange,
} from "../../lib/time";
import {
  canAssignEmployee,
  generateSchedule,
  recalculateScheduleResult,
} from "../scheduler/scheduler";
import { buildDefaultAvailability, createDefaultProject } from "./defaultProject";
import type {
  AvailabilityStatus,
  BusyTimeBlock,
  Employee,
  OcrScheduleBlock,
  ProjectState,
  SchedulerOptions,
  StaffingRule,
} from "../../types/domain";

type ProjectActions = {
  addEmployee: () => void;
  updateEmployee: (employeeId: string, updates: Partial<Employee>) => void;
  removeEmployee: (employeeId: string) => void;
  setAvailability: (
    employeeId: string,
    slotId: string,
    status: AvailabilityStatus,
  ) => void;
  setAvailabilityBatch: (
    employeeId: string,
    slotIds: string[],
    status: AvailabilityStatus,
  ) => void;
  replaceEmployeeBusyTimeFromOcr: (
    employeeId: string,
    blocks: OcrScheduleBlock[],
  ) => void;
  updateStaffingRule: (ruleId: string, requiredCount: number) => void;
  updateSchedulerOption: <K extends keyof SchedulerOptions>(
    key: K,
    value: SchedulerOptions[K],
  ) => void;
  generate: () => void;
  removeAssignment: (slotId: string, employeeId: string) => void;
  addAssignment: (slotId: string, employeeId: string) => void;
  replaceAssignment: (
    slotId: string,
    previousEmployeeId: string,
    nextEmployeeId: string,
  ) => void;
  resetProject: () => void;
  loadProjectJson: (json: string) => void;
};

export const useProjectStore = create<ProjectState & ProjectActions>()(
  persist(
    (set, get) => ({
      ...createDefaultProject(),
      addEmployee: () => {
        const next: Employee = {
          id: createId("emp"),
          name: `新员工 ${get().employees.length + 1}`,
          targetHoursPerWeek: 8,
        };
        set((state) => ({
          employees: [...state.employees, next],
          availability: {
            ...state.availability,
            ...buildDefaultAvailability([next]),
          },
        }));
      },
      updateEmployee: (employeeId, updates) => {
        set((state) => ({
          employees: state.employees.map((employee) =>
            employee.id === employeeId ? { ...employee, ...updates } : employee,
          ),
        }));
        if (get().scheduleResult) set({ scheduleResult: recalculateScheduleResult(get()) });
      },
      removeEmployee: (employeeId) => {
        set((state) => {
          const { [employeeId]: _removed, ...availability } = state.availability;
          const scheduleResult = state.scheduleResult
            ? {
                ...state.scheduleResult,
                assignments: state.scheduleResult.assignments.filter(
                  (assignment) => assignment.employeeId !== employeeId,
                ),
              }
            : undefined;
          return {
            employees: state.employees.filter((employee) => employee.id !== employeeId),
            availability,
            busyTimeBlocks: state.busyTimeBlocks?.filter(
              (block) => block.employeeId !== employeeId,
            ),
            scheduleResult,
          };
        });
        if (get().scheduleResult) set({ scheduleResult: recalculateScheduleResult(get()) });
      },
      setAvailability: (employeeId, slotId, status) => {
        set((state) => ({
          availability: {
            ...state.availability,
            [employeeId]: {
              ...state.availability[employeeId],
              [slotId]: status,
            },
          },
          scheduleResult:
            state.scheduleResult && status === "busy"
              ? {
                  ...state.scheduleResult,
                  assignments: state.scheduleResult.assignments.filter(
                    (assignment) =>
                      assignment.employeeId !== employeeId || assignment.slotId !== slotId,
                  ),
                }
              : state.scheduleResult,
        }));
        if (get().scheduleResult) set({ scheduleResult: recalculateScheduleResult(get()) });
      },
      setAvailabilityBatch: (employeeId, slotIds, status) => {
        const uniqueSlotIds = Array.from(new Set(slotIds));
        if (!uniqueSlotIds.length) return;

        set((state) => {
          const slotIdSet = new Set(uniqueSlotIds);
          const employeeAvailability = {
            ...(state.availability[employeeId] ?? {}),
          };

          uniqueSlotIds.forEach((slotId) => {
            employeeAvailability[slotId] = status;
          });

          return {
            availability: {
              ...state.availability,
              [employeeId]: employeeAvailability,
            },
            scheduleResult:
              state.scheduleResult && status === "busy"
                ? {
                    ...state.scheduleResult,
                    assignments: state.scheduleResult.assignments.filter(
                      (assignment) =>
                        assignment.employeeId !== employeeId ||
                        !slotIdSet.has(assignment.slotId),
                    ),
                  }
                : state.scheduleResult,
          };
        });
        if (get().scheduleResult) set({ scheduleResult: recalculateScheduleResult(get()) });
      },
      replaceEmployeeBusyTimeFromOcr: (employeeId, blocks) => {
        const slots = generateTimeSlots();
        const uniqueBlocks = Array.from(
          new Map(
            blocks
              .filter((block) => isValidTimeRange(block.start, block.end))
              .filter((block) => blockOverlapsScheduleRange(block, slots))
              .map((block) => [`${block.day}-${block.start}-${block.end}`, block]),
          ).values(),
        );
        if (!uniqueBlocks.length) return;

        const busySlotIds = getBusySlotIdsFromBlocks(uniqueBlocks, slots);
        const busySlotIdSet = new Set(busySlotIds);
        const busyTimeBlocks: BusyTimeBlock[] = uniqueBlocks.map((block) => ({
          id: createId("busy_ocr"),
          employeeId,
          day: block.day,
          start: block.start,
          end: block.end,
          source: "ocr",
        }));

        set((state) => {
          const employeeAvailability = {
            ...(state.availability[employeeId] ?? {}),
          };

          slots.forEach((slot) => {
            if (employeeAvailability[slot.id] === "busy") {
              employeeAvailability[slot.id] = "available";
            }
          });
          busySlotIds.forEach((slotId) => {
            employeeAvailability[slotId] = "busy";
          });

          return {
            availability: {
              ...state.availability,
              [employeeId]: employeeAvailability,
            },
            busyTimeBlocks: [
              ...(state.busyTimeBlocks ?? []).filter(
                (block) => block.employeeId !== employeeId,
              ),
              ...busyTimeBlocks,
            ],
            scheduleResult: state.scheduleResult
              ? {
                  ...state.scheduleResult,
                  assignments: state.scheduleResult.assignments.filter(
                    (assignment) =>
                      assignment.employeeId !== employeeId ||
                      !busySlotIdSet.has(assignment.slotId),
                  ),
                }
              : state.scheduleResult,
          };
        });

        if (get().scheduleResult) set({ scheduleResult: recalculateScheduleResult(get()) });
      },
      updateStaffingRule: (ruleId, requiredCount) => {
        set((state) => ({
          staffingRules: state.staffingRules.map((rule) =>
            rule.id === ruleId ? { ...rule, requiredCount } : rule,
          ),
        }));
        if (get().scheduleResult) set({ scheduleResult: recalculateScheduleResult(get()) });
      },
      updateSchedulerOption: (key, value) => {
        set((state) => ({
          schedulerOptions: { ...state.schedulerOptions, [key]: value },
        }));
      },
      generate: () => {
        set({ scheduleResult: generateSchedule(get()) });
      },
      removeAssignment: (slotId, employeeId) => {
        set((state) => ({
          scheduleResult: state.scheduleResult
            ? {
                ...state.scheduleResult,
                assignments: state.scheduleResult.assignments.filter(
                  (assignment) =>
                    assignment.slotId !== slotId || assignment.employeeId !== employeeId,
                ),
              }
            : state.scheduleResult,
        }));
        set({ scheduleResult: recalculateScheduleResult(get()) });
      },
      addAssignment: (slotId, employeeId) => {
        const state = get();
        if (!state.scheduleResult || !canAssignEmployee(state, slotId, employeeId)) return;
        const status = state.availability[employeeId]?.[slotId] ?? "available";
        set({
          scheduleResult: {
            ...state.scheduleResult,
            assignments: [
              ...state.scheduleResult.assignments,
              {
                slotId,
                employeeId,
                preferenceConflict: status === "dispreferred",
              },
            ],
          },
        });
        set({ scheduleResult: recalculateScheduleResult(get()) });
      },
      replaceAssignment: (slotId, previousEmployeeId, nextEmployeeId) => {
        get().removeAssignment(slotId, previousEmployeeId);
        get().addAssignment(slotId, nextEmployeeId);
      },
      resetProject: () => set(createDefaultProject()),
      loadProjectJson: (json) => set(importProject(json)),
    }),
    {
      name: "coffee-scheduling-tool-project",
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizeProjectState(persistedState as ProjectState),
      }),
      partialize: (state) => ({
        employees: state.employees,
        availability: state.availability,
        busyTimeBlocks: state.busyTimeBlocks,
        staffingRules: state.staffingRules,
        schedulerOptions: state.schedulerOptions,
        scheduleResult: state.scheduleResult,
      }),
    },
  ),
);
