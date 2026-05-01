import type { SkillDefinitionId } from '../core/types';

export interface SkillDefinition {
	id: SkillDefinitionId;
	kind: 'pulse' | 'dash' | 'karate';
	title: string;
	slotLabel: string;
	hint: string;
	maxLevel: number;
}

export const PULSE_SKILL_DEFINITION_ID: SkillDefinitionId = 'skill_pulse';

const SKILL_DEFINITIONS: Record<SkillDefinitionId, SkillDefinition> = {
	skill_pulse: {
		id: 'skill_pulse',
		kind: 'pulse',
		title: '脉冲',
		slotLabel: 'H',
		hint: '按 H 释放范围脉冲，适合解围与小回复',
		maxLevel: 3
	},
	skill_dash: {
		id: 'skill_dash',
		kind: 'dash',
		title: '冲刺',
		slotLabel: 'J',
		hint: '按 J 沿移动方向冲刺，穿行造成伤害',
		maxLevel: 3
	},
	skill_karate: {
		id: 'skill_karate',
		kind: 'karate',
		title: '空手道',
		slotLabel: 'K',
		hint: '按 K 近战下劈，能打掉飞行物并概率反弹',
		maxLevel: 4
	}
};

export function getSkillDefinition(id: SkillDefinitionId): SkillDefinition {
	return SKILL_DEFINITIONS[id];
}
