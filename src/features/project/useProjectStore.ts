import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createId } from "../../lib/ids";
import { importProject, normalizeProjectState } from "../../lib/storage";
import {
  canAssignEmployee,
  generateSchedule,
  recalculateScheduleResult,
} from "../scheduler/scheduler";
import { buildDefaultAvailability, createDefaultProject } from "./defaultProject";
import type {
  AvailabilityStatus,
  Employee,
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
        staffingRules: state.staffingRules,
        schedulerOptions: state.schedulerOptions,
        scheduleResult: state.scheduleResult,
      }),
    },
  ),
);
