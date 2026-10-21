import type {Activity, Entry, Pattern} from './types';

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
}
function asPair(entries: Entry[], matches: (e: Entry) => boolean): [Entry[], Entry[]] {
  return [entries.filter(matches), entries.filter(e => !matches(e))];
}
export function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}
export function readableDay(day: string): string {
  return new Date(day + 'T12:00:00').toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
}
export function currentStreak(entries: Entry[], now = new Date()): number {
  const days = new Set(entries.map(e => e.day));
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  let result = 0;
  while (days.has(localDay(cursor))) {
    result += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return result;
}
export function averageMood(entries: Entry[]): string {
  return entries.length ? average(entries.map(e => e.mood)).toFixed(1) : '–';
}

export function detectPatterns(entries: Entry[]): Pattern[] {
  // Descriptive comparisons only; no causal claims and no fabricated confidence.
  if (entries.length < 7) return [];
  const patterns: Pattern[] = [];
  const groups: {id: string; title: string; predicate: (e: Entry) => boolean; phrase: string}[] = [
    {id: 'sleep',title: 'Sleep and mood',predicate: e => e.sleep_hours < 7,phrase: 'under 7 hours of sleep'},
    {id: 'stress',title: 'Stress and mood',predicate: e => e.stress >= 4,phrase: 'high stress'},
    {id: 'move',title: 'Movement and mood',predicate: e => e.exercise_min >= 20,phrase: '20+ minutes of movement'}
  ];
  for (const g of groups) {
    const [a, b] = asPair(entries, g.predicate);
    if (a.length < 3 || b.length < 3) continue;
    const aScore = average(a.map(e => e.mood));
    const bScore = average(b.map(e => e.mood));
    if (Math.abs(aScore - bScore) < 0.3) continue;
    patterns.push({
      id: g.id,title: g.title,count: a.length + b.length,
      detail: 'On ' + a.length + ' logged days with ' + g.phrase + ', average mood was ' +
        aScore.toFixed(1) + '/5 versus ' + bScore.toFixed(1) +
        '/5 on ' + b.length + ' other days. This is an association, not a cause.'
    });
  }
  return patterns;
}

export function recommend(entries: Entry[]): Activity[] {
  const newest = [...entries].sort((a, b) => b.day.localeCompare(a.day))[0];
  const patterns = detectPatterns(entries).map(p => p.id);
  const items: Activity[] = [];
  if (newest && (newest.stress >= 4 || patterns.includes('stress'))) items.push({
    id: 'breathing',title: 'Guided breathing break',minutes: 5,difficulty: 'Easy',
    reason: 'You logged stress at ' + newest.stress + '/5. A short breathing pause is one low-effort way to unwind.'
  });
  if (newest && (newest.sleep_hours < 7 || patterns.includes('sleep'))) items.push({
    id: 'winddown',title: 'Screen-free wind-down',minutes: 15,difficulty: 'Easy',
    reason: 'Your most recent sleep log is ' + newest.sleep_hours.toFixed(1) +
      ' hours. A consistent bedtime routine may support rest.'
  });
  if (newest && newest.exercise_min < 20) items.push({
    id: 'walk',title: 'Go for a gentle walk',minutes: 10,difficulty: 'Easy',
    reason: 'You logged ' + newest.exercise_min + ' minutes of exercise. Light movement is a flexible option.'
  });
  const defaults: Activity[] = [
    {id:'journal',title:'Write a short reflection',minutes:10,difficulty:'Easy',reason:'A quick reflection can help you notice your thoughts. No mood improvement is guaranteed.'},
    {id:'stretch',title:'Easy body stretch',minutes:8,difficulty:'Easy',reason:'Gentle movement can offer a short pause in your day.'},
    {id:'reachout',title:'Connect with someone',minutes:10,difficulty:'Moderate',reason:'Checking in with someone you trust can be a supportive activity.'},
    {id:'breathing',title:'Guided breathing break',minutes:5,difficulty:'Easy',reason:'A short breathing pause can fit into a busy day.'}
  ];
  for (const item of defaults) if (!items.some(x => x.id === item.id)) items.push(item);
  return items.slice(0, 3);
}
