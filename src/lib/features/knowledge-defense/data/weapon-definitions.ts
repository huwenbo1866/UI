import type { AttackPattern, AttackPreference, WeaponDefinitionId } from '../core/types';

export interface WeaponDefinition {
	id: WeaponDefinitionId;
	attackPattern: AttackPattern;
	attackPreference: AttackPreference;
	title: string;
	isTemporaryBuff: boolean;
}

const WEAPON_DEFINITIONS: Record<WeaponDefinitionId, WeaponDefinition> = {
	weapon_main_straight: {
		id: 'weapon_main_straight',
		attackPattern: 'single',
		attackPreference: 'straight',
		title: '直射主武器',
		isTemporaryBuff: false
	},
	weapon_main_scatter: {
		id: 'weapon_main_scatter',
		attackPattern: 'scatter',
		attackPreference: 'scatter',
		title: '散射主武器',
		isTemporaryBuff: false
	},
	weapon_buff_straight4: {
		id: 'weapon_buff_straight4',
		attackPattern: 'straight4',
		attackPreference: 'straight',
		title: '4 连发直射',
		isTemporaryBuff: true
	},
	weapon_buff_scatter7: {
		id: 'weapon_buff_scatter7',
		attackPattern: 'scatter7',
		attackPreference: 'scatter',
		title: '7 发散射',
		isTemporaryBuff: true
	},
	weapon_main_missile: {
		id: 'weapon_main_missile',
		attackPattern: 'missileBurst',
		attackPreference: 'straight',
		title: '导弹发射器',
		isTemporaryBuff: false
	},
	weapon_main_laser: {
		id: 'weapon_main_laser',
		attackPattern: 'laserLine',
		attackPreference: 'straight',
		title: '激光教鞭',
		isTemporaryBuff: false
	},
	weapon_main_karate: {
		id: 'weapon_main_karate',
		attackPattern: 'karateStrike',
		attackPreference: 'straight',
		title: '空手道',
		isTemporaryBuff: false
	}
};

export function getWeaponDefinition(id: WeaponDefinitionId): WeaponDefinition {
	return WEAPON_DEFINITIONS[id];
}

export function getMainWeaponDefinitionIdForPreference(
	attackPreference: AttackPreference
): WeaponDefinitionId {
	return attackPreference === 'straight' ? 'weapon_main_straight' : 'weapon_main_scatter';
}

export function getQueuedWeaponBuffDefinitionIdForPreference(
	attackPreference: AttackPreference
): WeaponDefinitionId {
	return attackPreference === 'straight' ? 'weapon_buff_straight4' : 'weapon_buff_scatter7';
}

export function getAttackPatternForWeaponDefinition(id: WeaponDefinitionId): AttackPattern {
	return getWeaponDefinition(id).attackPattern;
}

export function getWeaponDefinitionIdForAttackPattern(
	pattern: AttackPattern,
	fallbackPreference: AttackPreference = 'straight'
): WeaponDefinitionId {
	if (pattern === 'single') {
		return getMainWeaponDefinitionIdForPreference('straight');
	}

	if (pattern === 'scatter') {
		return getMainWeaponDefinitionIdForPreference('scatter');
	}

	if (pattern === 'straight4') {
		return getQueuedWeaponBuffDefinitionIdForPreference('straight');
	}

	if (pattern === 'scatter7') {
		return getQueuedWeaponBuffDefinitionIdForPreference('scatter');
	}

	if (pattern === 'missileBurst') {
		return 'weapon_main_missile';
	}

	if (pattern === 'laserLine') {
		return 'weapon_main_laser';
	}

	if (pattern === 'karateStrike') {
		return 'weapon_main_karate';
	}

	return getMainWeaponDefinitionIdForPreference(fallbackPreference);
}
