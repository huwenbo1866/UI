export type Difficulty = 'easy' | 'medium' | 'hard';
export type AttackPattern = 'single' | 'scatter' | 'straight4' | 'scatter7';
export type RewardKind = 'weapon' | 'xp' | 'drone';
export type AttackPreference = 'straight' | 'scatter';

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
}

export interface RuntimeState {
	running: boolean;
	timeScale: number;
	spawnCooldownMs: number;
	attackCooldownMs: number;
}

export interface GameState {
	width: number;
	height: number;
	pack: QuestionPack;
	settings: GameSettings;
	player: PlayerState;
	monsters: MonsterState[];
	projectiles: ProjectileState[];
	drones: DroneState[];
	lasers: LaserEffectState[];
	attackSequences: AttackSequenceState[];
	battle: BattleStats;
	buffs: BuffState;
	progress: GameProgressState;
	ui: UiState;
	runtime: RuntimeState;
}
