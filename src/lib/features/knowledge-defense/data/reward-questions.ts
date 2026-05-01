import type { GameState, Question, RewardChoice } from '../core/types';
import { uid } from '../core/utils';
import {
  KD_ADAPTIVE_BASE_WEIGHT_UNSEEN,
  KD_ADAPTIVE_MISS_RATE_FACTOR,
  KD_ADAPTIVE_RECENT_WRONG_BONUS,
	KD_ADAPTIVE_VOLUME_BONUS_MAX,
	KD_ADAPTIVE_VOLUME_BONUS_PER_ATTEMPT
} from '../config/constants';
import { buildRewardOffers } from './reward-pool';

export function buildRewardChoicesWithRound(
	state: GameState,
	round: number,
	rerollCount = 0,
	count = 3,
	options: {
		excludedRewardDefinitionIds?: string[];
		excludedQuestionIds?: string[];
	} = {}
): RewardChoice[] {
	const pack = state.pack;
	const buildSeed = `${state.loadout.mainWeaponId}:${Object.entries(state.build.skillLevels)
		.map(([k, v]) => `${k}:${v}`)
		.join('|')}`;
	const random = createSeededRandom(`${pack.id}:${buildSeed}:${round}:${rerollCount}:${pack.questions.length}`);
	const picked: Question[] = pickAdaptiveQuestions(
		pack.questions,
		count,
		round,
		random,
		options.excludedQuestionIds ?? []
	);
	const offers = buildRewardOffers(
		state,
		random,
		count,
		(options.excludedRewardDefinitionIds as GameState['ui']['recentRewardDefinitionIds']) ?? []
	);

	return offers.map((offer, index) => ({
		id: uid(`reward_${offer.rewardKind}`),
		rewardDefinitionId: offer.rewardDefinitionId,
		rewardKind: offer.rewardKind,
		tag: offer.tag,
		iconGlyph: offer.iconGlyph,
		levelFrom: offer.levelFrom,
		levelTo: offer.levelTo,
		title: offer.title,
		description: offer.description,
		question: picked[index] ?? pack.questions[index % pack.questions.length]
	}));
}

function pickAdaptiveQuestions(
	questions: Question[],
	count: number,
	round: number,
	random: () => number,
	excludedQuestionIds: string[] = []
): Question[] {
  const byCooldown = questions.filter((item) => {
    const lockRound = Number(item.performance?.cooldown_until_round ?? 0);
    return lockRound <= round;
  });

  const candidatePool = byCooldown.length >= count ? byCooldown : questions;
  const eligiblePool = candidatePool.filter((item) => !excludedQuestionIds.includes(item.id));
  const pool = [...(eligiblePool.length >= count ? eligiblePool : candidatePool)];
  const result: Question[] = [];

  while (pool.length > 0 && result.length < count) {
    const totalWeight = pool.reduce((sum, item) => sum + getQuestionWeight(item), 0);
		 let cursor = random() * (totalWeight || 1);
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

function createSeededRandom(seedInput: string): () => number {
	let seed = 2166136261;
	for (let index = 0; index < seedInput.length; index += 1) {
		seed ^= seedInput.charCodeAt(index);
		seed = Math.imul(seed, 16777619);
	}

	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
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
