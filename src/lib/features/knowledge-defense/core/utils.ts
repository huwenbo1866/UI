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

export function normalizeAnswerText(input: string) {
  return String(input ?? '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xfee0)
    )
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function extractChoiceLabel(input: string): string | null {
  const normalized = normalizeAnswerText(input);
  const matched = normalized.match(/^([a-d])(?:[\.\)、:：\s]|$)/i);
  if (matched?.[1]) return matched[1].toUpperCase();
  if (normalized === '正确' || normalized === '对' || normalized === 'true') return '正确';
  if (normalized === '错误' || normalized === '错' || normalized === 'false') return '错误';
  return null;
}

export function isAnswerCorrect(selected: string, answer: string) {
  const selectedNorm = normalizeAnswerText(selected);
  const answerNorm = normalizeAnswerText(answer);
  if (selectedNorm === answerNorm) return true;

  const selectedLabel = extractChoiceLabel(selected);
  const answerLabel = extractChoiceLabel(answer);
  if (selectedLabel && answerLabel && selectedLabel === answerLabel) return true;

  if (selectedLabel && !answerLabel && selectedLabel === answerNorm.toUpperCase()) return true;
  if (answerLabel && !selectedLabel && answerLabel === selectedNorm.toUpperCase()) return true;

  return false;
}

export function isAnswerCorrectWithOptions(
  selected: string,
  answer: string,
  options: string[] = []
) {
  if (isAnswerCorrect(selected, answer)) return true;

  const answerLabel = extractChoiceLabel(answer);
  if (answerLabel && /^[A-D]$/.test(answerLabel) && options.length > 0) {
    const index = answerLabel.charCodeAt(0) - 65;
    const optionText = options[index];
    if (optionText && normalizeAnswerText(selected) === normalizeAnswerText(optionText)) {
      return true;
    }
  }

  const selectedIndex = options.findIndex(
    (opt) => normalizeAnswerText(opt) === normalizeAnswerText(selected)
  );
  if (selectedIndex >= 0) {
    const selectedLabel = String.fromCharCode(65 + selectedIndex);
    if (answerLabel && selectedLabel === answerLabel) return true;
  }

  return false;
}