import {
	ATTACK_SPEED_REWARD_DURATION_MS,
	ATTACK_SPEED_REWARD_MULTIPLIER,
	DAMAGE_BOOST_REWARD_DURATION_MS,
	DAMAGE_BOOST_REWARD_MULTIPLIER,
	BATTLEFIELD_DROP_HEAL_AMOUNT,
	EXP_BOOST_DURATION_MS,
	EXP_BOOST_MULTIPLIER,
	EXP_PER_KILL,
	KD_ABILITY_TUNING,
	KD_DRONE_TUNING,
	KD_WEAPON_TUNING,
	MISSILE_BURST_INTERVAL_MS,
	MOVE_SPEED_REWARD_DURATION_MS,
	MOVE_SPEED_REWARD_MULTIPLIER,
	SHIELD_BLOCK_MAX_CHARGES,
	WEAPON_REWARD_USES,
	getTotalExpRequiredForLevel
} from '../config/constants';
import {
	getAttackPatternForWeaponDefinition,
	getQueuedWeaponBuffDefinitionIdForPreference
} from '../data/weapon-definitions';
import { getSkillDefinition } from '../data/skill-definitions';
import { uid } from '../core/utils';
import type {
	ActionSlotKey,
	GameState,
	RewardDefinitionId,
	SkillDefinitionId,
	WeaponDefinitionId
} from '../core/types';
import { resetRewardPanelState } from './reward-system';
import { addDrone } from './drone-system';

export function gainExpForKill(state: GameState) {
	const now = Date.now();
	const multiplier = now < state.buffs.expBoostUntil ? EXP_BOOST_MULTIPLIER : 1;
	state.progress.exp += Math.round(EXP_PER_KILL * multiplier);
	checkLevelUps(state);
}

export function getTimedBuffRemainingMs(until: number, now = Date.now()) {
	return Math.max(0, until - now);
}

export function hasTimedBuff(until: number, now = Date.now()) {
	return getTimedBuffRemainingMs(until, now) > 0;
}

export function resolveMoveSpeedMultiplier(state: GameState, now = Date.now()) {
	const timedMultiplier = hasTimedBuff(state.buffs.moveSpeedBoostUntil, now)
		? state.buffs.moveSpeedBoostMultiplier
		: 1;
	return state.buffs.permanentMoveSpeedMultiplier * timedMultiplier;
}

export function resolveAttackSpeedMultiplier(state: GameState, now = Date.now()) {
	const timedMultiplier = hasTimedBuff(state.buffs.attackSpeedBoostUntil, now)
		? state.buffs.attackSpeedBoostMultiplier
		: 1;
	return state.buffs.permanentAttackSpeedMultiplier * timedMultiplier;
}

export function resolveDamageMultiplier(state: GameState, now = Date.now()) {
	const timedMultiplier = hasTimedBuff(state.buffs.damageBoostUntil, now)
		? state.buffs.damageBoostMultiplier
		: 1;
	return state.buffs.permanentDamageMultiplier * timedMultiplier;
}

export function scalePlayerDamage(state: GameState, baseDamage: number, now = Date.now()) {
	return Math.max(1, Math.round(baseDamage * resolveDamageMultiplier(state, now)));
}

export function checkLevelUps(state: GameState) {
	while (state.progress.exp >= state.progress.nextLevelTotalExp) {
		state.progress.level += 1;
		state.progress.pendingLevelUps += 1;
		state.progress.nextLevelTotalExp = getTotalExpRequiredForLevel(state.progress.level + 1);
	}
}

export function grantQueuedWeaponBuff(state: GameState, uses = WEAPON_REWARD_USES) {
	grantQueuedWeaponBuffByDefinitionId(
		state,
		getQueuedWeaponBuffDefinitionIdForPreference(state.settings.attackPreference),
		uses
	);
}

function queueMainWeaponUpgrade(state: GameState, weaponDefinitionId: WeaponDefinitionId) {
	if (weaponDefinitionId === 'weapon_main_straight') {
		grantQueuedWeaponBuffByDefinitionId(state, 'weapon_buff_straight4');
		return;
	}

	if (weaponDefinitionId === 'weapon_main_scatter') {
		grantQueuedWeaponBuffByDefinitionId(state, 'weapon_buff_scatter7');
		return;
	}

	if (weaponDefinitionId === 'weapon_main_laser') {
		state.build.mods.laserRangeMultiplier =
			(state.build.mods.laserRangeMultiplier || 1) * KD_WEAPON_TUNING.laser.upgradePermanentRangeMultiplier;
		state.build.mods.laserWidthMultiplier *= KD_WEAPON_TUNING.laser.upgradePermanentWidthMultiplier;
		return;
	}

	if (weaponDefinitionId === 'weapon_main_missile') {
		state.attackSequences.push({
			id: uid('seq'),
			weaponDefinitionId: 'weapon_main_missile',
			pattern: 'missileBurst',
			shotsRemaining: KD_WEAPON_TUNING.missile.upgradeVolleyShots,
			shotIntervalMs: MISSILE_BURST_INTERVAL_MS,
			timeUntilNextMs: 0
		});
		return;
	}

	if (weaponDefinitionId === 'weapon_main_karate') {
		state.build.mods.karateRangeMultiplier =
			(state.build.mods.karateRangeMultiplier || 1) * KD_ABILITY_TUNING.karate.upgradePermanentRangeMultiplier;
	}
}

export function grantQueuedWeaponBuffByDefinitionId(
	state: GameState,
	weaponDefinitionId: WeaponDefinitionId,
	uses = WEAPON_REWARD_USES
) {
	state.buffs.queuedWeaponBuffWeaponId = weaponDefinitionId;
	state.buffs.queuedWeaponBuff = getAttackPatternForWeaponDefinition(weaponDefinitionId);
	state.buffs.queuedWeaponBuffUses = uses;
}

export function grantExpBoost(
	state: GameState,
	durationMs = EXP_BOOST_DURATION_MS,
	now = Date.now()
) {
	state.buffs.expBoostUntil = Math.max(state.buffs.expBoostUntil, now) + durationMs;
}

function grantTimedStatBuff(
	state: GameState,
	field: 'moveSpeedBoostUntil' | 'attackSpeedBoostUntil' | 'damageBoostUntil',
	multiplierField: 'moveSpeedBoostMultiplier' | 'attackSpeedBoostMultiplier' | 'damageBoostMultiplier',
	durationMs: number,
	multiplier: number,
	now = Date.now()
) {
	state.buffs[multiplierField] = Math.max(1, state.buffs[multiplierField], multiplier);
	state.buffs[field] = Math.max(state.buffs[field], now) + durationMs;
}

function grantPermanentStatBuff(
	state: GameState,
	field:
		| 'permanentMoveSpeedMultiplier'
		| 'permanentAttackSpeedMultiplier'
		| 'permanentDamageMultiplier',
	multiplier: number
) {
	const increment = Math.max(0, multiplier - 1);
	state.buffs[field] = Number((state.buffs[field] + increment).toFixed(4));
}

export function grantMoveSpeedBoost(
	state: GameState,
	durationMs = MOVE_SPEED_REWARD_DURATION_MS,
	multiplier = MOVE_SPEED_REWARD_MULTIPLIER,
	now = Date.now()
) {
	grantTimedStatBuff(state, 'moveSpeedBoostUntil', 'moveSpeedBoostMultiplier', durationMs, multiplier, now);
}

export function grantAttackSpeedBoost(
	state: GameState,
	durationMs = ATTACK_SPEED_REWARD_DURATION_MS,
	multiplier = ATTACK_SPEED_REWARD_MULTIPLIER,
	now = Date.now()
) {
	grantTimedStatBuff(
		state,
		'attackSpeedBoostUntil',
		'attackSpeedBoostMultiplier',
		durationMs,
		multiplier,
		now
	);
}

export function grantDamageBoost(
	state: GameState,
	durationMs = DAMAGE_BOOST_REWARD_DURATION_MS,
	multiplier = DAMAGE_BOOST_REWARD_MULTIPLIER,
	now = Date.now()
) {
	grantTimedStatBuff(state, 'damageBoostUntil', 'damageBoostMultiplier', durationMs, multiplier, now);
}

export function grantPermanentMoveSpeedBoost(
	state: GameState,
	multiplier = MOVE_SPEED_REWARD_MULTIPLIER
) {
	grantPermanentStatBuff(state, 'permanentMoveSpeedMultiplier', multiplier);
}

export function grantPermanentAttackSpeedBoost(
	state: GameState,
	multiplier = ATTACK_SPEED_REWARD_MULTIPLIER
) {
	grantPermanentStatBuff(state, 'permanentAttackSpeedMultiplier', multiplier);
}

export function grantPermanentDamageBoost(
	state: GameState,
	multiplier = DAMAGE_BOOST_REWARD_MULTIPLIER
) {
	grantPermanentStatBuff(state, 'permanentDamageMultiplier', multiplier);
}

export function grantShieldBlock(state: GameState, charges = 1) {
	state.buffs.shieldBlockCharges = Math.min(
		SHIELD_BLOCK_MAX_CHARGES,
		state.buffs.shieldBlockCharges + charges
	);
}

export function consumeShieldBlock(state: GameState) {
	if (state.buffs.shieldBlockCharges <= 0) {
		return false;
	}

	state.buffs.shieldBlockCharges -= 1;
	return true;
}

export function restorePlayerHealth(state: GameState, amount = BATTLEFIELD_DROP_HEAL_AMOUNT) {
	state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
}

export function equipMainWeapon(state: GameState, weaponDefinitionId: WeaponDefinitionId) {
	state.loadout.mainWeaponId = weaponDefinitionId;
	state.build.weaponLevels[weaponDefinitionId] = Math.max(1, state.build.weaponLevels[weaponDefinitionId] ?? 0);
	state.buffs.queuedWeaponBuff = null;
	state.buffs.queuedWeaponBuffWeaponId = null;
	state.buffs.queuedWeaponBuffUses = 0;
}

function listActionSlotKeys(): ActionSlotKey[] {
	return ['H', 'J', 'K', 'L'];
}

function findActionSlotForSkill(state: GameState, skillDefinitionId: SkillDefinitionId): ActionSlotKey | null {
	for (const key of listActionSlotKeys()) {
		if (state.loadout.actionSlots[key] === skillDefinitionId) {
			return key;
		}
	}
	return null;
}

function findFirstEmptyActionSlot(state: GameState): ActionSlotKey | null {
	for (const key of listActionSlotKeys()) {
		if (state.loadout.actionSlots[key] === null) {
			return key;
		}
	}
	return null;
}

export function acquireOrUpgradeSkill(state: GameState, skillDefinitionId: SkillDefinitionId) {
	const definition = getSkillDefinition(skillDefinitionId);
	const currentLevel = state.build.skillLevels[skillDefinitionId] ?? 0;
	const nextLevel = Math.min(definition.maxLevel, Math.max(currentLevel, 0) + 1);
	if (nextLevel === currentLevel) {
		return;
	}

	const wasOwned = currentLevel > 0;
	state.build.skillLevels[skillDefinitionId] = nextLevel;

	if (!wasOwned) {
		const slot = findFirstEmptyActionSlot(state);
		if (slot) {
			state.loadout.actionSlots[slot] = skillDefinitionId;
			state.runtime.actionCooldownMs[slot] = 0;
		}
		return;
	}

	const equippedSlot = findActionSlotForSkill(state, skillDefinitionId);
	if (equippedSlot) {
		state.runtime.actionCooldownMs[equippedSlot] = 0;
	}
}

export function applyRewardByDefinitionId(state: GameState, rewardDefinitionId: RewardDefinitionId) {
	switch (rewardDefinitionId) {
		case 'reward_weapon_upgrade':
			queueMainWeaponUpgrade(state, state.loadout.mainWeaponId);
			break;
		case 'reward_weapon_upgrade_straight':
			queueMainWeaponUpgrade(state, 'weapon_main_straight');
			break;
		case 'reward_weapon_upgrade_scatter':
			queueMainWeaponUpgrade(state, 'weapon_main_scatter');
			break;
		case 'reward_weapon_upgrade_laser':
			queueMainWeaponUpgrade(state, 'weapon_main_laser');
			break;
		case 'reward_weapon_upgrade_missile':
			queueMainWeaponUpgrade(state, 'weapon_main_missile');
			break;
		case 'reward_weapon_upgrade_karate':
			queueMainWeaponUpgrade(state, 'weapon_main_karate');
			break;
		case 'reward_weapon_missile':
			equipMainWeapon(state, 'weapon_main_missile');
			break;
		case 'reward_weapon_laser':
			equipMainWeapon(state, 'weapon_main_laser');
			break;
		case 'reward_upgrade_straight_burst':
			state.build.mods.straightBurstExtra = Math.min(
				KD_WEAPON_TUNING.straight.upgradeMaxBurstExtra,
				state.build.mods.straightBurstExtra + 1
			);
			break;
		case 'reward_upgrade_straight_trajectory':
			state.build.mods.straightTrajectories = Math.min(
				KD_WEAPON_TUNING.straight.upgradeMaxTrajectories,
				state.build.mods.straightTrajectories + 1
			);
			break;
		case 'reward_upgrade_straight_freeze':
			state.build.mods.straightFreezeChance = Math.max(
				state.build.mods.straightFreezeChance,
				KD_WEAPON_TUNING.straight.freezeChance
			);
			break;
		case 'reward_upgrade_straight_pierce':
			state.build.mods.straightPierce = Math.min(
				KD_WEAPON_TUNING.straight.pierceMax,
				state.build.mods.straightPierce + 1
			);
			break;
		case 'reward_upgrade_scatter_pellets':
			state.build.mods.scatterExtraPellets = Math.min(
				KD_WEAPON_TUNING.scatter.upgradeMaxExtraPellets,
				state.build.mods.scatterExtraPellets + 1
			);
			break;
		case 'reward_upgrade_scatter_knockback':
			state.build.mods.scatterCloseKnockbackChance = Math.max(
				state.build.mods.scatterCloseKnockbackChance,
				KD_WEAPON_TUNING.scatter.knockbackChance
			);
			break;
		case 'reward_upgrade_scatter_bleed':
			state.build.mods.scatterBleedDamagePerTick = Math.max(
				state.build.mods.scatterBleedDamagePerTick,
				KD_WEAPON_TUNING.scatter.bleedDamagePerTick
			);
			state.build.mods.scatterBleedTickIntervalMs = Math.max(
				state.build.mods.scatterBleedTickIntervalMs,
				KD_WEAPON_TUNING.scatter.bleedTickIntervalMs
			);
			state.build.mods.scatterBleedMaxTicks = Math.max(
				state.build.mods.scatterBleedMaxTicks,
				KD_WEAPON_TUNING.scatter.bleedMaxTicks
			);
			break;
		case 'reward_upgrade_missile_radius':
			state.build.mods.missileExplosionRadiusBonus = Math.min(
				KD_WEAPON_TUNING.missile.upgradeRadiusCap,
				state.build.mods.missileExplosionRadiusBonus + KD_WEAPON_TUNING.missile.upgradeRadiusStep
			);
			break;
		case 'reward_upgrade_missile_burn':
			state.build.mods.missileBurningMs = Math.max(
				state.build.mods.missileBurningMs,
				KD_WEAPON_TUNING.missile.burningMs
			);
			state.build.mods.missileBurningDps = Math.max(
				state.build.mods.missileBurningDps,
				KD_WEAPON_TUNING.missile.burningDps
			);
			break;
		case 'reward_upgrade_laser_width':
			state.build.mods.laserWidthMultiplier = Math.min(
				KD_WEAPON_TUNING.laser.upgradeWidthCap,
				(state.build.mods.laserWidthMultiplier || 1) * KD_WEAPON_TUNING.laser.upgradeWidthStepMultiplier
			);
			break;
		case 'reward_xp_boost':
			grantExpBoost(state);
			break;
		case 'reward_skill_pulse':
			acquireOrUpgradeSkill(state, 'skill_pulse');
			break;
		case 'reward_skill_dash':
			acquireOrUpgradeSkill(state, 'skill_dash');
			break;
		case 'reward_skill_karate':
			acquireOrUpgradeSkill(state, 'skill_karate');
			break;
		case 'reward_buff_move_speed':
			grantPermanentMoveSpeedBoost(state);
			break;
		case 'reward_buff_attack_speed':
			grantPermanentAttackSpeedBoost(state);
			break;
		case 'reward_buff_damage':
			grantPermanentDamageBoost(state);
			break;
		case 'reward_buff_shield':
			grantShieldBlock(state);
			break;
		case 'reward_drone_acquire':
			addDrone(state);
			break;
		case 'reward_upgrade_drone_count':
			addDrone(state);
			break;
		case 'reward_upgrade_drone_attack_speed':
			state.drones.forEach((d) => {
				d.attackSpeedMultiplier = Math.min(
					KD_DRONE_TUNING.attackSpeedUpgradeCap,
					(d.attackSpeedMultiplier ?? 1) + KD_DRONE_TUNING.attackSpeedUpgradeStep
				);
			});
			break;
		case 'reward_upgrade_drone_move_speed':
			state.drones.forEach((d) => {
				d.moveSpeedMultiplier = Math.min(
					KD_DRONE_TUNING.moveSpeedUpgradeCap,
					(d.moveSpeedMultiplier ?? 1) + KD_DRONE_TUNING.moveSpeedUpgradeStep
				);
			});
			break;
		default:
			throw new Error(`Unknown reward definition: ${rewardDefinitionId}`);
	}

	resetRewardPanelState(state);
}
