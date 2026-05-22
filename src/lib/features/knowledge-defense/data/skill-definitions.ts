import { KD_SKILL_CONFIGS } from '../config/constants';
import type { RewardDefinitionId, SkillDefinitionId } from '../core/types';

export interface SkillDefinition {
	id: SkillDefinitionId;
	kind: 'pulse' | 'dash' | 'karate';
	title: string;
	slotLabel: string;
	hint: string;
	maxLevel: number;
	rewardDefinitionId: RewardDefinitionId;
	rewardOfferWeight: number;
	rewardOfferIconGlyph: string;
	rewardOfferPriority: { new: number; upgrade: number };
}

export const PULSE_SKILL_DEFINITION_ID: SkillDefinitionId = 'skill_pulse';

const SKILL_DEFINITIONS: Record<SkillDefinitionId, SkillDefinition> = KD_SKILL_CONFIGS;

export function getSkillDefinition(id: SkillDefinitionId): SkillDefinition {
	return SKILL_DEFINITIONS[id];
}
