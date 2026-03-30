import {
  AUTO_ATTACK_COOLDOWN_MS,
  DEFAULT_ATTACK_PREFERENCE,
  MONSTER_SPAWN_INTERVAL_MS,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  TIME_SCALE_NORMAL,
  getTotalExpRequiredForLevel
} from '../config/constants';
import type { AttackPreference, GameState, QuestionPack } from '../core/types';

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
    player: {
      x: width / 2,
      y: height / 2,
      radius: PLAYER_RADIUS,
      speed: PLAYER_SPEED,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      contactInvulnMs: 0,
      hurtFlashMs: 0
    },
    monsters: [],
    projectiles: [],
    drones: [],
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
      queuedWeaponBuffUses: 0,
      expBoostUntil: 0
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
      rewardFeedback: null,
      rewardFeedbackKind: null
    },
    runtime: {
      running: false,
      timeScale: TIME_SCALE_NORMAL,
      spawnCooldownMs: MONSTER_SPAWN_INTERVAL_MS,
      attackCooldownMs: AUTO_ATTACK_COOLDOWN_MS
    }
  };
}