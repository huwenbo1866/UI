import { writable } from 'svelte/store';
import {
  listWrongQuestions,
  upsertWrongQuestion,
  deleteWrongQuestion,
  clearWrongQuestions,
  type WrongQuestionRecord,
  type WrongQuestionSourceType,
  type UpsertWrongQuestionPayload
} from '$lib/apis/knowledge-defense';

export const wrongQuestions = writable<WrongQuestionRecord[]>([]);
export const wrongQuestionsLoading = writable(false);
export const wrongQuestionsError = writable<string | null>(null);

function sortWrongQuestions(items: WrongQuestionRecord[]) {
  return [...items].sort((a, b) => b.last_wrong_at - a.last_wrong_at);
}

function upsertLocal(items: WrongQuestionRecord[], next: WrongQuestionRecord) {
  const idx = items.findIndex((item) => item.id === next.id);
  if (idx === -1) return sortWrongQuestions([next, ...items]);
  const clone = [...items];
  clone[idx] = next;
  return sortWrongQuestions(clone);
}

export async function refreshWrongQuestions(params: {
  source_type?: WrongQuestionSourceType;
  source_id?: string | null;
  limit?: number;
  offset?: number;
} = {}) {
  wrongQuestionsLoading.set(true);
  wrongQuestionsError.set(null);
  try {
    const data = await listWrongQuestions(params);
    wrongQuestions.set(sortWrongQuestions(data.items));
    return data.items;
  } catch (error) {
    wrongQuestionsError.set(error instanceof Error ? error.message : '加载错题本失败');
    throw error;
  } finally {
    wrongQuestionsLoading.set(false);
  }
}

export async function recordWrongQuestionEntry(payload: UpsertWrongQuestionPayload) {
  wrongQuestionsError.set(null);
  const saved = await upsertWrongQuestion(payload);
  wrongQuestions.update((items) => upsertLocal(items, saved));
  return saved;
}

export async function removeWrongQuestionEntry(id: string) {
  await deleteWrongQuestion(id);
  wrongQuestions.update((items) => items.filter((item) => item.id !== id));
}

export async function clearWrongQuestionEntries(source_type?: WrongQuestionSourceType, source_id?: string | null) {
  await clearWrongQuestions(source_type, source_id);
  wrongQuestions.set([]);
}
