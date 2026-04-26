// src/lib/features/knowledge-defense/config/constants.ts

import type { AttackPreference } from '../core/types';

export const PLAYFIELD_MIN_HEIGHT = 760;                    // 游戏战场最小高度（像素）

export const MAX_ALIVE_MONSTERS = 8;                        // 场上最多同时存在的怪物数量

// ==================== 玩家参数 ====================
export const PLAYER_MAX_HP = 200;                           // 玩家最大血量
export const PLAYER_RADIUS = 34;                            // 玩家碰撞半径（像素）
export const PLAYER_SPEED = 80;                             // 玩家移动速度（像素/秒）
export const PLAYER_CONTACT_IFRAME_MS = 700;                // 玩家被怪物接触后的无敌时间（毫秒）

// ==================== 怪物参数 ====================
export const MONSTER_SPAWN_INTERVAL_MS = 1250;              // 怪物刷新间隔（毫秒）

export const MONSTER_BASE_SPEED = {                         // 怪物基础移动速度（按难度区分）
  easy: 45,
  medium: 50,
  hard: 60
} as const;

export const MONSTER_HP = {                                 // 怪物血量（按难度区分）
  easy: 100,
  medium: 180,
  hard: 300
} as const;

export const MONSTER_RADIUS = {                             // 怪物碰撞半径（像素，按难度区分）
  easy: 22,
  medium: 26,
  hard: 30
} as const;

export const MONSTER_DAMAGE = {                             // 怪物对玩家的伤害（按难度区分）
  easy: 40,
  medium: 60,
  hard: 80
} as const;
export const MONSTER_ATTACK_INTERVAL_MS = 1200;             // 怪物近战攻击间隔
export const MONSTER_ATTACK_WINDUP_MS = 320;                // 怪物攻击前摇（给玩家反应窗口）

// ==================== 攻击参数 ====================
export const AUTO_ATTACK_COOLDOWN_MS = 1000;                // 自动攻击冷却时间（毫秒）
export const DEFAULT_ATTACK_PREFERENCE: AttackPreference = 'straight'; // 默认攻击模式

export const PROJECTILE_SPEED = 800;                        // 子弹飞行速度（像素/秒）
export const BASE_PROJECTILE_RADIUS = 7;                    // 子弹碰撞半径（像素）

export const BASE_STRAIGHT_DAMAGE = 30;                     // 普通直线攻击伤害
export const BASE_SCATTER_PELLET_COUNT = 3;                 // 普通散射子弹数量
export const BASE_SCATTER_PELLET_DAMAGE = 16;               // 普通散射子弹伤害
export const BASE_SCATTER_SPREAD_RADIANS = (Math.PI / 180) * 18; // 普通散射角度

export const STRAIGHT4_SHOT_INTERVAL_MS = 160;              // 4连发直线攻击间隔（毫秒）
export const STRAIGHT4_DAMAGE = [24, 28, 34, 42];           // 4连发每发伤害

export const SCATTER7_PELLET_COUNT = 7;                     // 7发散射子弹数量
export const SCATTER7_SPREAD_RADIANS = (Math.PI / 180) * 36; // 7发散射角度
export const SCATTER7_PELLET_DAMAGE = 16;                   // 7发散射子弹伤害

// ==================== 奖励 & 无人机 ====================
export const EXP_PER_KILL = 10;                             // 击杀怪物获得的基础经验
export const EXP_BOOST_MULTIPLIER = 1.5;                    // 经验增幅奖励倍率
export const EXP_BOOST_DURATION_MS = 60_000;                // 经验增幅持续时间（毫秒）

export const TIME_SCALE_NORMAL = 1;                         // 正常游戏速度倍率
export const TIME_SCALE_REWARD_PANEL = 1 / 12;              // 奖励面板打开时游戏速度倍率（暂停效果）

export const WEAPON_REWARD_USES = 3;                        // 武器强化奖励可使用次数

export const DRONE_DAMAGE = 50;                             // 无人机攻击伤害
export const DRONE_SPEED = 180;                             // 无人机移动速度
export const DRONE_COOLDOWN_MS = 3000;                      // 无人机攻击冷却时间（毫秒）
export const DRONE_ENGAGE_RANGE = 92;                       // 无人机攻击距离（像素）
export const DRONE_ORBIT_DISTANCE = 62;                     // 添加无人机时的初始环绕距离
export const DRONE_PATROL_RADIUS = 200;                     // 无怪物时无人机的巡逻半径

// ==================== 主动技能（脉冲爆发）====================
export const ABILITY_COOLDOWN_MS = 16_000;                  // 主动技能冷却（毫秒）
export const ABILITY_PULSE_RADIUS = 170;                    // 主动技能作用半径（像素）
export const ABILITY_PULSE_DAMAGE = 80;                     // 主动技能基础伤害
export const ABILITY_PULSE_KNOCKBACK = 68;                  // 主动技能击退距离（像素）
export const ABILITY_PULSE_IFRAME_MS = 450;                 // 释放后短暂无敌（毫秒）
export const ABILITY_PULSE_HEAL_ON_HIT = 6;                 // 命中每个怪物回复生命
export const ABILITY_PULSE_MAX_HEAL = 36;                   // 单次释放最大回复

// ==================== 音效控制（系统化开关）===================
export const ENABLE_AUDIO = false;                           // 总音效开关（关闭后所有音效失效）

export const ENABLE_BGM = true;                             // 背景音乐开关
export const ENABLE_CLICK_SOUND = true;                     // 按钮点击音效开关
export const ENABLE_HIT_SOUND = true;                       // 怪物被击中音效开关
export const ENABLE_DEATH_SOUND = true;                     // 怪物死亡音效开关
export const ENABLE_PANEL_SOUND = true;                     // 面板打开/关闭音效开关

// ==================== 错题分析 AI 配置 ====================
export const ENABLE_AI_WRONG_QUESTION_ANALYSIS = true;      // 是否开启 AI 分析（总开关）

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
export const KD_ENABLE_DEBUG_LOGS = true;                  // 是否输出知识闯关的调试日志
export const KD_SYNC_BATCH_SIZE = 6;                       // 累积多少次答题后立即回写
export const KD_SYNC_DEFER_MS = 12_000;                    // 未达到批次时的延迟回写时间
export const KD_CHAPTER_MAX_QUESTIONS = 50;                // 章节题库最大题量

export const KD_MASTERY_STREAK_TO_REMOVE = 2;              // 连续答对达到该次数后从强化池移除
export const KD_CORRECT_COOLDOWN_ROUNDS = 9;               // 普通答对后的冷却轮次
export const KD_MASTERED_COOLDOWN_ROUNDS = 14;             // 连续答对达标后的更长冷却轮次
export const KD_WRONG_COOLDOWN_MIN_ROUNDS = 4;             // 答错后的最小冷却轮次
export const KD_WRONG_COOLDOWN_MAX_ROUNDS = 9;             // 答错后的最大冷却轮次
export const KD_WRONG_COOLDOWN_BASE = 3;                   // 答错冷却基础值（叠加 wrong 次数）

export const KD_AMPLIFY_PER_WRONG_MIN = 1;                 // 错题最少生成同类型强化题量
export const KD_AMPLIFY_PER_WRONG_MAX = 3;                 // 错题最多生成同类型强化题数量
export const KD_AMPLIFY_ORDER_OFFSET = 1000;               // 强化题排序偏移，确保排在后面

export const KD_ADAPTIVE_BASE_WEIGHT_UNSEEN = 1.4;         // 未做过题目的基础权重
export const KD_ADAPTIVE_MISS_RATE_FACTOR = 1.6;           // 错误率权重系数
export const KD_ADAPTIVE_RECENT_WRONG_BONUS = 0.35;        // 最近答错加权
export const KD_ADAPTIVE_VOLUME_BONUS_PER_ATTEMPT = 0.04;  // 做题次数加权步进
export const KD_ADAPTIVE_VOLUME_BONUS_MAX = 0.35;          // 做题次数加权上限

export const KD_REINFORCE_PROMPT_VARIANTS = [               // 错题强化题干变式文案
  '变式训练',
  '同场景迁移',
  '易错点再练',
  '对比辨析',
  '小测巩固'
] as const;

export const KD_REINFORCE_FALLBACK_DISTRACTORS = [          // 干扰项补位（选项不够时）
  '以上都不对',
  '题干信息不足',
  '需结合教材上下文判断',
  '需要二次推理'
] as const;

export function getTotalExpRequiredForLevel(level: number) {
  if (level <= 1) return 0;
  return 10 * (2 ** (level - 1) - 1);
}
