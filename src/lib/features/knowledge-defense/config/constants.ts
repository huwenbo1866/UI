// src/lib/features/knowledge-defense/config/constants.ts

import type { AttackPreference } from '../core/types';

export const PLAYFIELD_MIN_HEIGHT = 760; // 游戏战场最小高度（像素）

export const MAX_ALIVE_MONSTERS = 8; // 场上最多同时存在的怪物数量

// ==================== 玩家参数 ====================
export const PLAYER_MAX_HP = 200; // 玩家最大血量
export const PLAYER_RADIUS = 34; // 玩家碰撞半径（像素）
export const PLAYER_SPEED = 80; // 玩家移动速度（像素/秒）
export const PLAYER_CONTACT_IFRAME_MS = 700; // 玩家被怪物接触后的无敌时间（毫秒）

// ==================== 怪物参数 ====================
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

export const SCATTER7_PELLET_COUNT = 7; // 7发散射子弹数量
export const SCATTER7_SPREAD_RADIANS = (Math.PI / 180) * 36; // 7发散射角度
export const SCATTER7_PELLET_DAMAGE = 16; // 7发散射子弹伤害

// ==================== 奖励 & 无人机 ====================
export const EXP_PER_KILL = 10; // 击杀怪物获得的基础经验
export const EXP_BOOST_MULTIPLIER = 1.5; // 经验增幅奖励倍率
export const EXP_BOOST_DURATION_MS = 60_000; // 经验增幅持续时间（毫秒）
export const BATTLEFIELD_DROP_EXP_BOOST_DURATION_MS = 20_000; // 战场经验掉落持续时间
export const BATTLEFIELD_DROP_HEAL_AMOUNT = 28; // 战场治疗掉落回复量
export const BATTLEFIELD_DROP_WEAPON_USES = 2; // 战场武器掉落强化次数
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

// ==================== 音效控制（系统化开关）===================
export const ENABLE_AUDIO = false; // 总音效开关（关闭后所有音效失效）

export const ENABLE_BGM = true; // 背景音乐开关
export const ENABLE_CLICK_SOUND = true; // 按钮点击音效开关
export const ENABLE_HIT_SOUND = true; // 怪物被击中音效开关
export const ENABLE_DEATH_SOUND = true; // 怪物死亡音效开关
export const ENABLE_PANEL_SOUND = true; // 面板打开/关闭音效开关

// ==================== 错题分析 AI 配置 ====================
export const ENABLE_AI_WRONG_QUESTION_ANALYSIS = true; // 是否开启 AI 分析（总开关）

// ==================== 自定义大模型配置 ====================
export const AI_BASE_URL = 'https://api.siliconflow.cn/v1';
export const AI_API_KEY = 'sk-viymlevjwnpccmttywzsafqigacubewqnqouzgcbroijzycl';
export const AI_MODEL = 'deepseek-ai/DeepSeek-V3.2';

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

export function getTotalExpRequiredForLevel(level: number) {
	if (level <= 1) return 0;
	return 10 * (2 ** (level - 1) - 1);
}
