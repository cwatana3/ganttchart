import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useProject } from '../../store/ProjectContext';
import { getVisibleTasks, checkCircularDependency } from '../../utils/taskTree';
import { depRefs, depIds } from '../../utils/deps';
import { darken } from '../../utils/color';
import { toDate, fromDate, addWorkingDays, countWorkingDays } from '../../utils/calendar';
import { addDays, differenceInCalendarDays } from 'date-fns';
import styles from './GanttView.module.css';

const ROW_HEIGHT = 34;
const BAR_HEIGHT = 12;
const BAR_Y_OFFSET = 11;
const HEADER_HEIGHT = 38;
const MILESTONE_SIZE = 8;
const RESIZE_HANDLE_WIDTH = 8;
const PADDING_X = 32;

type DragMode = 'move' | 'resize';

interface DragState {
  taskId: string;
  mode: DragMode;
  startX: number;
  originalStartDate: string;
  originalEndDate: string;
  originalDuration: number;
}

interface GanttViewProps {
  svgRef: React.RefObject<SVGSVGElement>;
  wrapperRef: React.RefObject<HTMLDivElement>;
  scrollRef: React.RefObject<HTMLDivElement>;
  scrollToTodayRef?: React.MutableRefObject<(() => void) | null>;
}

export function GanttView({ svgRef, wrapperRef, scrollRef, scrollToTodayRef }: GanttViewProps) {
  const { project, dispatch, viewMode, selectedTaskIds } = useProject();
  const visibleTasks = getVisibleTasks(project.tasks);
  const [isDragging, setIsDragging] = useState(false);
  const [linkingState, setLinkingState] = useState<{ fromTaskId: string; startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [renderX, setRenderX] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  const currentXRef = useRef(0);
  const headerRef = useRef<HTMLDivElement>(null);

  const colWidth = useMemo(() => {
    if (viewMode === 'week') return 8;
    if (viewMode === 'month') return 2;
    return 32; // day
  }, [viewMode]);

  const { minDate, totalDays, totalWidth, barsHeight } = useMemo(() => {
    if (visibleTasks.length === 0) {
      let today = new Date();
      if (viewMode === 'week') {
        today = addDays(today, -today.getDay());
      } else if (viewMode === 'month') {
        today = new Date(today.getFullYear(), today.getMonth(), 1);
      }
      const days = viewMode === 'month' ? 365 : viewMode === 'week' ? 90 : 30;
      return {
        minDate: today,
        maxDate: addDays(today, days),
        totalDays: days,
        totalWidth: days * colWidth + PADDING_X * 2,
        barsHeight: ROW_HEIGHT + 50,
      };
    }

    let min = toDate('2099-12-31');
    let max = toDate('2000-01-01');

    for (const task of visibleTasks) {
      const start = toDate(task.startDate);
      const end = toDate(task.endDate);
      if (start < min) min = start;
      if (end > max) max = end;
    }

    let startPadding = -5;
    let endPadding = 10;
    if (viewMode === 'week') {
      startPadding = -14;
      endPadding = 28;
    } else if (viewMode === 'month') {
      startPadding = -60;
      endPadding = 120;
    }

    min = addDays(min, startPadding);
    max = addDays(max, endPadding);

    if (viewMode === 'week') {
      // Align min to Sunday
      const day = min.getDay();
      min = addDays(min, -day);
    } else if (viewMode === 'month') {
      // Align min to 1st of the month
      min = new Date(min.getFullYear(), min.getMonth(), 1);
    }

    const days = differenceInCalendarDays(max, min) + 1;
    const width = days * colWidth + PADDING_X * 2;
    const bHeight = visibleTasks.length * ROW_HEIGHT + 50;

    return { minDate: min, maxDate: max, totalDays: days, totalWidth: width, barsHeight: bHeight };
  }, [visibleTasks, viewMode, colWidth]);

  const getX = useCallback((dateStr: string): number => {
    return differenceInCalendarDays(toDate(dateStr), minDate) * colWidth + PADDING_X;
  }, [minDate, colWidth]);

  const getDate = useCallback((x: number): string => {
    const dayOffset = Math.round((x - PADDING_X) / colWidth);
    return fromDate(addDays(minDate, dayOffset));
  }, [minDate, colWidth]);

  const todayStr = fromDate(new Date());

  // Expose "scroll to today" to the toolbar
  useEffect(() => {
    if (!scrollToTodayRef) return;
    scrollToTodayRef.current = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ left: Math.max(0, getX(todayStr) - el.clientWidth / 3), behavior: 'smooth' });
    };
    return () => {
      scrollToTodayRef.current = null;
    };
  }, [scrollToTodayRef, getX, todayStr]);

  // Sync horizontal scroll between header and bars
  useEffect(() => {
    const scrollEl = scrollRef.current;
    const headerEl = headerRef.current;
    if (!scrollEl || !headerEl) return;

    const onScroll = () => {
      headerEl.scrollLeft = scrollEl.scrollLeft;
    };

    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, []);

  const handleBarMouseDown = (e: React.MouseEvent, taskId: string, startDate: string, endDate: string, duration: number, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    if (e.shiftKey) {
      const idx = visibleTasks.findIndex(t => t.id === taskId);
      if (idx !== -1) {
        const barY = idx * ROW_HEIGHT + BAR_Y_OFFSET + BAR_HEIGHT / 2;
        const barEndX = getX(endDate);
        setLinkingState({
          fromTaskId: taskId,
          startX: barEndX,
          startY: barY,
          currentX: startX,
          currentY: startY,
        });
      }
      return;
    }

    dragRef.current = { taskId, mode, startX, originalStartDate: startDate, originalEndDate: endDate, originalDuration: duration };
    currentXRef.current = startX;
    setRenderX(startX);
    setIsDragging(true);
  };

  const handleResizeMouseDown = (e: React.MouseEvent, taskId: string, startDate: string, endDate: string, duration: number) => {
    handleBarMouseDown(e, taskId, startDate, endDate, duration, 'resize');
  };

  const handleMoveMouseDown = (e: React.MouseEvent, taskId: string, startDate: string, endDate: string, duration: number) => {
    handleBarMouseDown(e, taskId, startDate, endDate, duration, 'move');
  };

  useEffect(() => {
    if (!isDragging && !linkingState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      if (linkingState) {
        setLinkingState(prev => prev ? { ...prev, currentX, currentY } : null);
        return;
      }

      currentXRef.current = currentX;
      setRenderX(currentX);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (linkingState) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const taskEl = el?.closest('[data-task-id]');
        if (taskEl) {
          const toTaskId = taskEl.getAttribute('data-task-id');
          if (toTaskId && toTaskId !== linkingState.fromTaskId) {
            const successorTask = project.tasks.find(t => t.id === toTaskId);
            if (successorTask) {
              const currentDeps = successorTask.dependencies || [];
              if (!depIds(successorTask).includes(linkingState.fromTaskId)) {
                const isCircular = checkCircularDependency(toTaskId, linkingState.fromTaskId, project.tasks);
                if (!isCircular) {
                  dispatch({
                    type: 'UPDATE_TASK',
                    id: toTaskId,
                    changes: { dependencies: [...currentDeps, linkingState.fromTaskId] },
                  });
                } else {
                  alert('循環依存関係が発生するため接続できません');
                }
              }
            }
          }
        }
        setLinkingState(null);
        return;
      }

      const dragging = dragRef.current;
      if (dragging) {
        const currentX = currentXRef.current;
        if (dragging.mode === 'move') {
          const offsetX = currentX - dragging.startX;
          const dayOffset = Math.round(offsetX / colWidth);
          if (dayOffset !== 0) {
            const isPartofSelection = selectedTaskIds.includes(dragging.taskId);
            const idsToShift = isPartofSelection ? selectedTaskIds : [dragging.taskId];
            dispatch({ type: 'SHIFT_TASKS', ids: idsToShift, dayOffset });
          }
        } else {
          const originalEnd = toDate(dragging.originalEndDate);
          const originalEndX = differenceInCalendarDays(toDate(dragging.originalEndDate), minDate) * colWidth + PADDING_X;
          const offsetX = currentX - originalEndX;
          const dayOffset = Math.round(offsetX / colWidth);
          if (dayOffset !== 0) {
            const newEnd = fromDate(addDays(originalEnd, dayOffset));
            const startDate = dragging.originalStartDate;
            // Keep at least one working day, otherwise UPDATE_TASK derives
            // duration 0 and silently turns the task into a milestone
            const endDate = countWorkingDays(startDate, newEnd, project.calendar) < 1
              ? addWorkingDays(startDate, 1, project.calendar)
              : newEnd;
            dispatch({ type: 'UPDATE_TASK', id: dragging.taskId, changes: { endDate } });
          }
        }
      }
      dragRef.current = null;
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, linkingState, project.tasks, project.calendar, selectedTaskIds, dispatch, minDate, colWidth]);

  // Timeline header dates
  const timelineDates = useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => {
      const date = addDays(minDate, i);
      const x = i * colWidth + PADDING_X;
      return { date, x };
    });
  }, [minDate, totalDays, colWidth]);

  // Top header cells
  const topHeaderCells = useMemo(() => {
    const cells: { key: string; x: number; width: number; label: string }[] = [];
    
    if (viewMode === 'month') {
      const yearBlocks: { year: number; startIdx: number; endIdx: number }[] = [];
      timelineDates.forEach((td, i) => {
        const y = td.date.getFullYear();
        if (yearBlocks.length === 0 || yearBlocks[yearBlocks.length - 1].year !== y) {
          yearBlocks.push({ year: y, startIdx: i, endIdx: i });
        } else {
          yearBlocks[yearBlocks.length - 1].endIdx = i;
        }
      });
      yearBlocks.forEach((block, idx) => {
        const startX = timelineDates[block.startIdx].x;
        const endX = timelineDates[block.endIdx].x + colWidth;
        cells.push({
          key: `year-${block.year}-${idx}`,
          x: startX,
          width: endX - startX,
          label: `${block.year}年`,
        });
      });
    } else {
      const monthBlocks: { month: number; year: number; startIdx: number; endIdx: number }[] = [];
      timelineDates.forEach((td, i) => {
        const m = td.date.getMonth();
        const y = td.date.getFullYear();
        if (monthBlocks.length === 0 || monthBlocks[monthBlocks.length - 1].month !== m || monthBlocks[monthBlocks.length - 1].year !== y) {
          monthBlocks.push({ month: m, year: y, startIdx: i, endIdx: i });
        } else {
          monthBlocks[monthBlocks.length - 1].endIdx = i;
        }
      });
      const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
      monthBlocks.forEach((block, idx) => {
        const startX = timelineDates[block.startIdx].x;
        const endX = timelineDates[block.endIdx].x + colWidth;
        const showYear = idx === 0 || monthBlocks[idx - 1].year !== block.year;
        const label = showYear ? `${block.year}年 ${monthNames[block.month]}` : monthNames[block.month];
        cells.push({
          key: `month-${block.year}-${block.month}-${idx}`,
          x: startX,
          width: endX - startX,
          label,
        });
      });
    }
    
    return cells;
  }, [viewMode, timelineDates, colWidth]);

  // Bottom header cells
  const bottomHeaderCells = useMemo(() => {
    const cells: { key: string; x: number; width: number; label: string; isWeekend?: boolean; isToday?: boolean; isSun?: boolean; isSat?: boolean }[] = [];
    
    if (viewMode === 'day') {
      timelineDates.forEach(({ date, x }) => {
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isSun = dayOfWeek === 0;
        const isSat = dayOfWeek === 6;
        const isToday = fromDate(date) === todayStr;
        cells.push({
          key: `day-${x}`,
          x,
          width: colWidth,
          label: String(date.getDate()),
          isWeekend,
          isToday,
          isSun,
          isSat,
        });
      });
    } else if (viewMode === 'week') {
      timelineDates.forEach(({ date, x }, idx) => {
        if (date.getDay() === 0 || idx === 0) {
          let nextSundayIdx = timelineDates.findIndex((td, i) => i > idx && td.date.getDay() === 0);
          if (nextSundayIdx === -1) {
            nextSundayIdx = timelineDates.length;
          }
          const daysSpan = nextSundayIdx - idx;
          const width = daysSpan * colWidth;
          cells.push({
            key: `week-${x}`,
            x,
            width,
            label: `${date.getMonth() + 1}/${date.getDate()}`,
          });
        }
      });
    } else if (viewMode === 'month') {
      timelineDates.forEach(({ date, x }, idx) => {
        if (date.getDate() === 1 || idx === 0) {
          let nextMonthIdx = timelineDates.findIndex((td, i) => i > idx && td.date.getDate() === 1);
          if (nextMonthIdx === -1) {
            nextMonthIdx = timelineDates.length;
          }
          const daysSpan = nextMonthIdx - idx;
          const width = daysSpan * colWidth;
          cells.push({
            key: `month-${x}`,
            x,
            width,
            label: `${date.getMonth() + 1}月`,
          });
        }
      });
    }
    
    return cells;
  }, [viewMode, timelineDates, colWidth, todayStr]);

  // Weekend columns
  const weekendBgs = useMemo(() => {
    if (viewMode === 'month') return [];
    
    const bgs: { x: number; width: number }[] = [];
    timelineDates.forEach(({ date, x }) => {
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        bgs.push({ x, width: colWidth });
      }
    });
    return bgs;
  }, [viewMode, timelineDates, colWidth]);

  const cursorStyle = isDragging
    ? (dragRef.current?.mode === 'resize' ? 'ew-resize' : 'grabbing')
    : (linkingState ? 'crosshair' : 'default');

  return (
    <div className={styles.wrapper} ref={wrapperRef} style={{ cursor: cursorStyle }}>
      {/* Sticky timeline header */}
      <div
        className={styles.headerSticky}
        ref={headerRef}
        style={{ overflow: 'hidden', height: HEADER_HEIGHT }}
      >
        <svg
          width={totalWidth}
          height={HEADER_HEIGHT - 1}
          className={styles.headerSvg}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Month row background */}
          <rect x={0} y={0} width={totalWidth} height={18} className={styles.weekendBg} />

          {/* Month blocks (Top row) */}
          {topHeaderCells.map((cell) => {
            const centerX = cell.x + cell.width / 2;
            return (
              <g key={cell.key}>
                <line x1={cell.x} y1={0} x2={cell.x} y2={18} className={styles.gridLine} />
                <text x={centerX} y={13} className={styles.timelineText} textAnchor="middle">
                  {cell.label}
                </text>
              </g>
            );
          })}
          {topHeaderCells.length > 0 && (() => {
            const last = topHeaderCells[topHeaderCells.length - 1];
            const endX = last.x + last.width;
            return <line x1={endX} y1={0} x2={endX} y2={18} className={styles.gridLine} />;
          })()}

          {/* Separator line between month and day rows */}
          <line x1={0} y1={18} x2={totalWidth} y2={18} className={styles.gridLine} />

          {/* Day row (Bottom row) */}
          {bottomHeaderCells.map((cell) => {
            const centerX = cell.x + cell.width / 2;
            return (
              <g key={cell.key}>
                {cell.isWeekend && (
                  <rect x={cell.x} y={18} width={cell.width} height={19} className={styles.weekendBg} />
                )}
                <line x1={cell.x} y1={18} x2={cell.x} y2={HEADER_HEIGHT - 1} className={styles.gridLine} />
                <text
                  x={centerX}
                  y={30}
                  className={styles.timelineText}
                  textAnchor="middle"
                  style={{
                    fill: cell.isToday ? '#ef4444' : cell.isSun ? '#ef4444' : cell.isSat ? '#3b82f6' : undefined,
                    fontWeight: cell.isToday ? '800' : undefined
                  }}
                >
                  {cell.label}
                </text>
              </g>
            );
          })}
          {bottomHeaderCells.length > 0 && (() => {
            const last = bottomHeaderCells[bottomHeaderCells.length - 1];
            const endX = last.x + last.width;
            return <line x1={endX} y1={18} x2={endX} y2={HEADER_HEIGHT - 1} className={styles.gridLine} />;
          })()}
        </svg>
      </div>

      {/* Scrollable task bars area */}
      <div className={styles.scrollArea} ref={scrollRef} style={{ overflow: 'auto' }}>
        <svg
          ref={svgRef}
          width={totalWidth}
          height={barsHeight}
          className={styles.barsSvg}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="task-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--task-bar-start)" />
              <stop offset="100%" stopColor="var(--task-bar-end)" />
            </linearGradient>
            <linearGradient id="summary-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--summary-bar-start)" />
              <stop offset="100%" stopColor="var(--summary-bar-end)" />
            </linearGradient>
            <linearGradient id="milestone-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--milestone-start)" />
              <stop offset="100%" stopColor="var(--milestone-end)" />
            </linearGradient>
            <marker
              id="dependency-arrow"
              viewBox="0 0 6 6"
              refX="6"
              refY="3"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 6 3 L 0 6 z" fill="var(--accent-color)" opacity="0.75" />
            </marker>
          </defs>

          {/* Weekend background columns */}
          {weekendBgs.map((bg, idx) => (
            <rect key={idx} x={bg.x} y={0} width={bg.width} height={barsHeight} className={styles.weekendBg} />
          ))}

          {/* Vertical grid lines */}
          {bottomHeaderCells.map((cell) => (
            <line key={cell.key} x1={cell.x} y1={0} x2={cell.x} y2={barsHeight} className={styles.gridLine} />
          ))}
          {bottomHeaderCells.length > 0 && (() => {
            const last = bottomHeaderCells[bottomHeaderCells.length - 1];
            const endX = last.x + last.width;
            return <line x1={endX} y1={0} x2={endX} y2={barsHeight} className={styles.gridLine} />;
          })()}

          {/* Horizontal grid lines */}
          {Array.from({ length: visibleTasks.length + 1 }, (_, i) => {
            const y = i * ROW_HEIGHT;
            return (
              <line key={i} x1={0} y1={y} x2={totalWidth} y2={y} className={styles.gridLine} />
            );
          })}

          {/* Today line */}
          {(() => {
            const todayX = getX(todayStr);
            if (todayX >= 0 && todayX <= totalWidth) {
              return (
                <line x1={todayX} y1={0} x2={todayX} y2={barsHeight} className={styles.todayLine} />
              );
            }
            return null;
          })()}

          {/* Dependency connection lines */}
          {visibleTasks.flatMap((task, succIdx) => {
            return depRefs(task).map((ref, depIdx) => {
              const predIdx = visibleTasks.findIndex(t => t.id === ref.id);
              if (predIdx === -1) return null;

              const predTask = visibleTasks[predIdx];
              const predX = ref.type[0] === 'F' ? getX(predTask.endDate) : getX(predTask.startDate);
              const predY = predIdx * ROW_HEIGHT + BAR_Y_OFFSET + BAR_HEIGHT / 2;

              const succX = ref.type[1] === 'S' ? getX(task.startDate) : getX(task.endDate);
              const succY = succIdx * ROW_HEIGHT + BAR_Y_OFFSET + BAR_HEIGHT / 2;
              
              const startX = predX;
              const startY = predY;
              const endX = succX;
              const endY = succY;
              
              let points: string = '';
              
              if (endX >= startX + 12) {
                const midX = startX + (endX - startX) / 2;
                points = [
                  `${startX},${startY}`,
                  `${midX},${startY}`,
                  `${midX},${endY}`,
                  `${endX},${endY}`
                ].join(' ');
              } else {
                const offsetOut = startX + 6;
                const offsetIn = endX - 6;
                const midY = startY + (endY - startY) / 2;
                points = [
                  `${startX},${startY}`,
                  `${offsetOut},${startY}`,
                  `${offsetOut},${midY}`,
                  `${offsetIn},${midY}`,
                  `${offsetIn},${endY}`,
                  `${endX},${endY}`
                ].join(' ');
              }
              
              return (
                <polyline
                  key={`dep-${predTask.id}-${task.id}-${depIdx}`}
                  points={points}
                  className={styles.dependencyLine}
                  markerEnd="url(#dependency-arrow)"
                />
              );
            });
          })}

          {/* Temporary linking line */}
          {linkingState && (
            <line
              x1={linkingState.startX}
              y1={linkingState.startY}
              x2={linkingState.currentX}
              y2={linkingState.currentY}
              className={styles.linkingLine}
              markerEnd="url(#dependency-arrow)"
            />
          )}

          {/* Task bars */}
          {visibleTasks.map((task, i) => {
            const y = i * ROW_HEIGHT + BAR_Y_OFFSET;
            const d = dragRef.current;
            const isBeingDragged = isDragging && d?.taskId === task.id;
            const isResizing = isBeingDragged && d?.mode === 'resize';
            const isMoving = isDragging && d?.mode === 'move' && 
              (d?.taskId === task.id || (selectedTaskIds.includes(d.taskId) && selectedTaskIds.includes(task.id)));
            const isDraggedOrMovingSelected = isBeingDragged || 
              (isDragging && d?.mode === 'move' && selectedTaskIds.includes(d.taskId) && selectedTaskIds.includes(task.id));

            const originalX1 = getX(task.startDate);
            const originalX2 = getX(task.endDate);

            const x1 = isMoving ? originalX1 + (currentXRef.current - d!.startX) : originalX1;
            let barWidth: number;
            if (isResizing) {
              const resizeDelta = currentXRef.current - getX(d!.originalEndDate);
              barWidth = Math.max(4, (originalX2 - originalX1) + resizeDelta);
            } else {
              barWidth = Math.max(4, originalX2 - originalX1);
            }

            const hasChildren = project.tasks.some(t => t.parentId === task.id);

            if (task.isMilestone) {
              const cx = x1 + colWidth / 2;
              const cy = y + BAR_HEIGHT / 2;
              const points = [
                `${cx},${cy - MILESTONE_SIZE}`,
                `${cx + MILESTONE_SIZE},${cy}`,
                `${cx},${cy + MILESTONE_SIZE}`,
                `${cx - MILESTONE_SIZE},${cy}`,
              ].join(' ');
              return (
                <polygon
                  key={task.id}
                  data-task-id={task.id}
                  points={points}
                  className={styles.milestoneDiamond}
                  style={{
                    cursor: isDraggedOrMovingSelected ? 'grabbing' : 'grab',
                    opacity: isDraggedOrMovingSelected ? 0.6 : 1,
                    fill: task.color ?? undefined,
                    stroke: task.color ? darken(task.color, 0.7) : undefined,
                  }}
                  onMouseDown={(e) => handleMoveMouseDown(e, task.id, task.startDate, task.endDate, task.duration)}
                />
              );
            }

            if (hasChildren) {
              const dPath = [
                `M ${x1} ${y}`,
                `H ${x1 + barWidth}`,
                `V ${y + 14}`,
                `L ${x1 + barWidth - 4} ${y + 8}`,
                `H ${x1 + 4}`,
                `L ${x1} ${y + 14}`,
                `Z`
              ].join(' ');

              return (
                <g key={task.id} data-task-id={task.id}>
                  <path
                     d={dPath}
                     className={styles.summaryBar}
                     style={{
                       cursor: isDraggedOrMovingSelected ? 'grabbing' : 'grab',
                       opacity: isDraggedOrMovingSelected ? 0.6 : 1,
                     }}
                     onMouseDown={(e) => handleMoveMouseDown(e, task.id, task.startDate, task.endDate, task.duration)}
                  />
                  <rect
                    x={x1 + barWidth - RESIZE_HANDLE_WIDTH}
                    y={y}
                    width={RESIZE_HANDLE_WIDTH}
                    height={BAR_HEIGHT}
                    fill="transparent"
                    style={{ cursor: 'ew-resize' }}
                    onMouseDown={(e) => handleResizeMouseDown(e, task.id, task.startDate, task.endDate, task.duration)}
                  />
                </g>
              );
            }

            const progressW = barWidth * Math.max(0, Math.min(100, task.progress)) / 100;

            return (
              <g key={task.id} data-task-id={task.id}>
                <rect
                  x={x1}
                  y={y}
                  width={barWidth}
                  height={BAR_HEIGHT}
                  className={styles.taskBar}
                  rx={2}
                  ry={2}
                  style={{
                    cursor: isDraggedOrMovingSelected ? (isResizing ? 'ew-resize' : 'grabbing') : 'grab',
                    opacity: isDraggedOrMovingSelected ? 0.6 : 1,
                    transition: isDraggedOrMovingSelected ? 'none' : 'opacity 0.1s',
                    fill: task.color ?? undefined,
                    stroke: task.color ? darken(task.color, 0.7) : undefined,
                  }}
                  onMouseDown={(e) => handleMoveMouseDown(e, task.id, task.startDate, task.endDate, task.duration)}
                />
                {progressW > 0 && (
                  <rect
                    x={x1}
                    y={y}
                    width={progressW}
                    height={BAR_HEIGHT}
                    rx={2}
                    ry={2}
                    className={styles.progressFill}
                  />
                )}
                <rect
                  x={x1 + barWidth - RESIZE_HANDLE_WIDTH}
                  y={y}
                  width={RESIZE_HANDLE_WIDTH}
                  height={BAR_HEIGHT}
                  fill="transparent"
                  style={{ cursor: 'ew-resize' }}
                  onMouseDown={(e) => handleResizeMouseDown(e, task.id, task.startDate, task.endDate, task.duration)}
                />
              </g>
            );
          })}

          {/* Drag ghost */}
          {isDragging && dragRef.current && (
            <>
              <line x1={renderX} y1={0} x2={renderX} y2={barsHeight} stroke="#007acc" strokeWidth={1} strokeDasharray="4 2" />
              <text x={renderX + 4} y={14} fill="#007acc" fontSize={11} fontFamily="system-ui">
                {dragRef.current.mode === 'resize' ? `${getDate(renderX)} まで` : getDate(renderX)}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  );
}


