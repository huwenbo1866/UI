import type { Question, Vec2 } from './types';

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeVector(x: number, y: number): Vec2 {
  const len = Math.hypot(x, y);
  if (!len) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

export function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function takeRandomDistinct<T>(items: T[], count: number): T[] {
  if (items.length <= count) return shuffle(items);
  return shuffle(items).slice(0, count);
}

export function getQuestionType(question: string) {
  const prompt = question.replace(/\s+/g, '');
  if (/因为.*所以|因果|为什么|原因|结果/.test(prompt)) return '因果关系';
  if (/首都|朝代|历史|时间|哪一年|人物/.test(prompt)) return '历史人文';
  if (/语法|时态|单词|英语|词性|句型/.test(prompt)) return '英语语言';
  if (/实验|水循环|蒸发|凝结|生物|化学|物理|科学/.test(prompt)) return '科学概念';
  if (/计算|几何|方程|分数|面积|周长|数学/.test(prompt)) return '数学推理';
  return '综合理解';
}

export function buildQuestionIndex(questions: Question[]) {
  return new Map(questions.map((question) => [question.id, question]));
}
