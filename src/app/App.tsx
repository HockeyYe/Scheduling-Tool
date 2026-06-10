import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  CalendarDays,
  Download,
  FileDown,
  FileUp,
  Plus,
  RefreshCcw,
  ScanText,
  Trash2,
  UserPlus,
  Wand2,
  X,
} from "lucide-react";
import { exportProject } from "../lib/storage";
import {
  DAYS,
  generateTimeSlots,
  getBusySlotIdsFromBlocks,
  getRequiredCount,
  getSlotsForDay,
  slotLabel,
} from "../lib/time";
import { downloadJson, exportScheduleImage, exportScheduleToExcel } from "../features/exports/exports";
import {
  OCR_IMAGE_ACCEPT,
  importScheduleImage,
  validateOcrImage,
} from "../features/ocr/ocrClient";
import { canAssignEmployee, describeSlot } from "../features/scheduler/scheduler";
import { useProjectStore } from "../features/project/useProjectStore";
import type { AvailabilityStatus, ScheduleAssignment, TimeSlot } from "../types/domain";

const statusMeta: Record<
  AvailabilityStatus,
  { label: string; className: "success" | "info" | "warning"; title: string }
> = {
  available: { label: "可排", className: "success", title: "可排班" },
  busy: { label: "忙碌", className: "info", title: "有课程/忙碌，不可排班" },
  dispreferred: { label: "不偏好", className: "warning", title: "不偏好但可排" },
};

type PageKey = "availability" | "rules" | "results";

type AvailabilityCellPosition = {
  slotId: string;
  rowIndex: number;
  dayIndex: number;
};

const weightLevels = [
  { label: "低", value: 30 },
  { label: "中", value: 60 },
  { label: "高", value: 90 },
] as const;

function getClosestWeightLevel(value: number) {
  return weightLevels.reduce((closest, level) =>
    Math.abs(level.value - value) < Math.abs(closest.value - value) ? level : closest,
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "success" | "info" | "warning" | "danger";
}) {
  return <span className={tone ? `badge ${tone}` : "badge"}>{children}</span>;
}

function findAssignmentEmployee(assignments: ScheduleAssignment[], slotId: string) {
  return assignments.filter((assignment) => assignment.slotId === slotId);
}

function App() {
  const [page, setPage] = useState<PageKey>("availability");
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | undefined>();
  const [activeStatus, setActiveStatus] = useState<AvailabilityStatus | undefined>();
  const [toast, setToast] = useState("");
  const [manualSlotId, setManualSlotId] = useState("");
  const scheduleRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const project = useProjectStore();
  const slots = useMemo(() => generateTimeSlots(), []);
  const timeRows = getSlotsForDay(slots, "mon");
  const activeEmployee = project.employees.find(
    (employee) => employee.id === (activeEmployeeId ?? project.employees[0]?.id),
  );
  const activeId = activeEmployee?.id;
  const result = project.scheduleResult;

  const pageTitle = {
    availability: "员工与可用时间",
    rules: "规则设置",
    results: "排班结果",
  }[page];

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  };

  const totalShortages = result?.shortages.length ?? 0;

  const handleGenerate = () => {
    project.generate();
    setPage("results");
    showToast("已生成一版排班结果");
  };

  const handleImport = async (file: File) => {
    try {
      project.loadProjectJson(await file.text());
      showToast("项目 JSON 已导入");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "导入失败");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleImageExport = async () => {
    if (!scheduleRef.current) return;
    try {
      await exportScheduleImage(scheduleRef.current);
      showToast("图片已导出");
    } catch {
      showToast("图片导出失败，请稍后重试");
    }
  };

  const projectForExport = {
    employees: project.employees,
    availability: project.availability,
    busyTimeBlocks: project.busyTimeBlocks,
    staffingRules: project.staffingRules,
    schedulerOptions: project.schedulerOptions,
    scheduleResult: project.scheduleResult,
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">排</div>
          <div>
            <div className="brand-title">咖啡店排班</div>
            <div className="brand-subtitle">本地静态网页工具</div>
          </div>
        </div>

        <nav className="nav" aria-label="主导航">
          <button
            className={page === "availability" ? "active" : ""}
            onClick={() => setPage("availability")}
            type="button"
          >
            员工与可用时间
          </button>
          <button
            className={page === "rules" ? "active" : ""}
            onClick={() => setPage("rules")}
            type="button"
          >
            规则设置
          </button>
          <button
            className={page === "results" ? "active" : ""}
            onClick={() => setPage("results")}
            type="button"
          >
            排班结果
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="metric">
            <strong>{project.employees.length} 人</strong>
            <span className="muted">本周店员</span>
          </div>
          <div className="metric">
            <strong>85 格</strong>
            <span className="muted">30 分钟粒度</span>
          </div>
          <button className="button subtle" onClick={project.resetProject} type="button">
            <RefreshCcw />
            重置示例数据
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{pageTitle}</h1>
            <div className="topbar-meta">
              <span className="muted">周一至周五 08:00-16:30</span>
              <Badge tone="success">已自动保存</Badge>
              <Badge tone={totalShortages ? "warning" : "success"}>
                {totalShortages} 个缺人时段
              </Badge>
            </div>
          </div>
          <div className="actions">
            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImport(file);
              }}
            />
            <button
              className="button"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <FileUp />
              导入
            </button>
            <button
              className="button"
              onClick={() =>
                downloadJson("coffee-scheduling-project.json", exportProject(projectForExport))
              }
              type="button"
            >
              <FileDown />
              导出 JSON
            </button>
            <button className="button primary" onClick={handleGenerate} type="button">
              <Wand2 />
              生成排班
            </button>
          </div>
        </header>

        <section className="content">
          {page === "availability" && (
            <AvailabilityPage
              activeEmployeeId={activeId}
              activeStatus={activeStatus}
              slots={slots}
              timeRows={timeRows}
              onSetActiveEmployee={(id) => setActiveEmployeeId(id)}
              onSetActiveStatus={setActiveStatus}
              onNotify={showToast}
            />
          )}
          {page === "rules" && <RulesPage />}
          {page === "results" && (
            <ResultsPage
              manualSlotId={manualSlotId}
              scheduleRef={scheduleRef}
              slots={slots}
              timeRows={timeRows}
              onSetManualSlotId={setManualSlotId}
              onExportExcel={() => {
                if (!result) {
                  showToast("请先生成排班");
                  return;
                }
                exportScheduleToExcel(result, projectForExport);
              }}
              onExportImage={handleImageExport}
            />
          )}
        </section>
      </main>

      <div className={toast ? "toast show" : "toast"}>{toast}</div>
    </div>
  );
}

function AvailabilityPage({
  activeEmployeeId,
  activeStatus,
  slots,
  timeRows,
  onSetActiveEmployee,
  onSetActiveStatus,
  onNotify,
}: {
  activeEmployeeId?: string;
  activeStatus?: AvailabilityStatus;
  slots: TimeSlot[];
  timeRows: TimeSlot[];
  onSetActiveEmployee: (id: string) => void;
  onSetActiveStatus: (status: AvailabilityStatus | undefined) => void;
  onNotify: (message: string) => void;
}) {
  const project = useProjectStore();
  const result = project.scheduleResult;
  const editorRef = useRef<HTMLElement>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<AvailabilityCellPosition>();
  const [selectionFocus, setSelectionFocus] = useState<AvailabilityCellPosition>();
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [isOcrDialogOpen, setIsOcrDialogOpen] = useState(false);
  const activeEmployee = project.employees.find((employee) => employee.id === activeEmployeeId);

  const selectedSlotIds = useMemo(() => {
    if (!selectionAnchor || !selectionFocus) return [];

    const minRow = Math.min(selectionAnchor.rowIndex, selectionFocus.rowIndex);
    const maxRow = Math.max(selectionAnchor.rowIndex, selectionFocus.rowIndex);
    const minDay = Math.min(selectionAnchor.dayIndex, selectionFocus.dayIndex);
    const maxDay = Math.max(selectionAnchor.dayIndex, selectionFocus.dayIndex);

    return slots
      .filter((slot) => {
        const rowIndex = timeRows.findIndex((timeSlot) => timeSlot.start === slot.start);
        const dayIndex = DAYS.findIndex((day) => day.key === slot.day);
        return rowIndex >= minRow && rowIndex <= maxRow && dayIndex >= minDay && dayIndex <= maxDay;
      })
      .map((slot) => slot.id);
  }, [selectionAnchor, selectionFocus, slots, timeRows]);

  const selectedSlotIdSet = useMemo(() => new Set(selectedSlotIds), [selectedSlotIds]);

  const clearSelection = () => {
    setSelectionAnchor(undefined);
    setSelectionFocus(undefined);
    setIsDraggingSelection(false);
    onSetActiveStatus(undefined);
  };

  useEffect(() => {
    clearSelection();
  }, [activeEmployeeId]);

  useEffect(() => {
    const handleMouseUp = () => {
      if (!isDraggingSelection) return;
      setIsDraggingSelection(false);
      onSetActiveStatus(undefined);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [isDraggingSelection, onSetActiveStatus]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (editorRef.current?.contains(target)) return;
      clearSelection();
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const startSelection = (position: AvailabilityCellPosition) => {
    if (!activeEmployeeId) return;
    setSelectionAnchor(position);
    setSelectionFocus(position);
    setIsDraggingSelection(true);
    onSetActiveStatus(undefined);
  };

  const extendSelection = (position: AvailabilityCellPosition) => {
    if (!isDraggingSelection) return;
    setSelectionFocus(position);
  };

  const finishSelection = (position: AvailabilityCellPosition) => {
    setSelectionFocus(position);
    setIsDraggingSelection(false);
    onSetActiveStatus(undefined);
  };

  const applyStatusToSelection = (status: AvailabilityStatus) => {
    if (!activeEmployeeId || !selectedSlotIds.length) return;
    if (activeStatus === status) {
      onSetActiveStatus(undefined);
      return;
    }
    onSetActiveStatus(status);
    project.setAvailabilityBatch(activeEmployeeId, selectedSlotIds, status);
  };

  const handleOcrImport = async (file: File) => {
    if (!activeEmployeeId || !activeEmployee) return;
    const response = await importScheduleImage(file);
    project.replaceEmployeeBusyTimeFromOcr(activeEmployeeId, response.blocks);

    const affectedSlotCount = getBusySlotIdsFromBlocks(response.blocks).length;
    const ignoredText = response.ignoredBlocks.length
      ? `，另有 ${response.ignoredBlocks.length} 段未写入`
      : "";

    if (response.confidence.level === "low" || response.confidence.level === "unknown") {
      onNotify(
        `识别结果置信度较低，已为「${activeEmployee.name}」覆盖 ${affectedSlotCount} 个忙碌格，请复查`,
      );
      return;
    }

    onNotify(
      `已为「${activeEmployee.name}」覆盖忙碌时间：${response.blocks.length} 段课程，${affectedSlotCount} 个排班格${ignoredText}`,
    );
  };

  return (
    <>
      <div className="layout-3">
        <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">员工列表</h2>
            <div className="muted">目标工时与当前排班</div>
          </div>
          <button className="icon-button" onClick={project.addEmployee} type="button">
            <UserPlus />
          </button>
        </div>
        <div className="panel-body">
          <div className="employee-list">
            {project.employees.map((employee) => {
              const stats = result?.employeeStats.find(
                (item) => item.employeeId === employee.id,
              );
              const hours = stats?.totalHours ?? 0;
              const pct = Math.min(100, Math.round((hours / employee.targetHoursPerWeek) * 100));
              return (
                <button
                  className={
                    employee.id === activeEmployeeId ? "employee active" : "employee"
                  }
                  key={employee.id}
                  onClick={() => onSetActiveEmployee(employee.id)}
                  type="button"
                >
                  <span className="row between">
                    <strong>{employee.name}</strong>
                    <span className="muted">
                      {hours}/{employee.targetHoursPerWeek}h
                    </span>
                  </span>
                  <span className="progress">
                    <span style={{ width: `${pct}%` }} />
                  </span>
                  <span className="muted">{pct}% 目标完成</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

        <section className="panel" ref={editorRef}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">可用时间录入</h2>
            <div className="muted">
              当前员工：
              {project.employees.find((employee) => employee.id === activeEmployeeId)?.name ??
                "未选择"}
            </div>
            {selectedSlotIds.length ? (
              <div className="availability-selection-summary">
                已选择 {selectedSlotIds.length} 格
              </div>
            ) : null}
          </div>
          <div className="availability-tools">
            <button
              className="button"
              disabled={!activeEmployeeId}
              onClick={() => setIsOcrDialogOpen(true)}
              type="button"
            >
              <ScanText />
              识别课表
            </button>
            <div className="tabs">
              {(Object.keys(statusMeta) as AvailabilityStatus[]).map((status) => (
                <button
                  className={[
                    "tab-button",
                    status === activeStatus ? "active" : "",
                    status === activeStatus ? statusMeta[status].className : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={!activeEmployeeId || !selectedSlotIds.length}
                  key={status}
                  onClick={() => applyStatusToSelection(status)}
                  type="button"
                >
                  {statusMeta[status].label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="panel-body">
          <div className="table-wrap">
            <div className="matrix availability-matrix">
              <div className="th">时间</div>
              {DAYS.map((day) => (
                <div className="th" key={day.key}>
                  {day.label}
                </div>
              ))}
              {timeRows.map((timeSlot) => (
                <AvailabilityRow
                  activeEmployeeId={activeEmployeeId}
                  key={timeSlot.start}
                  onExtendSelection={extendSelection}
                  onFinishSelection={finishSelection}
                  onStartSelection={startSelection}
                  selectedSlotIdSet={selectedSlotIdSet}
                  slots={slots}
                  timeRows={timeRows}
                  timeSlot={timeSlot}
                />
              ))}
            </div>
          </div>
        </div>
        </section>

        <EmployeeDetail activeEmployeeId={activeEmployeeId} />
      </div>
      <OcrImportDialog
        employeeName={activeEmployee?.name}
        isOpen={isOcrDialogOpen}
        onClose={() => setIsOcrDialogOpen(false)}
        onImport={handleOcrImport}
      />
    </>
  );
}

function OcrImportDialog({
  employeeName,
  isOpen,
  onClose,
  onImport,
}: {
  employeeName?: string;
  isOpen: boolean;
  onClose: () => void;
  onImport: (file: File) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setFile(undefined);
      setError("");
      setIsDragging(false);
      setIsSubmitting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectFile = (nextFile?: File) => {
    if (!nextFile) return;
    const validationError = validateOcrImage(nextFile);
    setFile(validationError ? undefined : nextFile);
    setError(validationError ?? "");
  };

  const handleSubmit = async () => {
    if (!file || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      await onImport(file);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "课表识别失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ocr-title">
        <div className="modal-header">
          <div>
            <h2 className="panel-title" id="ocr-title">
              识别课表
            </h2>
            <div className="muted">当前员工：{employeeName ?? "未选择"}</div>
          </div>
          <button
            className="icon-button"
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
          >
            <X />
          </button>
        </div>

        <div className="modal-body stack">
          <input
            ref={inputRef}
            hidden
            type="file"
            accept={OCR_IMAGE_ACCEPT}
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
          <button
            className={[
              "upload-zone",
              isDragging ? "dragging" : "",
              file ? "has-file" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={isSubmitting}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              selectFile(event.dataTransfer.files[0]);
            }}
            type="button"
          >
            <ScanText />
            <strong>{file ? file.name : "选择或拖入课表图片"}</strong>
            <span className="muted">PNG / JPG / JPEG / BMP，8MB 内</span>
          </button>

          <div className="notice warning">
            识别完成后会覆盖该员工当前所有忙碌时间，包括手动标记的忙碌时间。
          </div>

          {isSubmitting ? (
            <div className="ocr-progress">
              <span>正在读取图片并整理课程时间...</span>
              <span className="muted">这一步会通过 Cloudflare 后端调用 GLM-4.6V-Flash。</span>
            </div>
          ) : null}

          {error ? <div className="notice danger">{error}</div> : null}
        </div>

        <div className="modal-actions">
          <button className="button" disabled={isSubmitting} onClick={onClose} type="button">
            取消
          </button>
          <button
            className="button primary"
            disabled={!file || isSubmitting}
            onClick={handleSubmit}
            type="button"
          >
            <ScanText />
            {isSubmitting ? "识别中" : "开始识别"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AvailabilityRow({
  activeEmployeeId,
  onExtendSelection,
  onFinishSelection,
  onStartSelection,
  selectedSlotIdSet,
  slots,
  timeRows,
  timeSlot,
}: {
  activeEmployeeId?: string;
  onExtendSelection: (position: AvailabilityCellPosition) => void;
  onFinishSelection: (position: AvailabilityCellPosition) => void;
  onStartSelection: (position: AvailabilityCellPosition) => void;
  selectedSlotIdSet: Set<string>;
  slots: TimeSlot[];
  timeRows: TimeSlot[];
  timeSlot: TimeSlot;
}) {
  const availability = useProjectStore((state) => state.availability);
  const rowIndex = timeRows.findIndex((candidate) => candidate.start === timeSlot.start);

  return (
    <>
      <div className="time">{timeSlot.start}</div>
      {DAYS.map((day, dayIndex) => {
        const slot = slots.find(
          (candidate) => candidate.day === day.key && candidate.start === timeSlot.start,
        )!;
        const status = activeEmployeeId
          ? availability[activeEmployeeId]?.[slot.id] ?? "available"
          : "available";
        const position = { slotId: slot.id, rowIndex, dayIndex };
        const isSelected = selectedSlotIdSet.has(slot.id);
        return (
          <button
            className={isSelected ? "cell selected" : "cell"}
            disabled={!activeEmployeeId}
            key={slot.id}
            onMouseDown={(event) => {
              event.preventDefault();
              onStartSelection(position);
            }}
            onMouseEnter={() => {
              onExtendSelection(position);
            }}
            onMouseUp={() => onFinishSelection(position)}
            type="button"
          >
            <Badge tone={statusMeta[status].className}>
              {statusMeta[status].label}
            </Badge>
          </button>
        );
      })}
    </>
  );
}

function EmployeeDetail({ activeEmployeeId }: { activeEmployeeId?: string }) {
  const employee = useProjectStore((state) =>
    state.employees.find((item) => item.id === activeEmployeeId),
  );
  const updateEmployee = useProjectStore((state) => state.updateEmployee);
  const removeEmployee = useProjectStore((state) => state.removeEmployee);

  if (!employee) {
    return (
      <aside className="panel employee-detail-panel">
        <div className="panel-header">
          <h2 className="panel-title">员工详情</h2>
        </div>
        <div className="panel-body muted">请选择员工。</div>
      </aside>
    );
  }

  return (
    <aside className="panel employee-detail-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">员工详情</h2>
          <div className="muted">姓名与目标工时</div>
        </div>
        <button
          className="icon-button danger"
          onClick={() => removeEmployee(employee.id)}
          type="button"
        >
          <Trash2 />
        </button>
      </div>
      <div className="panel-body stack employee-detail-body">
        <label className="field">
          <span>姓名</span>
          <input
            value={employee.name}
            onChange={(event) =>
              updateEmployee(employee.id, { name: event.target.value || "未命名" })
            }
          />
        </label>
        <label className="field">
          <span>目标工时：{employee.targetHoursPerWeek}h</span>
          <input
            max={24}
            min={4}
            onChange={(event) =>
              updateEmployee(employee.id, {
                targetHoursPerWeek: Number(event.target.value),
              })
            }
            type="range"
            value={employee.targetHoursPerWeek}
          />
        </label>
        <p className="muted">点击时间格可用当前状态改色，刷新页面后数据会保留。</p>
      </div>
    </aside>
  );
}

function RulesPage() {
  const project = useProjectStore();

  return (
    <div className="layout-2">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">人力需求设置</h2>
            <div className="muted">MVP 使用 4 个默认时段，可调整每段人数</div>
          </div>
        </div>
        <div className="panel-body">
          <div className="table-wrap">
            <div className="matrix staffing-matrix">
              <div className="th">时段</div>
              {DAYS.map((day) => (
                <div className="th" key={day.key}>
                  {day.label}
                </div>
              ))}
              {project.staffingRules.map((rule) => (
                <div className="staffing-row" key={rule.id}>
                  <div className="time staffing-time">
                    <strong>{rule.start}-{rule.end}</strong>
                    <span>{rule.label}</span>
                  </div>
                  {DAYS.map((day) => (
                    <div className="staff-cell" key={day.key}>
                      <div className="stepper">
                        <span>
                          {day.label} {rule.requiredCount} 人
                        </span>
                        <input
                          max={4}
                          min={0}
                          onChange={(event) =>
                            project.updateStaffingRule(rule.id, Number(event.target.value))
                          }
                          type="range"
                          value={rule.requiredCount}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <aside className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">算法参数</h2>
            <div className="muted">硬约束固定，软约束可调</div>
          </div>
        </div>
        <div className="panel-body stack">
          <OptionSlider
            label="最短连续班次"
            max={4}
            min={0.5}
            step={0.5}
            suffix="h"
            value={project.schedulerOptions.minShiftHours}
            onChange={(value) => project.updateSchedulerOption("minShiftHours", value)}
          />
          <WeightLevelControl
            label="缺人惩罚"
            value={project.schedulerOptions.shortageWeight}
            onChange={(value) => project.updateSchedulerOption("shortageWeight", value)}
          />
          <WeightLevelControl
            label="公平性"
            value={project.schedulerOptions.fairnessWeight}
            onChange={(value) => project.updateSchedulerOption("fairnessWeight", value)}
          />
          <WeightLevelControl
            label="偏好冲突"
            value={project.schedulerOptions.preferenceWeight}
            onChange={(value) => project.updateSchedulerOption("preferenceWeight", value)}
          />
          <WeightLevelControl
            label="连续班次"
            value={project.schedulerOptions.continuityWeight}
            onChange={(value) => project.updateSchedulerOption("continuityWeight", value)}
          />
          <p className="muted">缺人惩罚权重最高，生成结果优先保证营业时段覆盖。</p>
        </div>
      </aside>
    </div>
  );
}

function OptionSlider({
  label,
  max = 100,
  min = 0,
  step = 1,
  suffix = "",
  value,
  onChange,
}: {
  label: string;
  max?: number;
  min?: number;
  step?: number;
  suffix?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="option-slider">
      <span className="row between">
        <span className="muted">{label}</span>
        <strong>
          {value}
          {suffix}
        </strong>
      </span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function WeightLevelControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const activeLevel = getClosestWeightLevel(value);

  return (
    <div className="option-slider">
      <span className="muted">{label}</span>
      <div className="weight-levels" role="group" aria-label={label}>
        {weightLevels.map((level) => (
          <button
            className={level.value === activeLevel.value ? "active" : ""}
            key={level.value}
            onClick={() => onChange(level.value)}
            type="button"
          >
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultsPage({
  manualSlotId,
  onSetManualSlotId,
  onExportExcel,
  onExportImage,
  scheduleRef,
  slots,
  timeRows,
}: {
  manualSlotId: string;
  onSetManualSlotId: (slotId: string) => void;
  onExportExcel: () => void;
  onExportImage: () => void;
  scheduleRef: RefObject<HTMLDivElement | null>;
  slots: TimeSlot[];
  timeRows: TimeSlot[];
}) {
  const project = useProjectStore();
  const result = project.scheduleResult;
  const selectedSlot = manualSlotId || result?.shortages[0]?.slotId || slots[0]?.id;
  const availableEmployees = project.employees.filter((employee) =>
    canAssignEmployee(project, selectedSlot, employee.id),
  );

  return (
    <div className="layout-2">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">周视图班表</h2>
            <div className="muted">缺人时段高亮，可移除或手动添加员工</div>
          </div>
          <div className="actions">
            <button className="button" onClick={onExportExcel} type="button">
              <Download />
              Excel
            </button>
            <button className="button" onClick={onExportImage} type="button">
              <CalendarDays />
              图片
            </button>
          </div>
        </div>
        <div className="panel-body" ref={scheduleRef}>
          {!result ? (
            <div className="empty-state">
              <Wand2 />
              <strong>还没有生成排班</strong>
              <span className="muted">点击顶部“生成排班”后查看结果。</span>
            </div>
          ) : (
            <div className="table-wrap">
              <div className="matrix schedule-matrix">
                <div className="th">时间</div>
                {DAYS.map((day) => (
                  <div className="th" key={day.key}>
                    {day.label}
                  </div>
                ))}
                {timeRows.map((rowSlot) => (
                  <ScheduleRow
                    key={rowSlot.start}
                    onSetManualSlotId={onSetManualSlotId}
                    slots={slots}
                    timeSlot={rowSlot}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">统计与缺人</h2>
            <div className="muted">手动调整后实时重新计算</div>
          </div>
        </div>
        <div className="panel-body stack">
          {result?.employeeStats.map((stat) => {
            const employee = project.employees.find((item) => item.id === stat.employeeId);
            if (!employee) return null;
            const pct = Math.min(100, Math.round((stat.totalHours / stat.targetHours) * 100));
            return (
              <div className="metric" key={stat.employeeId}>
                <strong>
                  {employee.name} {stat.totalHours}h
                </strong>
                <div className="progress">
                  <span style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}

          <div className="shortage-list">
            {result?.shortages.length ? (
              result.shortages.map((shortage) => (
                <button
                  className="shortage-item"
                  key={shortage.slotId}
                  onClick={() => onSetManualSlotId(shortage.slotId)}
                  type="button"
                >
                  <strong>{describeSlot(shortage.slotId)} 缺 {shortage.missingCount} 人</strong>
                  <span className="muted">
                    需要 {shortage.requiredCount} 人，已排 {shortage.assignedCount} 人
                  </span>
                </button>
              ))
            ) : (
              <Badge tone="success">当前没有缺人时段</Badge>
            )}
          </div>

          <label className="field">
            <span>手动调整时段</span>
            <select
              onChange={(event) => onSetManualSlotId(event.target.value)}
              value={selectedSlot}
            >
              {slots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {describeSlot(slot.id)}
                </option>
              ))}
            </select>
          </label>
          <div className="manual-list">
            {availableEmployees.map((employee) => (
              <button
                className="button"
                key={employee.id}
                onClick={() => project.addAssignment(selectedSlot, employee.id)}
                type="button"
              >
                <Plus />
                {employee.name}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function ScheduleRow({
  timeSlot,
  slots,
  onSetManualSlotId,
}: {
  timeSlot: TimeSlot;
  slots: TimeSlot[];
  onSetManualSlotId: (slotId: string) => void;
}) {
  const project = useProjectStore();
  const result = project.scheduleResult;

  return (
    <>
      <div className="time">{timeSlot.start}</div>
      {DAYS.map((day) => {
        const slot = slots.find(
          (candidate) => candidate.day === day.key && candidate.start === timeSlot.start,
        )!;
        const required = getRequiredCount(slot, project.staffingRules);
        const assignments = result ? findAssignmentEmployee(result.assignments, slot.id) : [];
        const shortage = assignments.length < required;
        return (
          <button
            className={shortage ? "schedule-cell shortage" : "schedule-cell"}
            key={slot.id}
            onClick={() => onSetManualSlotId(slot.id)}
            type="button"
          >
            {assignments.map((assignment) => {
              const employee = project.employees.find(
                (item) => item.id === assignment.employeeId,
              );
              if (!employee) return null;
              return (
                <span className="person-pill" key={`${slot.id}-${assignment.employeeId}`}>
                  {employee.name}
                  <span
                    className="mini-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      project.removeAssignment(slot.id, employee.id);
                    }}
                  >
                    <X />
                  </span>
                </span>
              );
            })}
            {shortage ? <Badge tone="danger">缺 {required - assignments.length} 人</Badge> : null}
          </button>
        );
      })}
    </>
  );
}

export default App;
