import {
	wrongQuestions,
	refreshWrongQuestions,
	recordWrongQuestionEntry,
	markWrongQuestionCorrectEntry,
	clearWrongQuestionEntries
} from '$lib/stores/knowledge-defense'; // ← Store 和函数从 stores 导入

import type { WrongQuestionRecord } from '$lib/apis/knowledge-defense'; // ← 类型从 apis 导入

import type { PackSourceContext, Question } from '../core/types';
import {
	ENABLE_AI_WRONG_QUESTION_ANALYSIS,
	AI_BASE_URL,
	AI_API_KEY,
	AI_MODEL,
	AI_ANALYSIS_PROMPT
} from '../config/constants';

// 缓存机制：防止错题实时增加导致反复调用API
let lastAnalysisHash = '';
let cachedStats: any = null;

const SOURCE_TYPE = 'pack' as const;

export const wrongNotebookStore = wrongQuestions;

export async function loadWrongNotebook(sourceId: string) {
	return refreshWrongQuestions({ source_type: SOURCE_TYPE, source_id: sourceId, limit: 200 });
}

export async function clearWrongNotebook(sourceId: string) {
	return clearWrongQuestionEntries(SOURCE_TYPE, sourceId);
}

export async function recordWrongNotebookEntry(
	sourceId: string,
	question: Question,
	answer: string,
	sourceContext?: PackSourceContext
) {
	return recordWrongQuestionEntry({
		source_type: SOURCE_TYPE,
		source_id: sourceId,
		file_id: sourceContext?.file_id,
		chapter: sourceContext?.chapter,
		question_id: question.id,
		question: question.prompt,
		options: question.options,
		correct_answer: question.answer,
		explanation: question.explanation,
		last_user_answer: answer
	});
}

export async function markWrongNotebookCorrect(
	sourceId: string,
	questionId: string,
	sourceContext?: PackSourceContext,
	questionText?: string
) {
	return markWrongQuestionCorrectEntry({
		source_type: SOURCE_TYPE,
		source_id: sourceId,
		question_id: questionId,
		mastery_threshold: 2,
		file_id: sourceContext?.file_id,
		chapter: sourceContext?.chapter,
		question: questionText ?? null
	});
}

// ==================== AI 驱动的错题分析（使用自定义 Base URL + Key） ====================
export async function buildWrongNotebookStats(items: WrongQuestionRecord[]) {
	if (items.length === 0) {
		return {
			total: 0,
			repeated: 0,
			typeEntries: [],
			advice: ['当前还没有错题记录，先完成几次升级答题再回来查看吧。']
		};
	}

	// 1. 本地计算基础统计（总数、反复错题）
	const total = items.length;
	const repeated = items.filter((item) => item.wrong_count >= 2).length;

	// 2. 生成哈希用于缓存
	const currentHash = JSON.stringify(
		items.map((i) => ({
			id: i.id,
			wrong_count: i.wrong_count,
			question: i.question
		}))
	);

	if (currentHash === lastAnalysisHash && cachedStats) {
		return { ...cachedStats, total, repeated };
	}

	lastAnalysisHash = currentHash;

	if (!ENABLE_AI_WRONG_QUESTION_ANALYSIS) {
		return buildFallbackStats(items, total, repeated);
	}

	try {
		// 结构化数据给AI（清晰、规范）
		const questionsText = items
			.map(
				(item) =>
					`题目: ${item.question}\n你选的答案: ${item.last_user_answer}\n正确答案: ${item.correct_answer}\n解析: ${item.explanation}\n错题次数: ${item.wrong_count}`
			)
			.join('\n\n');

		const prompt = AI_ANALYSIS_PROMPT.replace('{questions}', questionsText);

		const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${AI_API_KEY}`
			},
			body: JSON.stringify({
				model: AI_MODEL,
				messages: [{ role: 'user', content: prompt }],
				temperature: 0.3,
				max_tokens: 600
			})
		});

		if (!res.ok) throw new Error(`API 请求失败: ${res.status}`);

		const data = await res.json();
		const content = data.choices[0].message.content.trim();

		const parsed = JSON.parse(content);

		cachedStats = {
			typeEntries: parsed.typeEntries || [],
			advice: parsed.advice || []
		};

		return {
			total,
			repeated,
			typeEntries: cachedStats.typeEntries,
			advice: cachedStats.advice
		};
	} catch (err) {
		console.warn('AI分析失败，回退到本地逻辑', err);
		return buildFallbackStats(items, total, repeated);
	}
}

// 本地降级逻辑（AI关闭或失败时的保底）
function buildFallbackStats(items: WrongQuestionRecord[], total: number, repeated: number) {
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

	const advice: string[] = [
		`建议优先复习「${typeEntries[0]?.[0] || '综合理解'}」相关题目，先把高频失分点补稳。`,
		repeated > 0 ? `当前有 ${repeated} 道题已经反复出错，建议先遮住答案自测一遍。` : '',
		'复习时先自己回忆答案，再对照解析，会比直接看答案更有效。'
	].filter(Boolean);

	return { total, repeated, typeEntries, advice };
}
