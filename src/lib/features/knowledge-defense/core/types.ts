export type Difficulty = 'easy' | 'medium' | 'hard';
export type AttackPattern =
	| 'single'
	| 'scatter'
	| 'straight4'
	| 'scatter7'
	| 'missileBurst'
	| 'laserLine'
	| 'karateStrike';
export type RewardKind = 'weapon' | 'xp' | 'skill' | 'buff' | 'drone';
export type AttackPreference = 'straight' | 'scatter';
export type ActionSlotKey = 'H' | 'J' | 'K' | 'L';
export type MonsterAttackState = 'idle' | 'telegraph' | 'active' | 'recovery';
export type MonsterSkillKind = 'melee' | 'dash' | 'throw';
export type BattlefieldDropKind =
	| 'weapon'
	| 'xp'
	| 'heal'
	| 'speed'
	| 'attackSpeed'
	| 'damage'
	| 'shield'
	| 'reroll';
export type PlayerDamageSource = 'melee' | 'dash' | 'projectile';
export type WeaponDefinitionId =
	| 'weapon_main_straight'
	| 'weapon_main_scatter'
	| 'weapon_buff_straight4'
	| 'weapon_buff_scatter7'
	| 'weapon_main_missile'
	| 'weapon_main_laser'
	| 'weapon_main_karate';
export type SkillDefinitionId = 'skill_pulse' | 'skill_dash' | 'skill_karate';
export type RewardDefinitionId =
	| 'reward_weapon_upgrade'
	| 'reward_xp_boost'
	| 'reward_weapon_missile'
	| 'reward_weapon_laser'
	| 'reward_upgrade_straight_burst'
	| 'reward_upgrade_straight_trajectory'
	| 'reward_upgrade_straight_freeze'
	| 'reward_upgrade_straight_pierce'
	| 'reward_upgrade_scatter_pellets'
	| 'reward_upgrade_scatter_knockback'
	| 'reward_upgrade_scatter_bleed'
	| 'reward_upgrade_missile_radius'
	| 'reward_upgrade_missile_burn'
	| 'reward_upgrade_laser_width'
	| 'reward_skill_pulse'
	| 'reward_skill_dash'
	| 'reward_skill_karate'
	| 'reward_buff_move_speed'
	| 'reward_buff_attack_speed'
	| 'reward_buff_damage'
	| 'reward_buff_shield'
	| 'reward_drone_acquire'
	| 'reward_upgrade_drone_count'
	| 'reward_upgrade_drone_attack_speed'
	| 'reward_upgrade_drone_move_speed'
	| 'reward_weapon_upgrade_straight'
	| 'reward_weapon_upgrade_scatter'
	| 'reward_weapon_upgrade_laser'
	| 'reward_weapon_upgrade_missile'
	| 'reward_weapon_upgrade_karate';
export type BattlefieldDropDefinitionId =
	| 'drop_weapon_supply'
	| 'drop_xp_crystal'
	| 'drop_heal_pack'
	| 'drop_speed_tonic'
	| 'drop_attack_manual'
	| 'drop_damage_core'
	| 'drop_guard_shield'
	| 'drop_reroll_coupon';

export interface Vec2 {
	x: number;
	y: number;
}

export interface Question {
	id: string;
	difficulty: Difficulty;
	prompt: string;
	options: string[];
	answer: string;
	explanation: string;
	sourceIndex?: number;
	performance?: {
		attempts: number;
		correct: number;
		wrong: number;
		accuracy: number;
		consecutive_correct_count?: number;
		cooldown_until_round?: number;
		last_user_answer?: string;
		last_result?: 'correct' | 'wrong';
		updated_at?: number;
	};
}

export interface PackSourceContext {
	file_id?: string;
	chapter?: string;
}

export interface QuestionPack {
	id: string;
	title: string;
	description?: string;
	source?: PackSourceContext;
	questions: Question[];
}

export interface PlayerState {
	x: number;
	y: number;
	radius: number;
	speed: number;
	hp: number;
	maxHp: number;
	contactInvulnMs: number;
	hurtFlashMs: number;
	moving: boolean;
	moveDirX: number;
	moveDirY: number;
}

export interface MonsterState {
	id: string;
	difficulty: Difficulty;
	x: number;
	y: number;
	radius: number;
	hp: number;
	maxHp: number;
	speed: number;
	damage: number;
	isDead: boolean;
	hurtFlashMs: number;
	attackCooldownMs: number;
	attackState: MonsterAttackState;
	attackWindupMs: number;
	moving: boolean;
	moveDirX: number;
	moveDirY: number;
	skill?: MonsterSkillRuntimeState;

	// debuffs
	slowUntil?: number;
	slowMultiplier?: number;
	bleedUntil?: number;
	bleedDps?: number;
}

export interface ProjectileState {
	id: string;
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
	damage: number;
	color?: string;
	owner?: 'player' | 'monster';
	ttlMs?: number;

	// optional extended behaviors
	kind?: 'bullet' | 'missile' | 'reflected';
	targetMonsterId?: string | null;
	homingStrength?: number;
	explosionRadius?: number;
	leaveBurningMs?: number;
	leaveBurningDps?: number;
	pierceRemaining?: number;
	pierceDamageFalloffMultiplier?: number;
	hitMonsterIds?: string[];

	// debuff/knockback payload
	applySlowChance?: number;
	applySlowMultiplier?: number;
	applySlowMs?: number;
	applyBleedDps?: number;
	applyBleedMs?: number;
	applyKnockback?: number;
	applyKnockbackChance?: number;
	applyKnockbackRange?: number;
}

export interface MonsterSkillRuntimeState {
	kind: MonsterSkillKind;
	phaseMs: number;
	committedDirX: number;
	committedDirY: number;
	hasAppliedDamage: boolean;
}

export interface LaserEffectState {
	id: string;
	from: Vec2;
	to: Vec2;
	ttlMs: number;
	targetMonsterId?: string;
	widthMultiplier?: number;
}

export interface AttackSequenceState {
	id: string;
	weaponDefinitionId?: WeaponDefinitionId;
	pattern: AttackPattern;
	timeUntilNextMs: number;
	shotIntervalMs: number;
	shotsRemaining: number;
}

export interface RewardChoice {
	id: string;
	rewardDefinitionId: RewardDefinitionId;
	rewardKind: RewardKind;
	// UI meta (data-driven, computed at roll time)
	tag: string;
	iconGlyph: string;
	levelFrom?: number;
	levelTo?: number;
	title: string;
	description: string;
	question: Question;
}

export interface WrongNotebookStats {
	total: number;
	repeated: number;
	typeEntries: Array<[string, number]>;
	advice: string[];
}

export interface BattleStats {
	kills: number;
	correct: number;
	wrong: number;
	qaRound: number;
}

export interface BuffState {
	queuedWeaponBuff: AttackPattern | null;
	queuedWeaponBuffWeaponId: WeaponDefinitionId | null;
	queuedWeaponBuffUses: number;
	expBoostUntil: number;
	pulseOverchargeStacks: number;
	moveSpeedBoostUntil: number;
	moveSpeedBoostMultiplier: number;
	attackSpeedBoostUntil: number;
	attackSpeedBoostMultiplier: number;
	damageBoostUntil: number;
	damageBoostMultiplier: number;
	shieldBlockCharges: number;

	// transient mitigation windows (e.g. dash upgrade)
	damageMitigation: { until: number; multiplier: number } | null;
}

export interface ActiveBuffIndicator {
	id: string;
	label: string;
	detail: string;
	tone: 'weapon' | 'xp' | 'heal' | 'buff' | 'shield';
}

export interface GameProgressState {
	level: number;
	exp: number;
	nextLevelTotalExp: number;
	pendingLevelUps: number;
}

export interface GameSettings {
	attackPreference: AttackPreference;
}

export interface LoadoutState {
	mainWeaponId: WeaponDefinitionId;
	// 底部技能栏：主武器固定 1 格（不绑定按键），额外技能/武器固定 4 格（H/J/K/L）
	actionSlots: Record<ActionSlotKey, SkillDefinitionId | null>;
}

export interface UiState {
	showStartMenu: boolean;
	showRewardPanel: boolean;
	showPrepPanel: boolean;
	showSettingsPanel: boolean;
	rewardChoices: RewardChoice[];
	recentRewardDefinitionIds: RewardDefinitionId[];
	recentQuestionIds: string[];
	rewardRerollCount: number;
	// 本局剩余重随机次数（默认 3，可被掉落物增加）
	rewardRerollsRemaining: number;
	rewardFeedback: string | null;
	rewardFeedbackKind: 'success' | 'error' | null;
	pickupFeedback: PickupFeedbackState | null;
}

export interface DamageTextState {
	id: string;
	x: number;
	y: number;
	value: number;
	color: string;
	ttlMs: number;
	driftSpeed: number;
}

export interface BattlefieldDropState {
	id: string;
	definitionId?: BattlefieldDropDefinitionId;
	kind: BattlefieldDropKind;
	x: number;
	y: number;
	radius: number;
	ttlMs: number;
}

export interface PickupFeedbackState {
	kind: BattlefieldDropKind;
	definitionId?: BattlefieldDropDefinitionId;
	title: string;
	detail: string;
	ttlMs: number;
}

export interface RuntimeState {
	running: boolean;
	timeScale: number;
	spawnCooldownMs: number;
	attackCooldownMs: number;
	// H/J/K/L 槽位各自冷却，方便扩展多技能
	actionCooldownMs: Record<ActionSlotKey, number>;
	abilityPulseFxMs: number;
	abilityDashFxMs: number;
	abilityKarateFxMs: number;
	dashRemainingMs: number;
	dashDirectionX: number;
	dashDirectionY: number;
	dashSpeed: number;
	karateDirectionX: number;
	karateDirectionY: number;
}

export interface BuildState {
	// 技能/武器等级与升级进度：用于奖励池与 HUD 展示。
	skillLevels: Record<SkillDefinitionId, number>;
	weaponLevels: Record<WeaponDefinitionId, number>;

	// 武器/技能的“可扩展效果”收敛到这里，避免把升级逻辑写死在 UI。
	mods: {
		// straight
		straightBurstExtra: number;
		straightTrajectories: number;
		straightFreezeChance: number;
		straightFreezeSlowMultiplier: number;
		straightFreezeMs: number;
		straightPierce: number;

		// scatter
		scatterExtraPellets: number;
		scatterBleedDps: number;
		scatterBleedMs: number;
		scatterCloseKnockbackChance: number;
		scatterCloseKnockback: number;

		// missile
		missileExplosionRadiusBonus: number;
		missileBurningMs: number;
		missileBurningDps: number;

	// laser
	laserRangeMultiplier?: number;
	laserWidthMultiplier: number;
	karateRangeMultiplier?: number;
	};
}

export interface RunDamageSourceTelemetryState {
	hits: number;
	damage: number;
}

export interface RunTelemetryState {
	elapsedMs: number;
	totalDamageTaken: number;
	damageBySource: Record<PlayerDamageSource, RunDamageSourceTelemetryState>;
	lastDamageSource: PlayerDamageSource | null;
	defeatSource: PlayerDamageSource | null;
}

export interface RunSummary {
	primaryDefeatReason: string;
	explanation: string;
	survivalTimeMs: number;
	survivalTimeLabel: string;
	levelReached: number;
	kills: number;
	correct: number;
	wrong: number;
	accuracy: number;
	accuracyLabel: string;
	pendingRewards: number;
	tips: string[];
}

export interface DroneState {
	id: string;
	x: number;
	y: number;
	orbitAngle: number;
	cooldownMs: number;
	targetMonsterId: string | null;
	moveDirX: number;
	moveDirY: number;
	formationSlot: number;
	attackSpeedMultiplier?: number;
	moveSpeedMultiplier?: number;
}

export interface GameState {
	width: number;
	height: number;
	pack: QuestionPack;
	settings: GameSettings;
	loadout: LoadoutState;
	player: PlayerState;
	monsters: MonsterState[];
	battlefieldDrops: BattlefieldDropState[];
	projectiles: ProjectileState[];
	lasers: LaserEffectState[];
	damageTexts: DamageTextState[];
	attackSequences: AttackSequenceState[];
	battle: BattleStats;
	buffs: BuffState;
	build: BuildState;
	progress: GameProgressState;
	ui: UiState;
	runtime: RuntimeState;
	runTelemetry: RunTelemetryState;
	drones: DroneState[];
}
