import {
	KD_DROP_CONFIGS
} from '../config/constants';
import type { BattlefieldDropDefinitionId, BattlefieldDropKind } from '../core/types';

export interface BattlefieldDropDefinition {
	id: BattlefieldDropDefinitionId;
	kind: BattlefieldDropKind;
	title: string;
	shortLabel: string;
	arenaGlyph: string;
	pickupDetail: string;
	rollWeight: number;
}

const DROP_DEFINITIONS: Record<BattlefieldDropDefinitionId, BattlefieldDropDefinition> = KD_DROP_CONFIGS;

const DROP_KIND_TO_ID: Record<BattlefieldDropKind, BattlefieldDropDefinitionId> = {
	weapon: 'drop_weapon_supply',
	xp: 'drop_xp_crystal',
	heal: 'drop_heal_pack',
	speed: 'drop_speed_tonic',
	attackSpeed: 'drop_attack_manual',
	damage: 'drop_damage_core',
	shield: 'drop_guard_shield',
	reroll: 'drop_reroll_coupon'
};

export function getBattlefieldDropDefinitionById(
	id: BattlefieldDropDefinitionId
): BattlefieldDropDefinition {
	return DROP_DEFINITIONS[id];
}

export function listBattlefieldDropDefinitions(): BattlefieldDropDefinition[] {
	return Object.values(DROP_DEFINITIONS);
}

export function getBattlefieldDropDefinitionIdByKind(
	kind: BattlefieldDropKind
): BattlefieldDropDefinitionId {
	return DROP_KIND_TO_ID[kind];
}
