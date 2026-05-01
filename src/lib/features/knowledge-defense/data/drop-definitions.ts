import {
	ATTACK_SPEED_DROP_DURATION_MS,
	DAMAGE_BOOST_DROP_DURATION_MS,
	BATTLEFIELD_DROP_EXP_BOOST_DURATION_MS,
	BATTLEFIELD_DROP_HEAL_AMOUNT,
	MOVE_SPEED_DROP_DURATION_MS,
	BATTLEFIELD_DROP_WEAPON_USES
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

const DROP_DEFINITIONS: Record<BattlefieldDropDefinitionId, BattlefieldDropDefinition> = {
	drop_weapon_supply: {
		id: 'drop_weapon_supply',
		kind: 'weapon',
		title: '武备补给',
		shortLabel: '武器',
		arenaGlyph: '✦',
		pickupDetail: `下 ${BATTLEFIELD_DROP_WEAPON_USES} 次攻击强化`,
		rollWeight: 1
	},
	drop_xp_crystal: {
		id: 'drop_xp_crystal',
		kind: 'xp',
		title: '经验结晶',
		shortLabel: '经验',
		arenaGlyph: '◎',
		pickupDetail: `${Math.round(BATTLEFIELD_DROP_EXP_BOOST_DURATION_MS / 1000)} 秒经验增幅`,
		rollWeight: 1
	},
	drop_heal_pack: {
		id: 'drop_heal_pack',
		kind: 'heal',
		title: '急救包',
		shortLabel: '治疗',
		arenaGlyph: '+',
		pickupDetail: `恢复 ${BATTLEFIELD_DROP_HEAL_AMOUNT} 点生命`,
		rollWeight: 1
	},
	drop_speed_tonic: {
		id: 'drop_speed_tonic',
		kind: 'speed',
		title: '疾行补剂',
		shortLabel: '移速',
		arenaGlyph: '»',
		pickupDetail: `${Math.round(MOVE_SPEED_DROP_DURATION_MS / 1000)} 秒移速提升`,
		rollWeight: 0.85
	},
	drop_attack_manual: {
		id: 'drop_attack_manual',
		kind: 'attackSpeed',
		title: '速射手册',
		shortLabel: '攻速',
		arenaGlyph: '≋',
		pickupDetail: `${Math.round(ATTACK_SPEED_DROP_DURATION_MS / 1000)} 秒攻击提速`,
		rollWeight: 0.82
	},
	drop_damage_core: {
		id: 'drop_damage_core',
		kind: 'damage',
		title: '火力核心',
		shortLabel: '伤害',
		arenaGlyph: '✹',
		pickupDetail: `${Math.round(DAMAGE_BOOST_DROP_DURATION_MS / 1000)} 秒伤害提高`,
		rollWeight: 0.78
	},
	drop_guard_shield: {
		id: 'drop_guard_shield',
		kind: 'shield',
		title: '格挡护盾',
		shortLabel: '护盾',
		arenaGlyph: '◈',
		pickupDetail: '抵挡下一次受到的伤害',
		rollWeight: 0.72
	},
	drop_reroll_coupon: {
		id: 'drop_reroll_coupon',
		kind: 'reroll',
		title: '重随机会',
		shortLabel: '改签',
		arenaGlyph: '↺',
		pickupDetail: '本局奖励面板重随机会 +1',
		rollWeight: 0.64
	}
};

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
