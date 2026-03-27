import {
  wrongQuestions,
  refreshWrongQuestions,
  recordWrongQuestionEntry,
  markWrongQuestionCorrectEntry,
  clearWrongQuestionEntries,
  type WrongQuestionRecord
} from '$lib/stores/knowledge-defense';
import type { Question } from '../core/types';

const SOURCE_TYPE = 'pack' as const;

export const wrongNotebookStore = wrongQuestions;

export async function loadWrongNotebook(sourceId: string) {
  return refreshWrongQuestions({ source_type: SOURCE_TYPE, source_id: sourceId, limit: 200 });
}

export async function clearWrongNotebook(sourceId: string) {
  return clearWrongQuestionEntries(SOURCE_TYPE, sourceId);
}

export async function recordWrongNotebookEntry(sourceId: string, question: Question, answer: string) {
  return recordWrongQuestionEntry({
    source_type: SOURCE_TYPE,
    source_id: sourceId,
    question_id: question.id,
    question: question.prompt,
    options: question.options,
    correct_answer: question.answer,
    explanation: question.explanation,
    last_user_answer: answer
  });
}

export async function markWrongNotebookCorrect(sourceId: string, questionId: string) {
  return markWrongQuestionCorrectEntry({
    source_type: SOURCE_TYPE,
    source_id: sourceId,
    question_id: questionId,
    mastery_threshold: 2
  });
}

export function buildWrongNotebookStats(items: WrongQuestionRecord[]) {
  const total = items.length;
  const repeated = items.filter((item) => item.wrong_count >= 2).length;
  const typeMap = new Map<string, number>();

  const getQuestionType = (question: string) => {
    const prompt = question.replace(/\s+/g, '');
    if (/因为.*所以|因果|为什么|原因|结果/.test(prompt)) return '因果关系';
    if (/首都|朝代|历史|时间|哪一年|人物/.test(prompt)) return '历史人文';
    if (/语法|时态|单词|英语|词性|句型/.test(prompt)) return '英语语言';
    if (/实验|水循环|蒸发|凝结|生物|化学|物理|科学/.test(prompt)) return '科学概念';
    if (/计算|几何|方程|分数|面积|周长|数学/.test(prompt)) return '数学推理';
    return '综合理解';
  };

  for (const item of items) {
    const type = getQuestionType(item.question);
    typeMap.set(type, (typeMap.get(type) ?? 0) + 1);
  }

  const typeEntries = [...typeMap.entries()].sort((a, b) => b[1] - a[1]);
  const topType = typeEntries[0]?.[0] ?? '综合理解';
  const advice: string[] = [];

  if (total === 0) {
    advice.push('当前还没有错题，可以先完成几次升级答题，再回来查看自己的薄弱点。');
  } else {
    advice.push(`建议优先复习「${topType}」相关题目，先把高频失分点补稳。`);
    if (repeated > 0) advice.push(`当前有 ${repeated} 道题已经反复出错，建议先遮住答案自测一遍。`);
    if (typeEntries.length >= 2) advice.push(`除了「${topType}」，也要兼顾「${typeEntries[1][0]}」类题目。`);
    advice.push('复习时先自己回忆答案，再对照解析，会比直接看答案更有效。');
  }

  return { total, repeated, typeEntries, advice };
}
