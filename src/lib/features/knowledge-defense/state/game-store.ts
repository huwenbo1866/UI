import {
	AUTO_ATTACK_COOLDOWN_MS,
	DEFAULT_REWARD_REROLLS,
	DEFAULT_ATTACK_PREFERENCE,
	MONSTER_SPAWN_INTERVAL_MS,
	PLAYER_MAX_HP,
	PLAYER_RADIUS,
	PLAYER_SPEED,
	TIME_SCALE_NORMAL,
	getTotalExpRequiredForLevel
} from '../config/constants';
import { PULSE_SKILL_DEFINITION_ID } from '../data/skill-definitions';
import { getMainWeaponDefinitionIdForPreference } from '../data/weapon-definitions';
import type { AttackPreference, GameState, QuestionPack, RunTelemetryState } from '../core/types';

function createInitialRunTelemetry(): RunTelemetryState {
	return {
		elapsedMs: 0,
		totalDamageTaken: 0,
		damageBySource: {
			melee: { hits: 0, damage: 0 },
			dash: { hits: 0, damage: 0 },
			projectile: { hits: 0, damage: 0 }
		},
		lastDamageSource: null,
		defeatSource: null
	};
}

export function createInitialGameState(
	pack: QuestionPack,
	width = 1200,
	height = 820,
	attackPreference: AttackPreference = DEFAULT_ATTACK_PREFERENCE
): GameState {
	return {
		width,
		height,
		pack,
		settings: {
			attackPreference
		},
		loadout: {
			mainWeaponId: getMainWeaponDefinitionIdForPreference(attackPreference),
			actionSlots: {
				H: PULSE_SKILL_DEFINITION_ID,
				J: null,
				K: null,
				L: null
			}
		},
		player: {
			x: width / 2,
			y: height / 2,
			radius: PLAYER_RADIUS,
			speed: PLAYER_SPEED,
			hp: PLAYER_MAX_HP,
			maxHp: PLAYER_MAX_HP,
			contactInvulnMs: 0,
			hurtFlashMs: 0,
			moving: false,
			moveDirX: 0,
			moveDirY: 1
		},
		monsters: [],
		battlefieldDrops: [],
		projectiles: [],
		lasers: [],
		damageTexts: [],
		attackSequences: [],
		battle: {
			kills: 0,
			correct: 0,
			wrong: 0,
			qaRound: 0
		},
		buffs: {
			queuedWeaponBuff: null,
			queuedWeaponBuffWeaponId: null,
			queuedWeaponBuffUses: 0,
			expBoostUntil: 0,
			pulseOverchargeStacks: 0,
			moveSpeedBoostUntil: 0,
			moveSpeedBoostMultiplier: 1,
			attackSpeedBoostUntil: 0,
			attackSpeedBoostMultiplier: 1,
			damageBoostUntil: 0,
			damageBoostMultiplier: 1,
			shieldBlockCharges: 0,
			damageMitigation: null
		},
		build: {
			skillLevels: {
				skill_pulse: 1,
				skill_dash: 0,
				skill_karate: 0
			},
			weaponLevels: {
				weapon_main_straight: 1,
				weapon_main_scatter: 1,
				weapon_buff_straight4: 0,
				weapon_buff_scatter7: 0,
				weapon_main_missile: 0,
				weapon_main_laser: 0,
				weapon_main_karate: 0
			},
			mods: {
				straightBurstExtra: 0,
				straightTrajectories: 0,
				straightFreezeChance: 0,
				straightFreezeSlowMultiplier: 0.6,
				straightFreezeMs: 1600,
				straightPierce: 0,

				scatterExtraPellets: 0,
				scatterBleedDps: 0,
				scatterBleedMs: 0,
				scatterCloseKnockbackChance: 0,
				scatterCloseKnockback: 42,

				missileExplosionRadiusBonus: 0,
				missileBurningMs: 0,
				missileBurningDps: 0,

				laserRangeMultiplier: 1,
				laserWidthMultiplier: 1
			}
		},
		progress: {
			level: 1,
			exp: 0,
			nextLevelTotalExp: getTotalExpRequiredForLevel(2),
			pendingLevelUps: 0
		},
		ui: {
			showStartMenu: true,
			showRewardPanel: false,
			showPrepPanel: false,
			showSettingsPanel: false,
			rewardChoices: [],
			recentRewardDefinitionIds: [],
			recentQuestionIds: [],
			rewardRerollCount: 0,
			rewardRerollsRemaining: DEFAULT_REWARD_REROLLS,
			rewardFeedback: null,
			rewardFeedbackKind: null,
			pickupFeedback: null
		},
		runtime: {
			running: false,
			timeScale: TIME_SCALE_NORMAL,
			spawnCooldownMs: MONSTER_SPAWN_INTERVAL_MS,
			attackCooldownMs: AUTO_ATTACK_COOLDOWN_MS,
			actionCooldownMs: {
				H: 0,
				J: 0,
				K: 0,
				L: 0
			},
			abilityPulseFxMs: 0,
			abilityDashFxMs: 0,
			abilityKarateFxMs: 0,
			dashRemainingMs: 0,
			dashDirectionX: 0,
			dashDirectionY: 1,
			dashSpeed: 0,
			karateDirectionX: 0,
			karateDirectionY: 1
		},
	runTelemetry: createInitialRunTelemetry(),
		drones: []
	};
}
