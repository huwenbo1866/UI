import type { AttackPreference, Question, QuestionPack, RewardChoice, RewardKind } from '../core/types';
import { uid } from '../core/utils';
import {
  KD_ADAPTIVE_BASE_WEIGHT_UNSEEN,
  KD_ADAPTIVE_MISS_RATE_FACTOR,
  KD_ADAPTIVE_RECENT_WRONG_BONUS,
  KD_ADAPTIVE_VOLUME_BONUS_MAX,
  KD_ADAPTIVE_VOLUME_BONUS_PER_ATTEMPT
} from '../config/constants';

function getRewardMeta(attackPreference: AttackPreference): Record<RewardKind, { title: string; description: string }> {
  return {
    weapon: {
      title: attackPreference === 'straight' ? '武器强化 · 4 连发直射' : '武器强化 · 7 发散射',
      description:
        attackPreference === 'straight'
          ? '答对后，接下来 3 次攻击强化为 4 连发直射。'
          : '答对后，接下来 3 次攻击强化为 7 发散射。'
    },
    xp: {
      title: '经验增幅',
      description: '答对后，接下来 1 分钟获得的经验提高 50%。'
    },
    drone: {
      title: '武器无人机',
      description: '答对后新增 1 架无人机，会主动接近怪物并发射 50 伤害激光。'
    }
  };
}

export function buildRewardChoices(pack: QuestionPack, attackPreference: AttackPreference): RewardChoice[] {
  const picked: Question[] = pickAdaptiveQuestions(pack.questions, 3, 0);
  return buildChoicesByPicked(pack, attackPreference, picked);
}

export function buildRewardChoicesWithRound(
  pack: QuestionPack,
  attackPreference: AttackPreference,
  round: number
): RewardChoice[] {
  const picked: Question[] = pickAdaptiveQuestions(pack.questions, 3, round);
  return buildChoicesByPicked(pack, attackPreference, picked);
}

function buildChoicesByPicked(
  pack: QuestionPack,
  attackPreference: AttackPreference,
  picked: Question[]
): RewardChoice[] {
  const kinds: RewardKind[] = ['weapon', 'xp', 'drone'];
  const meta = getRewardMeta(attackPreference);
  return kinds.map((rewardKind, index) => ({
    id: uid(`reward_${rewardKind}`),
    rewardKind,
    title: meta[rewardKind].title,
    description: meta[rewardKind].description,
    question: picked[index] ?? pack.questions[index % pack.questions.length]
  }));
}

function pickAdaptiveQuestions(questions: Question[], count: number, round: number): Question[] {
  const byCooldown = questions.filter((item) => {
    const lockRound = Number(item.performance?.cooldown_until_round ?? 0);
    return lockRound <= round;
  });

  const pool = [...(byCooldown.length >= count ? byCooldown : questions)];
  const result: Question[] = [];

  while (pool.length > 0 && result.length < count) {
    const totalWeight = pool.reduce((sum, item) => sum + getQuestionWeight(item), 0);
    let cursor = Math.random() * (totalWeight || 1);
    let pickedIndex = 0;

    for (let i = 0; i < pool.length; i += 1) {
      cursor -= getQuestionWeight(pool[i]);
      if (cursor <= 0) {
        pickedIndex = i;
        break;
      }
    }

    const [picked] = pool.splice(pickedIndex, 1);
    if (picked) {
      result.push(picked);
    }
  }

  return result;
}

function getQuestionWeight(question: Question): number {
  const perf = question.performance;
  if (!perf || perf.attempts <= 0) {
    return KD_ADAPTIVE_BASE_WEIGHT_UNSEEN;
  }

  const missRate = 1 - Math.max(0, Math.min(1, perf.accuracy || 0));
  const recencyBoost = perf.last_result === 'wrong' ? KD_ADAPTIVE_RECENT_WRONG_BONUS : 0;
  const volumeBoost = Math.min(
    KD_ADAPTIVE_VOLUME_BONUS_MAX,
    perf.attempts * KD_ADAPTIVE_VOLUME_BONUS_PER_ATTEMPT
  );
  return 1 + missRate * KD_ADAPTIVE_MISS_RATE_FACTOR + recencyBoost + volumeBoost;
}