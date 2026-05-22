// src/lib/features/knowledge-defense/config/constants.ts

import type {
	AttackPattern,
	AttackPreference,
	BattlefieldDropDefinitionId,
	BattlefieldDropKind,
	RewardDefinitionId,
	SkillDefinitionId,
	WeaponDefinitionId
} from '../core/types';

export const PLAYFIELD_MIN_HEIGHT = 760; // 游戏战场最小高度（像素）

export const MAX_ALIVE_MONSTERS = 8; // 场上最多同时存在的怪物数量

// 本文件是 knowledge-defense 模式的“单一参数源”。
// 使用方式分两层：
// 1) 上半部分的基础常量：直接给各个 system / UI 模块使用。
// 2) 下半部分的 KD_*_TUNING / *_CONFIGS：把基础常量重新组织成“面向模块”的配置对象，
//    方便 data/*、systems/*、ui/* 在一个入口读取自己关心的参数。

// ==================== 玩家参数 ====================
// 主要被以下模块消费：
// - state/game-store.ts：初始化玩家初始生命、半径、速度。
// - systems/player-system.ts：处理移动、碰撞、受伤无敌帧。
// - ui/GameCanvas.svelte：玩家在画布中的尺寸/表现依赖这些基础值。
export const PLAYER_MAX_HP = 200; // 玩家最大血量
export const PLAYER_RADIUS = 34; // 玩家碰撞半径（像素）
export const PLAYER_SPEED = 80; // 玩家移动速度（像素/秒）
export const PLAYER_CONTACT_IFRAME_MS = 700; // 玩家被怪物接触后的无敌时间（毫秒）

// ==================== 怪物参数 ====================
// 主要被以下模块消费：
// - systems/monster-system.ts：怪物刷新、寻路、近战/冲刺/投掷 AI、软分离。
// - state/game-store.ts：怪物运行时状态初始化时需要默认字段。
// - ui/GameCanvas.svelte：怪物尺寸、血条、攻击前摇表现间接依赖这些值。
export const MONSTER_SPAWN_INTERVAL_MS = 1250; // 怪物刷新间隔（毫秒）

export const MONSTER_BASE_SPEED = {
	// 怪物基础移动速度（按难度区分）
	easy: 45,
	medium: 50,
	hard: 60
} as const;

export const MONSTER_HP = {
	// 怪物血量（按难度区分）
	easy: 100,
	medium: 180,
	hard: 300
} as const;

export const MONSTER_RADIUS = {
	// 怪物碰撞半径（像素，按难度区分）
	easy: 22,
	medium: 26,
	hard: 30
} as const;

export const MONSTER_DAMAGE = {
	// 怪物对玩家的伤害（按难度区分）
	easy: 40,
	medium: 60,
	hard: 80
} as const;
export const MONSTER_ATTACK_INTERVAL_MS = 1200; // 怪物近战攻击间隔
export const MONSTER_ATTACK_WINDUP_MS = 320; // 怪物攻击前摇（给玩家反应窗口）
export const MONSTER_DASH_TRIGGER_RANGE = 240; // 中型怪物启动冲刺的判定范围
export const MONSTER_DASH_TELEGRAPH_MS = 360; // 中型怪物冲刺前摇
export const MONSTER_DASH_BURST_MS = 180; // 中型怪物冲刺突进持续时间
export const MONSTER_DASH_SPEED = 560; // 中型怪物冲刺速度（像素/秒）
export const MONSTER_DASH_RECOVERY_MS = 340; // 中型怪物冲刺后的僵直
export const MONSTER_DASH_COOLDOWN_MS = 1350; // 中型怪物冲刺后的冷却
export const MONSTER_THROW_TRIGGER_RANGE = 360; // 高难怪物启动投掷的判定范围
export const MONSTER_THROW_TELEGRAPH_MS = 420; // 高难怪物投掷前摇
export const MONSTER_THROW_COOLDOWN_MS = 1500; // 高难怪物投掷后的冷却
export const MONSTER_SEPARATION_RADIUS = 72; // 怪物彼此软分离半径
export const MONSTER_SEPARATION_FORCE = 1.15; // 怪物软分离力度
export const MONSTER_PLAYER_STANDOFF = 24; // 怪物围住玩家时的额外留白
export const MONSTER_MIN_GAP = 10; // 怪物之间的最小可读间距

// ==================== 攻击参数 ====================
// 主要被以下模块消费：
// - systems/auto-attack-system.ts：主武器弹道、散射、导弹、激光、空手道主武器。
// - systems/projectile-system.ts：投射物移动、碰撞、导弹追踪、导弹爆炸。
// - systems/monster-system.ts：高难怪投掷物。
// - ui/GameCanvas.svelte：投射物 / 激光的视觉尺寸与可视化表现。
export const AUTO_ATTACK_COOLDOWN_MS = 1000; // 自动攻击冷却时间（毫秒）
export const DEFAULT_ATTACK_PREFERENCE: AttackPreference = 'straight'; // 默认攻击模式

export const PROJECTILE_SPEED = 800; // 子弹飞行速度（像素/秒）
export const BASE_PROJECTILE_RADIUS = 7; // 子弹碰撞半径（像素）
export const MONSTER_THROW_PROJECTILE_SPEED = 420; // 怪物投掷物飞行速度（像素/秒）
export const MONSTER_THROW_PROJECTILE_RADIUS = 12; // 怪物投掷物碰撞半径（像素）
export const MONSTER_THROW_PROJECTILE_TTL_MS = 1700; // 怪物投掷物存在时间（毫秒）
export const MONSTER_THROW_PROJECTILE_COLOR = '#7f1d1d'; // 怪物投掷物主色

export const BASE_STRAIGHT_DAMAGE = 30; // 普通直线攻击伤害
export const BASE_SCATTER_PELLET_COUNT = 3; // 普通散射子弹数量
export const BASE_SCATTER_PELLET_DAMAGE = 16; // 普通散射子弹伤害
export const BASE_SCATTER_SPREAD_RADIANS = (Math.PI / 180) * 18; // 普通散射角度

export const STRAIGHT4_SHOT_INTERVAL_MS = 160; // 4连发直线攻击间隔（毫秒）
export const STRAIGHT4_DAMAGE = [24, 28, 34, 42]; // 4连发每发伤害
export const STRAIGHT_BURST_INTERVAL_MS = 110; // 直线连发额外子弹间隔

export const SCATTER7_PELLET_COUNT = 7; // 7发散射子弹数量
export const SCATTER7_SPREAD_RADIANS = (Math.PI / 180) * 36; // 7发散射角度
export const SCATTER7_PELLET_DAMAGE = 16; // 7发散射子弹伤害

export const MISSILE_BURST_COUNT = 2; // 导弹武器每轮发射数
export const MISSILE_BURST_INTERVAL_MS = 140; // 导弹武器连发间隔
export const MISSILE_PROJECTILE_SPEED = 700; // 导弹飞行速度
export const MISSILE_PROJECTILE_RADIUS = 10; // 导弹碰撞半径
export const MISSILE_PROJECTILE_DAMAGE = 52; // 导弹单发伤害
export const MISSILE_LAUNCH_ANGLE_OFFSET_RADIANS = (Math.PI / 180) * 28; // 导弹起飞偏角
export const MISSILE_LAUNCH_LATERAL_OFFSET = 16; // 导弹左右发射间距
export const MISSILE_LAUNCH_VERTICAL_OFFSET = 34; // 导弹从人物头顶发射

export const MISSILE_EXPLOSION_RADIUS = 92; // 导弹爆炸半径
export const MISSILE_HOMING_STEER = 0.08; // 导弹轻微追踪强度（0-1）
export const MISSILE_BURNING_MS = 2000; // 导弹灼烧区域持续时间（用于升级）
export const MISSILE_BURNING_DPS = 10; // 灼烧每秒伤害（用于升级）

export const LASER_RANGE = 340; // 激光武器最远射程
export const LASER_WIDTH = 20; // 激光判定宽度
export const LASER_BASE_WIDTH_MULTIPLIER = 6; // 主武器激光基础粗度倍率
export const LASER_DAMAGE = 64; // 激光命中伤害
export const LASER_TTL_MS = 160; // 激光特效持续时间

export const SCATTER_BLEED_DAMAGE_PER_TICK = 3; // 散射流血每次跳伤
export const SCATTER_BLEED_TICK_INTERVAL_MS = 1000; // 散射流血跳伤间隔
export const SCATTER_BLEED_MAX_TICKS = 3; // 散射流血最大跳伤次数

// ==================== 奖励 & 无人机 ====================
// 这一段混合了“局内经济/奖励”和“无人机伴随体”两类参数。
// 主要被以下模块消费：
// - systems/progression-system.ts：经验、永久/临时增益、护盾、武器强化次数。
// - systems/battlefield-drop-system.ts：战场掉落寿命、拾取效果、反馈显示。
// - data/reward-pool.ts / KD_REWARD_OFFER_CONFIGS：奖励池生成时引用对应数值。
// - systems/drone-system.ts：无人机索敌、移动、攻速、编队、数量上限。
// - ui/HudOverlay.svelte / ui/KnowledgeDefenseGame.svelte：HUD 状态条、待领奖励、掉落反馈。
export const EXP_PER_KILL = 10; // 击杀怪物获得的基础经验
export const EXP_BOOST_MULTIPLIER = 1.5; // 经验增幅奖励倍率
export const EXP_BOOST_DURATION_MS = 60_000; // 经验增幅持续时间（毫秒）
export const BATTLEFIELD_DROP_EXP_BOOST_DURATION_MS = 20_000; // 战场经验掉落持续时间
export const BATTLEFIELD_DROP_HEAL_AMOUNT = 28; // 战场治疗掉落回复量
export const BATTLEFIELD_DROP_WEAPON_USES = 2; // 战场武器掉落强化次数
export const MOVE_SPEED_REWARD_DURATION_MS = 20_000; // 奖励移速增幅持续时间
export const MOVE_SPEED_REWARD_MULTIPLIER = 1.35; // 奖励移速倍率
export const MOVE_SPEED_DROP_DURATION_MS = 12_000; // 战场移速掉落持续时间
export const MOVE_SPEED_DROP_MULTIPLIER = 1.22; // 战场移速掉落倍率
export const ATTACK_SPEED_REWARD_DURATION_MS = 18_000; // 奖励攻速增幅持续时间
export const ATTACK_SPEED_REWARD_MULTIPLIER = 1.35; // 奖励攻速倍率
export const ATTACK_SPEED_DROP_DURATION_MS = 12_000; // 战场攻速掉落持续时间
export const ATTACK_SPEED_DROP_MULTIPLIER = 1.18; // 战场攻速掉落倍率
export const DAMAGE_BOOST_REWARD_DURATION_MS = 16_000; // 奖励伤害增幅持续时间
export const DAMAGE_BOOST_REWARD_MULTIPLIER = 1.4; // 奖励伤害倍率
export const DAMAGE_BOOST_DROP_DURATION_MS = 10_000; // 战场伤害掉落持续时间
export const DAMAGE_BOOST_DROP_MULTIPLIER = 1.25; // 战场伤害掉落倍率
export const SHIELD_BLOCK_MAX_CHARGES = 1; // 护盾最多储存一次格挡
export const BATTLEFIELD_DROP_TTL_MS = 12_000; // 战场掉落存在时间
export const BATTLEFIELD_DROP_RADIUS = 20; // 战场掉落碰撞半径
export const BATTLEFIELD_DROP_FEEDBACK_TTL_MS = 2_400; // 掉落提示在 HUD 中保留时间
export const BATTLEFIELD_DROP_EXPIRING_TTL_MS = 3_000; // 掉落进入即将消失态的阈值
export const BATTLEFIELD_DROP_CHANCE = {
	easy: 0.24,
	medium: 0.32,
	hard: 0.42
} as const;

export const TIME_SCALE_NORMAL = 1; // 正常游戏速度倍率
export const TIME_SCALE_REWARD_PANEL = 1 / 12; // 奖励面板打开时游戏速度倍率（暂停效果）

// ==================== 奖励重随机（Reroll）====================
export const DEFAULT_REWARD_REROLLS = 3; // 每局默认重随机次数

export const WEAPON_REWARD_USES = 3; // 武器强化奖励可使用次数

export const DRONE_DAMAGE = 50; // 无人机攻击伤害
export const DRONE_SPEED = 180; // 无人机移动速度
export const DRONE_COOLDOWN_MS = 3000; // 无人机攻击冷却时间（毫秒）
export const DRONE_ENGAGE_RANGE = 92; // 无人机攻击距离（像素）
export const DRONE_ORBIT_DISTANCE = 62; // 添加无人机时的初始环绕距离
export const DRONE_PATROL_RADIUS = 200; // 无怪物时无人机的巡逻半径
export const DRONE_TARGET_LOAD_PENALTY = 34; // 无人机共享目标时的负载惩罚
export const DRONE_SEPARATION_RADIUS = 54; // 无人机彼此软分离半径
export const DRONE_SEPARATION_FORCE = 1.1; // 无人机软分离力度
export const DRONE_FORMATION_ARC = Math.PI * 0.82; // 无人机围目标排布弧度
export const DRONE_FORMATION_JITTER = 10; // 无人机槽位轻微抖动距离
export const DRONE_ARRIVE_SLOW_RADIUS = 70; // 无人机靠近槽位时的减速半径
export const DRONE_MIN_GAP = 14; // 无人机之间的最小可读间距
export const DRONE_MAX_ACTIVE = 3; // 无人机数量上限，避免高负载下性能恶化
export const MAX_ACTIVE_LASERS = 12; // 同屏激光特效上限
export const MAX_ACTIVE_DAMAGE_TEXTS = 28; // 同屏伤害数字上限

// ==================== 主动技能（脉冲爆发）====================
// 主要被以下模块消费：
// - systems/ability-system.ts：H/J/K/L 主动技能的实际释放逻辑。
// - systems/progression-system.ts：与技能升级相关的永久增幅（如空手道范围）。
// - data/reward-pool.ts：技能奖励描述需要和这里的真实效果保持一致。
// - ui/GameCanvas.svelte：脉冲、冲刺、空手道的特效持续时间与表现。
export const ABILITY_COOLDOWN_MS = 16_000; // 主动技能冷却（毫秒）
export const ABILITY_PULSE_RADIUS = 170; // 主动技能作用半径（像素）
export const ABILITY_PULSE_DAMAGE = 80; // 主动技能基础伤害
export const ABILITY_PULSE_KNOCKBACK = 68; // 主动技能击退距离（像素）
export const ABILITY_PULSE_IFRAME_MS = 450; // 释放后短暂无敌（毫秒）
export const ABILITY_PULSE_HEAL_ON_HIT = 6; // 命中每个怪物回复生命
export const ABILITY_PULSE_MAX_HEAL = 36; // 单次释放最大回复
export const ABILITY_PULSE_OVERCHARGE_RADIUS_BONUS = 58; // 超载脉冲额外半径
export const ABILITY_PULSE_OVERCHARGE_DAMAGE_BONUS = 44; // 超载脉冲额外伤害
export const ABILITY_PULSE_OVERCHARGE_HEAL_ON_HIT_BONUS = 4; // 超载脉冲额外单体回复
export const ABILITY_PULSE_OVERCHARGE_MAX_HEAL_BONUS = 18; // 超载脉冲额外总回复上限
export const ABILITY_PULSE_OVERCHARGE_IFRAME_BONUS_MS = 180; // 超载脉冲额外无敌时间
export const ABILITY_PULSE_OVERCHARGE_MAX_STACKS = 2; // 脉冲超载最多可存储层数

export const ABILITY_DASH_DISTANCE = 180; // 冲刺位移距离
export const ABILITY_DASH_DAMAGE = 70; // 冲刺穿行伤害
export const ABILITY_DASH_STRIKE_RADIUS = 46; // 冲刺命中宽度
export const ABILITY_DASH_IFRAME_MS = 600; // 冲刺无敌时间
export const ABILITY_DASH_KNOCKBACK = 54; // 冲刺命中击退
export const ABILITY_DASH_DURATION_MS = 130; // 冲刺持续时间
export const ABILITY_DASH_FX_MS = 180; // 冲刺视觉反馈时间

export const ABILITY_KARATE_RANGE = 96; // 空手短打判定范围
export const ABILITY_KARATE_DAMAGE = 88; // 空手短打伤害
export const ABILITY_KARATE_MAX_TARGETS = 3; // 空手短打最多命中目标数
export const ABILITY_KARATE_KNOCKBACK = 56; // 空手短打击退距离
export const ABILITY_KARATE_FX_MS = 180; // 空手道拳风特效持续时间

// ==================== 音效控制（系统化开关）===================
// 主要被 systems/audio-manager.ts 使用，用来统一控制 BGM / 点击 / 命中 / 面板音效是否启用。
export const ENABLE_AUDIO = false; // 总音效开关（关闭后所有音效失效）

export const ENABLE_BGM = true; // 背景音乐开关
export const ENABLE_CLICK_SOUND = true; // 按钮点击音效开关
export const ENABLE_HIT_SOUND = true; // 怪物被击中音效开关
export const ENABLE_DEATH_SOUND = true; // 怪物死亡音效开关
export const ENABLE_PANEL_SOUND = true; // 面板打开/关闭音效开关

// ==================== 错题分析 AI 配置 ====================
// 主要被错题分析 / 题库回写链路使用；知识防御战斗系统本身不直接依赖这些参数。
// 安全约束：仓库内不允许硬编码任何第三方 API Key。
// 错题分析默认走本地降级逻辑；如需启用外部模型，请在部署侧自行实现安全的服务端代理。
export const ENABLE_AI_WRONG_QUESTION_ANALYSIS = false; // 是否开启 AI 分析（总开关）

// ==================== 自定义大模型配置 ====================
// 主要给题目分析与外部模型接入预留；前端知识防御的战斗循环不直接使用。
export const AI_BASE_URL = ''; // 留空：避免在前端直连外部模型
export const AI_API_KEY = ''; // 留空：禁止在仓库/前端内保存密钥
export const AI_MODEL = ''; // 留空：外部模型由部署侧提供

export const AI_ANALYSIS_PROMPT = `
你是一个专业的教育AI助手。请对以下结构化的错题记录进行分析。

请严格按照以下JSON格式返回，不要添加任何额外文字和解释：

{
  "typeEntries": [ ["类型名称", 数量], ... ],   
  "advice": [ "建议1", "建议2", ... ]           
}

错题记录：
{questions}
`;

// ==================== 知识闯关题库回写/强化配置 ====================
// 主要被以下模块消费：
// - adapters/wrong-question-adapter.ts：错题记录、统计与清理。
// - ui/KnowledgeDefenseGame.svelte：答题后回写节奏、延迟同步与章节题量控制。
// - data/reward-questions.ts：强化题 / 自适应抽题权重。
export const KD_ENABLE_DEBUG_LOGS = true; // 是否输出知识闯关的调试日志
export const KD_SYNC_BATCH_SIZE = 6; // 累积多少次答题后立即回写
export const KD_SYNC_DEFER_MS = 12_000; // 未达到批次时的延迟回写时间
export const KD_CHAPTER_MAX_QUESTIONS = 50; // 章节题库最大题量

export const KD_MASTERY_STREAK_TO_REMOVE = 2; // 连续答对达到该次数后从强化池移除
export const KD_CORRECT_COOLDOWN_ROUNDS = 9; // 普通答对后的冷却轮次
export const KD_MASTERED_COOLDOWN_ROUNDS = 14; // 连续答对达标后的更长冷却轮次
export const KD_WRONG_COOLDOWN_MIN_ROUNDS = 4; // 答错后的最小冷却轮次
export const KD_WRONG_COOLDOWN_MAX_ROUNDS = 9; // 答错后的最大冷却轮次
export const KD_WRONG_COOLDOWN_BASE = 3; // 答错冷却基础值（叠加 wrong 次数）

export const KD_AMPLIFY_PER_WRONG_MIN = 1; // 错题最少生成同类型强化题量
export const KD_AMPLIFY_PER_WRONG_MAX = 3; // 错题最多生成同类型强化题数量
export const KD_AMPLIFY_ORDER_OFFSET = 1000; // 强化题排序偏移，确保排在后面

export const KD_ADAPTIVE_BASE_WEIGHT_UNSEEN = 1.4; // 未做过题目的基础权重
export const KD_ADAPTIVE_MISS_RATE_FACTOR = 1.6; // 错误率权重系数
export const KD_ADAPTIVE_RECENT_WRONG_BONUS = 0.35; // 最近答错加权
export const KD_ADAPTIVE_VOLUME_BONUS_PER_ATTEMPT = 0.04; // 做题次数加权步进
export const KD_ADAPTIVE_VOLUME_BONUS_MAX = 0.35; // 做题次数加权上限

export const KD_REINFORCE_PROMPT_VARIANTS = [
	// 错题强化题干变式文案
	'变式训练',
	'同场景迁移',
	'易错点再练',
	'对比辨析',
	'小测巩固'
] as const;

export const KD_REINFORCE_FALLBACK_DISTRACTORS = [
	// 干扰项补位（选项不够时）
	'以上都不对',
	'题干信息不足',
	'需结合教材上下文判断',
	'需要二次推理'
] as const;

export const KD_ASSET_PATHS = {
	playerSprite: '/knowledge-defense/player.png',
	droneSprite: '/knowledge-defense/drone.png'
} as const;

// KD_PLAYER_TUNING：把“玩家基础常量”重新组织成 player-system / game-store 更容易消费的结构。
// 主要给 state/game-store.ts 和 systems/player-system.ts 统一读取，避免散落地 import 多个独立常量。
export const KD_PLAYER_TUNING = {
	maxHp: PLAYER_MAX_HP,
	radius: PLAYER_RADIUS,
	speed: PLAYER_SPEED,
	contactIFrameMs: PLAYER_CONTACT_IFRAME_MS
} as const;

// KD_MONSTER_TUNING：monster-system 的主配置对象。
// 负责怪物的：
// - 刷新频率与场上数量上限
// - 按难度区分的血量 / 速度 / 半径 / 伤害
// - 近战、冲刺、投掷三类攻击的读条与冷却
// - 怪物之间以及怪物与玩家之间的空间排布参数
// - 随玩家等级提升的刷怪难度曲线
export const KD_MONSTER_TUNING = {
	maxAlive: MAX_ALIVE_MONSTERS,
	spawnIntervalMs: MONSTER_SPAWN_INTERVAL_MS,
	baseSpeed: MONSTER_BASE_SPEED,
	hp: MONSTER_HP,
	radius: MONSTER_RADIUS,
	damage: MONSTER_DAMAGE,
	attackIntervalMs: MONSTER_ATTACK_INTERVAL_MS,
	attackWindupMs: MONSTER_ATTACK_WINDUP_MS,
	dashTriggerRange: MONSTER_DASH_TRIGGER_RANGE,
	dashTelegraphMs: MONSTER_DASH_TELEGRAPH_MS,
	dashBurstMs: MONSTER_DASH_BURST_MS,
	dashSpeed: MONSTER_DASH_SPEED,
	dashRecoveryMs: MONSTER_DASH_RECOVERY_MS,
	dashCooldownMs: MONSTER_DASH_COOLDOWN_MS,
	throwTriggerRange: MONSTER_THROW_TRIGGER_RANGE,
	throwTelegraphMs: MONSTER_THROW_TELEGRAPH_MS,
	throwCooldownMs: MONSTER_THROW_COOLDOWN_MS,
	separationRadius: MONSTER_SEPARATION_RADIUS,
	separationForce: MONSTER_SEPARATION_FORCE,
	playerStandoff: MONSTER_PLAYER_STANDOFF,
	minimumGap: MONSTER_MIN_GAP,
	spawnDifficulty: {
		hardMinimumLevel: 6,
		hardRollThreshold: 0.55,
		mediumMinimumLevel: 3,
		mediumRollThreshold: 0.45,
		levelSpeedStep: 1.5,
		initialAttackCooldownMs: 280
	}
} as const;

export const KD_WEAPON_TUNING = {
	// KD_WEAPON_TUNING：auto-attack-system / projectile-system 的主配置对象。
	// 负责主武器及其升级项的所有参数，包括：
	// - 普通直射 / 散射 / 导弹 / 激光 / 怪物投掷物
	// - 升级上限、强化步进、特殊效果（减速、穿透、流血、灼烧）
	// - 激光基础粗度倍率、导弹追踪强度、连发节奏等战斗核心体验
	autoAttackCooldownMs: AUTO_ATTACK_COOLDOWN_MS,
	defaultAttackPreference: DEFAULT_ATTACK_PREFERENCE,
	projectile: {
		speed: PROJECTILE_SPEED,
		radius: BASE_PROJECTILE_RADIUS
	},
	straight: {
		baseDamage: BASE_STRAIGHT_DAMAGE,
		burstIntervalMs: STRAIGHT_BURST_INTERVAL_MS,
		upgradeShotIntervalMs: STRAIGHT4_SHOT_INTERVAL_MS,
		upgradeDamage: STRAIGHT4_DAMAGE,
		upgradeMaxBurstExtra: 2,
		upgradeMaxTrajectories: 2,
		freezeChance: 0.25,
		pierceMax: 2
	},
		scatter: {
			basePelletCount: BASE_SCATTER_PELLET_COUNT,
			basePelletDamage: BASE_SCATTER_PELLET_DAMAGE,
			baseSpreadRadians: BASE_SCATTER_SPREAD_RADIANS,
			upgradePelletCount: SCATTER7_PELLET_COUNT,
			upgradePelletDamage: SCATTER7_PELLET_DAMAGE,
			upgradeSpreadRadians: SCATTER7_SPREAD_RADIANS,
			upgradeMaxExtraPellets: 3,
			knockbackChance: 0.5,
			bleedDamagePerTick: SCATTER_BLEED_DAMAGE_PER_TICK,
			bleedTickIntervalMs: SCATTER_BLEED_TICK_INTERVAL_MS,
			bleedMaxTicks: SCATTER_BLEED_MAX_TICKS
		},
	missile: {
		burstCount: MISSILE_BURST_COUNT,
		burstIntervalMs: MISSILE_BURST_INTERVAL_MS,
		projectileSpeed: MISSILE_PROJECTILE_SPEED,
		projectileRadius: MISSILE_PROJECTILE_RADIUS,
		projectileDamage: MISSILE_PROJECTILE_DAMAGE,
		launchAngleOffsetRadians: MISSILE_LAUNCH_ANGLE_OFFSET_RADIANS,
		launchLateralOffset: MISSILE_LAUNCH_LATERAL_OFFSET,
		launchVerticalOffset: MISSILE_LAUNCH_VERTICAL_OFFSET,
		explosionRadius: MISSILE_EXPLOSION_RADIUS,
		homingSteer: MISSILE_HOMING_STEER,
		burningMs: MISSILE_BURNING_MS,
		burningDps: MISSILE_BURNING_DPS,
		upgradeRadiusStep: 22,
		upgradeRadiusCap: 66,
		upgradeVolleyShots: 10
	},
		laser: {
			range: LASER_RANGE,
			width: LASER_WIDTH,
			baseWidthMultiplier: LASER_BASE_WIDTH_MULTIPLIER,
			damage: LASER_DAMAGE,
			ttlMs: LASER_TTL_MS,
			upgradePermanentRangeMultiplier: 1.5,
			upgradePermanentWidthMultiplier: 1.5,
		upgradeWidthStepMultiplier: 1.3,
		upgradeWidthCap: 1.55,
		maxActive: MAX_ACTIVE_LASERS
	},
	monsterThrow: {
		speed: MONSTER_THROW_PROJECTILE_SPEED,
		radius: MONSTER_THROW_PROJECTILE_RADIUS,
		ttlMs: MONSTER_THROW_PROJECTILE_TTL_MS,
		color: MONSTER_THROW_PROJECTILE_COLOR
	}
} as const;

export const KD_DRONE_TUNING = {
	// KD_DRONE_TUNING：drone-system 的主配置对象。
	// 负责无人机的：
	// - 伤害、攻速、追击范围
	// - 环绕 / 巡逻 / 编队 / 软分离
	// - 升级步进（攻速、移速）和最大上限
	// - 激光特效持续时间与显示尺寸
	damage: DRONE_DAMAGE,
	speed: DRONE_SPEED,
	cooldownMs: DRONE_COOLDOWN_MS,
	engageRange: DRONE_ENGAGE_RANGE,
	orbitDistance: DRONE_ORBIT_DISTANCE,
	patrolRadius: DRONE_PATROL_RADIUS,
	targetLoadPenalty: DRONE_TARGET_LOAD_PENALTY,
	separationRadius: DRONE_SEPARATION_RADIUS,
	separationForce: DRONE_SEPARATION_FORCE,
	formationArc: DRONE_FORMATION_ARC,
	formationJitter: DRONE_FORMATION_JITTER,
	arriveSlowRadius: DRONE_ARRIVE_SLOW_RADIUS,
	minimumGap: DRONE_MIN_GAP,
	maxActive: DRONE_MAX_ACTIVE,
	laserTtlMs: 140,
	engageBuffer: 24,
	preferredRangeRatio: 0.68,
	minimumCombatRangeRatio: 0.42,
	targetStickinessBonus: 40,
	attackSpeedUpgradeStep: 0.2,
	attackSpeedUpgradeCap: 2,
	moveSpeedUpgradeStep: 0.15,
	moveSpeedUpgradeCap: 2,
	spriteSize: 28
} as const;

export const KD_ABILITY_TUNING = {
	// KD_ABILITY_TUNING：ability-system 的主配置对象。
	// 负责主动技能的真实数值，不是文案：
	// - pulse：冷却、范围、击退、回复、超载加成、升级倍率
	// - dash：位移、伤害、击退、无敌、视觉特效、升级倍率
	// - karate：近战范围、反弹投射物、反弹伤害倍率与升级增幅
		pulse: {
			cooldownMs: ABILITY_COOLDOWN_MS,
			radius: ABILITY_PULSE_RADIUS,
			levelTwoCooldownMultiplier: 0.8,
			levelThreeRadiusMultiplier: 1.5,
			damage: ABILITY_PULSE_DAMAGE,
		knockback: ABILITY_PULSE_KNOCKBACK,
		iFrameMs: ABILITY_PULSE_IFRAME_MS,
		healOnHit: ABILITY_PULSE_HEAL_ON_HIT,
		maxHeal: ABILITY_PULSE_MAX_HEAL,
		overchargeRadiusBonus: ABILITY_PULSE_OVERCHARGE_RADIUS_BONUS,
		overchargeDamageBonus: ABILITY_PULSE_OVERCHARGE_DAMAGE_BONUS,
		overchargeHealOnHitBonus: ABILITY_PULSE_OVERCHARGE_HEAL_ON_HIT_BONUS,
		overchargeMaxHealBonus: ABILITY_PULSE_OVERCHARGE_MAX_HEAL_BONUS,
		overchargeIFrameBonusMs: ABILITY_PULSE_OVERCHARGE_IFRAME_BONUS_MS,
		overchargeMaxStacks: ABILITY_PULSE_OVERCHARGE_MAX_STACKS
	},
		dash: {
			distance: ABILITY_DASH_DISTANCE,
			levelTwoCooldownMultiplier: 0.8,
			levelThreeDistanceMultiplier: 1.2,
			damage: ABILITY_DASH_DAMAGE,
			strikeRadius: ABILITY_DASH_STRIKE_RADIUS,
			iFrameMs: ABILITY_DASH_IFRAME_MS,
			knockback: ABILITY_DASH_KNOCKBACK,
			durationMs: ABILITY_DASH_DURATION_MS,
			fxMs: ABILITY_DASH_FX_MS,
			cooldownMs: 5000
		},
	karate: {
		range: ABILITY_KARATE_RANGE,
		damage: ABILITY_KARATE_DAMAGE,
		maxTargets: ABILITY_KARATE_MAX_TARGETS,
		knockback: ABILITY_KARATE_KNOCKBACK,
		fxMs: ABILITY_KARATE_FX_MS,
		cooldownMs: 5200,
		reflectChance: 0.6,
		reflectedProjectileSpeed: 760,
		reflectedProjectileRadius: 8,
		reflectedProjectileTtlMs: 1200,
		reflectedProjectileLevelTwoDamageMultiplier: 1.3,
		upgradePermanentRangeMultiplier: 1.5
	}
} as const;

export const KD_WEAPON_CONFIGS: Record<WeaponDefinitionId, {
	// KD_WEAPON_CONFIGS：data/weapon-definitions.ts 的底层数据源。
	// 负责把“武器 id”映射到：
	// - attackPattern（实际战斗行为）
	// - attackPreference（开局偏好归属）
	// - title（UI/HUD 展示名）
	// - isTemporaryBuff（是否为短期强化弹幕）
	// - upgradeRewardIds（该武器能抽到哪些专属升级）
	id: WeaponDefinitionId;
	attackPattern: AttackPattern;
	attackPreference: AttackPreference;
	title: string;
	isTemporaryBuff: boolean;
	upgradeRewardIds: RewardDefinitionId[];
}> = {
	weapon_main_straight: { id: 'weapon_main_straight', attackPattern: 'single', attackPreference: 'straight', title: '直射主武器', isTemporaryBuff: false, upgradeRewardIds: ['reward_upgrade_straight_burst', 'reward_upgrade_straight_trajectory', 'reward_upgrade_straight_freeze', 'reward_upgrade_straight_pierce'] },
	weapon_main_scatter: { id: 'weapon_main_scatter', attackPattern: 'scatter', attackPreference: 'scatter', title: '散射主武器', isTemporaryBuff: false, upgradeRewardIds: ['reward_upgrade_scatter_pellets', 'reward_upgrade_scatter_knockback', 'reward_upgrade_scatter_bleed'] },
	weapon_buff_straight4: { id: 'weapon_buff_straight4', attackPattern: 'straight4', attackPreference: 'straight', title: '4 连发直射', isTemporaryBuff: true, upgradeRewardIds: [] },
	weapon_buff_scatter7: { id: 'weapon_buff_scatter7', attackPattern: 'scatter7', attackPreference: 'scatter', title: '7 发散射', isTemporaryBuff: true, upgradeRewardIds: [] },
	weapon_main_missile: { id: 'weapon_main_missile', attackPattern: 'missileBurst', attackPreference: 'straight', title: '导弹发射器', isTemporaryBuff: false, upgradeRewardIds: ['reward_upgrade_missile_radius', 'reward_upgrade_missile_burn'] },
	weapon_main_laser: { id: 'weapon_main_laser', attackPattern: 'laserLine', attackPreference: 'straight', title: '激光教鞭', isTemporaryBuff: false, upgradeRewardIds: ['reward_upgrade_laser_width'] },
	weapon_main_karate: { id: 'weapon_main_karate', attackPattern: 'karateStrike', attackPreference: 'straight', title: '空手道', isTemporaryBuff: false, upgradeRewardIds: [] }
};

export const KD_SKILL_CONFIGS: Record<SkillDefinitionId, {
	// KD_SKILL_CONFIGS：data/skill-definitions.ts 和 reward-pool.ts 的底层数据源。
	// 负责主动技能的“静态身份信息”：
	// - UI 名称 / 槽位标签 / 提示文案
	// - 最大等级
	// - 奖励池中的 rewardDefinitionId、权重、图标、优先级
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
}> = {
	skill_pulse: { id: 'skill_pulse', kind: 'pulse', title: '脉冲', slotLabel: 'H', hint: '按 H 释放范围脉冲，适合解围与小回复', maxLevel: 3, rewardDefinitionId: 'reward_skill_pulse', rewardOfferWeight: 0.82, rewardOfferIconGlyph: '◎', rewardOfferPriority: { new: 10, upgrade: 30 } },
	skill_dash: { id: 'skill_dash', kind: 'dash', title: '冲刺', slotLabel: 'J', hint: '按 J 沿移动方向冲刺，穿行造成伤害', maxLevel: 3, rewardDefinitionId: 'reward_skill_dash', rewardOfferWeight: 0.78, rewardOfferIconGlyph: '»', rewardOfferPriority: { new: 10, upgrade: 30 } },
	skill_karate: { id: 'skill_karate', kind: 'karate', title: '空手道', slotLabel: 'K', hint: '按 K 近战下劈，能打掉飞行物并概率反弹', maxLevel: 4, rewardDefinitionId: 'reward_skill_karate', rewardOfferWeight: 0.76, rewardOfferIconGlyph: '拳', rewardOfferPriority: { new: 10, upgrade: 30 } }
};

export const KD_BUILD_DEFAULTS = {
	// KD_BUILD_DEFAULTS：state/game-store.ts 初始化本局 build 时使用。
	// 负责定义：
	// - 开局自带哪些技能 / 武器等级
	// - 每个升级分支的默认数值（全部从 0/1 起步）
	// - 这些字段随后会被 progression-system、auto-attack-system、ability-system 读取和修改
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
		scatterBleedDamagePerTick: 0,
		scatterBleedTickIntervalMs: 0,
		scatterBleedMaxTicks: 0,
		scatterCloseKnockbackChance: 0,
		scatterCloseKnockback: 42,
		missileExplosionRadiusBonus: 0,
		missileBurningMs: 0,
		missileBurningDps: 0,
		laserRangeMultiplier: 1,
		laserWidthMultiplier: 1
	}
} as const;

export const KD_DROP_CONFIGS: Record<BattlefieldDropDefinitionId, {
	// KD_DROP_CONFIGS：data/drop-definitions.ts / battlefield-drop-system.ts / GameCanvas.svelte 使用。
	// 负责战场掉落的“静态展示与掉落权重”：
	// - kind、标题、短标签、地图字形
	// - 拾取后 HUD 反馈文案
	// - 掉落随机权重
	id: BattlefieldDropDefinitionId;
	kind: BattlefieldDropKind;
	title: string;
	shortLabel: string;
	arenaGlyph: string;
	pickupDetail: string;
	rollWeight: number;
}> = {
	drop_weapon_supply: { id: 'drop_weapon_supply', kind: 'weapon', title: '武备补给', shortLabel: '武器', arenaGlyph: '✦', pickupDetail: `下 ${BATTLEFIELD_DROP_WEAPON_USES} 次攻击强化`, rollWeight: 1 },
	drop_xp_crystal: { id: 'drop_xp_crystal', kind: 'xp', title: '经验结晶', shortLabel: '经验', arenaGlyph: '◎', pickupDetail: `${Math.round(BATTLEFIELD_DROP_EXP_BOOST_DURATION_MS / 1000)} 秒经验增幅`, rollWeight: 1 },
	drop_heal_pack: { id: 'drop_heal_pack', kind: 'heal', title: '急救包', shortLabel: '治疗', arenaGlyph: '+', pickupDetail: `恢复 ${BATTLEFIELD_DROP_HEAL_AMOUNT} 点生命`, rollWeight: 1 },
	drop_speed_tonic: { id: 'drop_speed_tonic', kind: 'speed', title: '疾行补剂', shortLabel: '移速', arenaGlyph: '»', pickupDetail: `${Math.round(MOVE_SPEED_DROP_DURATION_MS / 1000)} 秒移速提升`, rollWeight: 0.85 },
	drop_attack_manual: { id: 'drop_attack_manual', kind: 'attackSpeed', title: '速射手册', shortLabel: '攻速', arenaGlyph: '≋', pickupDetail: `${Math.round(ATTACK_SPEED_DROP_DURATION_MS / 1000)} 秒攻击提速`, rollWeight: 0.82 },
	drop_damage_core: { id: 'drop_damage_core', kind: 'damage', title: '火力核心', shortLabel: '伤害', arenaGlyph: '✹', pickupDetail: `${Math.round(DAMAGE_BOOST_DROP_DURATION_MS / 1000)} 秒伤害提高`, rollWeight: 0.78 },
	drop_guard_shield: { id: 'drop_guard_shield', kind: 'shield', title: '格挡护盾', shortLabel: '护盾', arenaGlyph: '◈', pickupDetail: '抵挡下一次受到的伤害', rollWeight: 0.72 },
	drop_reroll_coupon: { id: 'drop_reroll_coupon', kind: 'reroll', title: '重随机会', shortLabel: '改签', arenaGlyph: '↺', pickupDetail: '本局奖励面板重随机会 +1', rollWeight: 0.64 }
};

export const KD_REWARD_OFFER_CONFIGS: Partial<Record<RewardDefinitionId, { tag: string; iconGlyph: string; title: string; description: string; offerWeight: number; priority: number }>> = {
	// KD_REWARD_OFFER_CONFIGS：reward-pool.ts 与 RewardPanel.svelte 的主要文案来源。
	// 负责奖励面板里每个 rewardDefinitionId 的：
	// - tag（例如“升级 · 主武器”）
	// - 图标、标题、详细描述
	// - 出现权重和优先级
	// 注意：这里写的是“用户可见文案”，必须和 systems/progression-system.ts / ability-system.ts 的真实效果保持同步。
	reward_upgrade_straight_burst: { tag: '升级 · 主武器', iconGlyph: '+', title: '直线射击 · 连发 +1', description: '每次直射额外追加 1 发子弹。', offerWeight: 0.85, priority: 22 },
	reward_upgrade_straight_trajectory: { tag: '升级 · 主武器', iconGlyph: '≡', title: '直线射击 · 弹道 +1', description: '每次直射额外增加 1 条平行弹道。', offerWeight: 0.82, priority: 22 },
	reward_upgrade_straight_freeze: { tag: '升级 · 主武器', iconGlyph: '❄', title: '直线射击 · 冰冻附着', description: '子弹有 25% 概率将敌人减速至 60%，持续 1.6 秒。', offerWeight: 0.78, priority: 24 },
	reward_upgrade_straight_pierce: { tag: '升级 · 主武器', iconGlyph: '↯', title: '直线射击 · 穿透', description: '当前直射子弹额外穿透 +1，穿透后伤害衰减为原来的 60%。', offerWeight: 0.74, priority: 24 },
	reward_upgrade_scatter_pellets: { tag: '升级 · 主武器', iconGlyph: '+', title: '散射 · 数量 +1', description: '每次散射额外增加 1 发子弹。', offerWeight: 0.85, priority: 22 },
	reward_upgrade_scatter_knockback: { tag: '升级 · 主武器', iconGlyph: '⇠', title: '散射 · 近距击退', description: '90 像素内命中有 50% 概率击退目标 42 像素。', offerWeight: 0.78, priority: 24 },
	reward_upgrade_scatter_bleed: { tag: '升级 · 主武器', iconGlyph: '✹', title: '散射 · 流血', description: '命中附加流血：每 1 秒造成 3 点伤害，共 3 次；再次命中会刷新计数。', offerWeight: 0.76, priority: 24 },
	reward_upgrade_missile_radius: { tag: '升级 · 主武器', iconGlyph: '◎', title: '导弹 · 爆炸半径增加', description: '导弹爆炸半径 +22 像素。', offerWeight: 0.82, priority: 22 },
	reward_upgrade_missile_burn: { tag: '升级 · 主武器', iconGlyph: '≈', title: '导弹 · 灼烧区域', description: '导弹爆炸后在地面留下灼烧区域，持续 2 秒，每秒造成 10 点伤害。', offerWeight: 0.74, priority: 24 },
	reward_upgrade_laser_width: { tag: '升级 · 主武器', iconGlyph: '┃', title: '激光 · 宽度 +30%', description: '当前主武器激光粗度提升 30%。', offerWeight: 0.82, priority: 22 },
	reward_drone_acquire: { tag: '获取 · 无人机', iconGlyph: '✈', title: '无人机支援', description: '获得 1 架跟随无人机，自动攻击最近敌人。', offerWeight: 0.38, priority: 20 },
	reward_upgrade_drone_count: { tag: '升级 · 无人机', iconGlyph: '+', title: '无人机 · 数量 +1', description: '当前无人机数量 +1。', offerWeight: 0.42, priority: 24 },
	reward_upgrade_drone_attack_speed: { tag: '升级 · 无人机', iconGlyph: '≋', title: '无人机 · 攻速提升', description: '所有无人机攻击速度提升 20%。', offerWeight: 0.36, priority: 26 },
	reward_buff_move_speed: { tag: '增益 · 永久', iconGlyph: '»', title: '移速提升', description: '本局移速 +35%。', offerWeight: 0.7, priority: 52 },
	reward_buff_attack_speed: { tag: '增益 · 永久', iconGlyph: '≋', title: '攻速提升', description: '本局攻击速度 +35%。', offerWeight: 0.68, priority: 52 },
	reward_buff_damage: { tag: '增益 · 永久', iconGlyph: '✹', title: '伤害提升', description: '本局造成伤害 +40%。', offerWeight: 0.64, priority: 52 },
	reward_buff_shield: { tag: '增益 · 防护', iconGlyph: '◈', title: '格挡护盾', description: '获得 1 次格挡，抵挡下一次受到的伤害。', offerWeight: 0.62, priority: 54 },
	reward_weapon_upgrade: { tag: '补给 · 武器强化', iconGlyph: '✦', title: '武器强化', description: '接下来 3 次攻击获得强化弹幕。', offerWeight: 0.9, priority: 40 },
	reward_xp_boost: { tag: '增益 · 经验', iconGlyph: 'XP', title: '经验增幅', description: '60 秒内经验获取 +50%。', offerWeight: 0.72, priority: 50 }
};

type KDMonsterVisualState = 'idle' | 'move' | 'telegraph' | 'hurt';

// KD_MONSTER_SPRITE_SEQUENCES：ui/monster-sprites.ts 与 GameCanvas.svelte 使用。
// 负责不同难度怪物在 idle / move / telegraph / hurt 四种视觉状态下的贴图序列与帧时长。
export const KD_MONSTER_SPRITE_SEQUENCES = {
	easy: {
		idle: { frames: ['/knowledge-defense/monsters/easy/idle-1.svg', '/knowledge-defense/monsters/easy/idle-2.svg'], frameDurationMs: 420 },
		move: { frames: ['/knowledge-defense/monsters/easy/move-1.svg', '/knowledge-defense/monsters/easy/move-2.svg'], frameDurationMs: 150 },
		telegraph: { frames: ['/knowledge-defense/monsters/easy/telegraph-1.svg', '/knowledge-defense/monsters/easy/telegraph-2.svg'], frameDurationMs: 120 },
		hurt: { frames: ['/knowledge-defense/monsters/easy/hurt-1.svg'], frameDurationMs: 160 }
	},
	medium: {
		idle: { frames: ['/knowledge-defense/monsters/medium/idle-1.svg', '/knowledge-defense/monsters/medium/idle-2.svg'], frameDurationMs: 400 },
		move: { frames: ['/knowledge-defense/monsters/medium/move-1.svg', '/knowledge-defense/monsters/medium/move-2.svg'], frameDurationMs: 140 },
		telegraph: { frames: ['/knowledge-defense/monsters/medium/telegraph-1.svg', '/knowledge-defense/monsters/medium/telegraph-2.svg'], frameDurationMs: 110 },
		hurt: { frames: ['/knowledge-defense/monsters/medium/hurt-1.svg'], frameDurationMs: 160 }
	},
	hard: {
		idle: { frames: ['/knowledge-defense/monsters/hard/idle-1.svg', '/knowledge-defense/monsters/hard/idle-2.svg'], frameDurationMs: 380 },
		move: { frames: ['/knowledge-defense/monsters/hard/move-1.svg', '/knowledge-defense/monsters/hard/move-2.svg'], frameDurationMs: 130 },
		telegraph: { frames: ['/knowledge-defense/monsters/hard/telegraph-1.svg', '/knowledge-defense/monsters/hard/telegraph-2.svg'], frameDurationMs: 100 },
		hurt: { frames: ['/knowledge-defense/monsters/hard/hurt-1.svg'], frameDurationMs: 160 }
	}
} as const satisfies Record<'easy' | 'medium' | 'hard', Record<KDMonsterVisualState, { frames: readonly string[]; frameDurationMs: number }>>;

export const KD_AUDIO_ASSETS = {
	// KD_AUDIO_ASSETS：systems/audio-manager.ts 使用，负责知识防御模式内的音频资源路径映射。
	bgm: '/sounds/bgm.mp3',
	click: '/sounds/click.mp3',
	hit: '/sounds/hit.mp3',
	death: '/sounds/death.mp3',
	panel: '/sounds/panel.mp3'
} as const;

export function getTotalExpRequiredForLevel(level: number) {
	// getTotalExpRequiredForLevel：progression-system.ts / game-store.ts / GameCanvas.svelte 使用。
	// 负责统一经验曲线，确保升级判定、初始 nextLevelTotalExp 和经验条展示都按同一公式计算。
	if (level <= 1) return 0;
	return 10 * (2 ** (level - 1) - 1);
}
