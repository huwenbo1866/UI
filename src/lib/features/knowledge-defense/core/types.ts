export type Difficulty = 'easy' | 'medium' | 'hard';
export type AttackPattern = 'single' | 'scatter' | 'straight4' | 'scatter7';
export type RewardKind = 'weapon' | 'xp' | 'drone';
export type AttackPreference = 'straight' | 'scatter';
export type MonsterAttackState = 'idle' | 'telegraph' | 'active' | 'recovery';
export type MonsterSkillKind = 'melee' | 'dash' | 'throw';
export type BattlefieldDropKind = 'weapon' | 'xp' | 'heal';
export type PlayerDamageSource = 'melee' | 'dash' | 'projectile';

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
}

export interface AttackSequenceState {
	id: string;
	pattern: AttackPattern;
	timeUntilNextMs: number;
	shotIntervalMs: number;
	shotsRemaining: number;
}

export interface RewardChoice {
	id: string;
	rewardKind: RewardKind;
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
	queuedWeaponBuffUses: number;
	expBoostUntil: number;
	pulseOverchargeStacks: number;
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

export interface UiState {
	showStartMenu: boolean;
	showRewardPanel: boolean;
	showPrepPanel: boolean;
	showSettingsPanel: boolean;
	rewardChoices: RewardChoice[];
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
	kind: BattlefieldDropKind;
	x: number;
	y: number;
	radius: number;
	ttlMs: number;
}

export interface PickupFeedbackState {
	kind: BattlefieldDropKind;
	title: string;
	detail: string;
	ttlMs: number;
}

export interface RuntimeState {
	running: boolean;
	timeScale: number;
	spawnCooldownMs: number;
	attackCooldownMs: number;
	abilityCooldownMs: number;
	abilityPulseFxMs: number;
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

export interface GameState {
	width: number;
	height: number;
	pack: QuestionPack;
	settings: GameSettings;
	player: PlayerState;
	monsters: MonsterState[];
	battlefieldDrops: BattlefieldDropState[];
	projectiles: ProjectileState[];
	drones: DroneState[];
	lasers: LaserEffectState[];
	damageTexts: DamageTextState[];
	attackSequences: AttackSequenceState[];
	battle: BattleStats;
	buffs: BuffState;
	progress: GameProgressState;
	ui: UiState;
	runtime: RuntimeState;
	runTelemetry: RunTelemetryState;
}
