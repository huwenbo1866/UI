import { KD_WEAPON_CONFIGS } from '../config/constants';
import type { AttackPattern, AttackPreference, WeaponDefinitionId } from '../core/types';

export interface WeaponDefinition {
	id: WeaponDefinitionId;
	attackPattern: AttackPattern;
	attackPreference: AttackPreference;
	title: string;
	isTemporaryBuff: boolean;
}

const WEAPON_DEFINITIONS: Record<WeaponDefinitionId, WeaponDefinition> = KD_WEAPON_CONFIGS;

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
