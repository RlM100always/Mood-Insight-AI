export type MoodScore = 1 | 2 | 3 | 4 | 5;
export type Entry = {
  id: string;
  day: string; // local YYYY-MM-DD; one entry per calendar day
  mood: MoodScore;
  sleep_hours: number;
  exercise_min: number;
  stress: MoodScore;
  note: string;
  created_at: number;
  updated_at: number;
};
export type EntryInput = Pick<Entry, 'day' | 'mood' | 'sleep_hours' | 'exercise_min' | 'stress' | 'note'>;
export type Activity = {id: string; title: string; reason: string; minutes: number; difficulty: 'Easy' | 'Moderate';};
export type Session = {id: string; activity_id: string; day: string; created_at: number; helpful: number | null};
export type Pattern = {id: string; title: string; detail: string; count: number;};
