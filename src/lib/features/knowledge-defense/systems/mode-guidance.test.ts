import { describe, expect, it } from 'vitest';

import {
	deriveContentSourceSummary,
	deriveInRunGuidance,
	derivePreRunBriefing,
	getAttackPreferenceLabel
} from './mode-guidance';

describe('mode-guidance', () => {
	it('derives explicit fallback source messaging before a knowledge chapter is locked in', () => {
		const sourceSummary = deriveContentSourceSummary({
			usingSampleFallback: true,
			selectedKnowledgeId: 'kb-1',
			selectedFileId: 'file-1',
			selectedHomeworkId: ''
		});

		expect(sourceSummary.label).toContain('Fallback');
		expect(sourceSummary.detail).toContain('备用样例题源');
		expect(sourceSummary.isFallback).toBe(true);
	});

	it('derives chapter-backed source messaging and pre-run briefing details', () => {
		const sourceSummary = deriveContentSourceSummary({
			usingSampleFallback: false,
			chapterTitle: '细胞结构'
		});
		const briefing = derivePreRunBriefing({
			attackPreference: 'scatter',
			sourceSummary
		});

		expect(getAttackPreferenceLabel('scatter')).toBe('散射');
		expect(briefing.attackPreference).toBe('散射');
		expect(briefing.rewardTiming).toContain('奖励不会自动弹出');
		expect(briefing.rewardTiming).toContain('属性加成');
		expect(briefing.controls[2]).toContain('H / J / K / L');
		expect(briefing.controls[2]).toContain('R');
		expect(briefing.reviewValue).toContain('错题集');
		expect(briefing.contentSource).toContain('细胞结构');
		expect(briefing.contentSourceDetail).toContain('知识库章节作业');
	});

	it('derives contextual in-run guidance for urgent and onboarding-relevant states', () => {
		const guidance = deriveInRunGuidance({
			kills: 0,
			level: 1,
			pendingRewards: 2,
			pulseCooldownMs: 0,
			shieldBlockCharges: 1,
			activeBuffLabels: ['攻击提速'],
			hp: 42,
			maxHp: 200,
			usingSampleFallback: true
		});

		expect(guidance.map((item) => item.id)).toEqual([
			'low-hp',
			'pending-reward',
			'active-buffs',
			'ability-ready',
			'sample-fallback',
			'early-run'
		]);
		expect(guidance[0]?.detail).toContain('治疗掉落');
		expect(guidance[1]?.detail).toContain('空格或点击角色');
		expect(guidance[2]?.detail).toContain('格挡护盾');
		expect(guidance[3]?.detail).toContain('按 H');
		expect(guidance[4]?.title).toContain('fallback');
		expect(guidance[5]?.detail).toContain('第一只怪');
	});
});
