import type { AttackPreference, Question, QuestionPack, RewardChoice, RewardKind } from '../core/types';
import { takeRandomDistinct, uid } from '../core/utils';

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
  const picked: Question[] = takeRandomDistinct(pack.questions, 3);
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
