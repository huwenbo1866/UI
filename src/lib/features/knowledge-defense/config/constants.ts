// src/lib/features/knowledge-defense/config/constants.ts

import type { AttackPreference } from '../core/types';

export const PLAYFIELD_MIN_HEIGHT = 760;                    // 游戏战场最小高度（像素）

export const MAX_ALIVE_MONSTERS = 8;                        // 场上最多同时存在的怪物数量

// ==================== 玩家参数 ====================
export const PLAYER_MAX_HP = 200;                           // 玩家最大血量
export const PLAYER_RADIUS = 34;                            // 玩家碰撞半径（像素）
export const PLAYER_SPEED = 80;                            // 玩家移动速度（像素/秒）
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

// 新增：怪物贴身时对玩家的持续伤害
export const MONSTER_CONTACT_DAMAGE_PER_SECOND = 30;        // 怪物贴身时每秒扣血量

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

// ==================== 音效控制（系统化开关）===================
export const ENABLE_AUDIO = false;                           // 总音效开关（关闭后所有音效失效）

export const ENABLE_BGM = true;                             // 背景音乐开关
export const ENABLE_CLICK_SOUND = true;                     // 按钮点击音效开关
export const ENABLE_HIT_SOUND = true;                       // 怪物被击中音效开关
export const ENABLE_DEATH_SOUND = true;                     // 怪物死亡音效开关
export const ENABLE_PANEL_SOUND = true;                     // 面板打开/关闭音效开关

export function getTotalExpRequiredForLevel(level: number) {
  if (level <= 1) return 0;
  return 10 * (2 ** (level - 1) - 1);
}