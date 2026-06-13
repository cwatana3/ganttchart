import { addDays } from 'date-fns';
import type { Calendar, DependencyRef, Task } from '../types';
import { addWorkingDays, countWorkingDays, fromDate, isWorkingDay, toDate } from './calendar';
import { depRefs } from './deps';

type DatesLike = Pick<Task, 'startDate' | 'endDate'>;

/**
 * dateStr から offset 稼働日だけ移動した日付を返す。
 * 正の offset は addWorkingDays と同じ（dateStr 自体は数えない）。
 * 負の offset は過去方向に稼働日を数えて戻る。
 */
export function shiftWorkingDays(dateStr: string, offset: number, calendar: Calendar): string {
  if (offset >= 0) return addWorkingDays(dateStr, offset, calendar);

  let current = toDate(dateStr);
  let remaining = -offset;
  let guard = 0;
  while (remaining > 0 && guard < 3660) {
    current = addDays(current, -1);
    if (isWorkingDay(fromDate(current), calendar)) remaining--;
    guard++;
  }
  return fromDate(current);
}

/**
 * 依存制約から後続タスク側に要求される最早日付を返す。
 * - FS/FF: 先行の endDate 基準、SS/SF: 先行の startDate 基準
 * - lag は稼働日数（負も可）
 */
export function constraintDate(ref: DependencyRef, pred: DatesLike, calendar: Calendar): string {
  const base = ref.type[0] === 'F' ? pred.endDate : pred.startDate;
  return shiftWorkingDays(base, ref.lag, calendar);
}

/**
 * 後続タスクが依存制約に違反しているか。
 * FS/SS は後続の startDate、FF/SF は後続の endDate と比較する。
 * (yyyy-MM-dd 文字列は辞書順比較で日付比較になる)
 */
export function isDepViolated(succ: Task, pred: Task, ref: DependencyRef, calendar: Calendar): boolean {
  const required = constraintDate(ref, pred, calendar);
  const actual = ref.type[1] === 'S' ? succ.startDate : succ.endDate;
  return actual < required;
}

/**
 * 依存制約を満たすようにタスクを後送りする（前倒しは一切しない）。
 * - 親タスクが先行/後続の場合は子孫リーフの集約日付で評価し、
 *   後続親への違反は子孫リーフ全体を同じ稼働日数だけシフトして解消する
 * - マイルストーン（duration 0）は start = end を維持
 * - 変更がなければ元の配列をそのまま返す
 */
export function scheduleProject(tasks: Task[], calendar: Calendar): Task[] {
  if (tasks.length === 0) return tasks;

  const work = new Map<string, Task>(tasks.map(t => [t.id, t]));
  const parentIds = new Set(
    tasks.map(t => t.parentId).filter((p): p is string => p !== null)
  );
  const childrenMap = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.parentId) {
      const arr = childrenMap.get(t.parentId) ?? [];
      arr.push(t.id);
      childrenMap.set(t.parentId, arr);
    }
  }

  function leafIds(id: string): string[] {
    const kids = childrenMap.get(id);
    if (!kids || kids.length === 0) return [id];
    return kids.flatMap(leafIds);
  }

  function effective(id: string): DatesLike | null {
    const t = work.get(id);
    if (!t) return null;
    if (!parentIds.has(id)) return t;
    let start = '';
    let end = '';
    for (const lid of leafIds(id)) {
      const leaf = work.get(lid)!;
      if (!start || leaf.startDate < start) start = leaf.startDate;
      if (!end || leaf.endDate > end) end = leaf.endDate;
    }
    return start ? { startDate: start, endDate: end } : t;
  }

  let mutated = false;
  // 非循環なら依存の深さ ≤ タスク数なのでこのパス数で必ず収束する
  const maxPasses = tasks.length + 2;
  for (let pass = 0; pass < maxPasses; pass++) {
    let passChanged = false;

    for (const orig of tasks) {
      const t = work.get(orig.id)!;
      const refs = depRefs(t);
      if (refs.length === 0) continue;

      const self = effective(t.id)!;
      let shift = 0;
      for (const ref of refs) {
        if (ref.id === t.id) continue;
        const pred = effective(ref.id);
        if (!pred) continue;
        const required = constraintDate(ref, pred, calendar);
        const actual = ref.type[1] === 'S' ? self.startDate : self.endDate;
        if (actual < required) {
          const s = Math.max(1, countWorkingDays(actual, required, calendar));
          if (s > shift) shift = s;
        }
      }
      if (shift === 0) continue;

      const targets = parentIds.has(t.id) ? leafIds(t.id) : [t.id];
      for (const id of targets) {
        const leaf = work.get(id)!;
        const newStart = shiftWorkingDays(leaf.startDate, shift, calendar);
        work.set(id, {
          ...leaf,
          startDate: newStart,
          endDate: leaf.duration > 0 ? addWorkingDays(newStart, leaf.duration, calendar) : newStart,
        });
      }
      passChanged = true;
      mutated = true;
    }

    if (!passChanged) break;
  }

  if (!mutated) return tasks;
  return tasks.map(t => work.get(t.id)!);
}

/**
 * クリティカルパス上のタスク ID 集合を返す。
 * 各タスクの「最遅終了日(LF)」を後ろ向きの緩和法で求め、
 * 実際の終了日 == LF なら余裕（フロート）ゼロ＝クリティカルと判定する。
 * 親タスクは、クリティカルな子孫を持つ場合に祖先として追加される。
 * 循環依存があってもパス数上限で必ず終了する。
 */
export function criticalTaskIds(tasks: Task[], calendar: Calendar): Set<string> {
  const result = new Set<string>();
  if (tasks.length === 0) return result;

  const byId = new Map(tasks.map(t => [t.id, t]));

  let projectFinish = '';
  for (const t of tasks) {
    if (!projectFinish || t.endDate > projectFinish) projectFinish = t.endDate;
  }

  // LF(t): t がプロジェクト完了日を遅らせずに終われる最遅日
  const lf = new Map<string, string>(tasks.map(t => [t.id, projectFinish]));

  const maxPasses = tasks.length + 2;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const succ of tasks) {
      for (const ref of depRefs(succ)) {
        const pred = byId.get(ref.id);
        if (!pred || pred.id === succ.id) continue;

        const lfSucc = lf.get(succ.id)!;
        const lsSucc = shiftWorkingDays(lfSucc, -succ.duration, calendar);
        // 制約に関わる後続側エッジの最遅日
        const latestSuccEdge = ref.type[1] === 'S' ? lsSucc : lfSucc;
        // 先行側エッジの最遅日（ラグぶん手前）
        const latestPredEdge = shiftWorkingDays(latestSuccEdge, -ref.lag, calendar);
        // 先行タスクの最遅終了日へ換算（S 制約なら開始基準なので duration を加算）
        const candidateLf = ref.type[0] === 'F'
          ? latestPredEdge
          : shiftWorkingDays(latestPredEdge, pred.duration, calendar);

        if (candidateLf < lf.get(pred.id)!) {
          lf.set(pred.id, candidateLf);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  for (const t of tasks) {
    if (lf.get(t.id) === t.endDate) result.add(t.id);
  }

  // クリティカルなタスクの祖先（サマリーバー）も含める
  for (const id of [...result]) {
    let pid = byId.get(id)?.parentId ?? null;
    while (pid && !result.has(pid)) {
      result.add(pid);
      pid = byId.get(pid)?.parentId ?? null;
    }
  }

  return result;
}
