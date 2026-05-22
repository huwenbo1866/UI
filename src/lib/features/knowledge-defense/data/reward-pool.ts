import type { GameState, RewardChoice, RewardDefinitionId, RewardKind, SkillDefinitionId } from '../core/types';
import { KD_DRONE_TUNING, KD_REWARD_OFFER_CONFIGS, KD_SKILL_CONFIGS, KD_WEAPON_TUNING } from '../config/constants';
import { getSkillDefinition } from './skill-definitions';

type RewardOffer = Pick<
	RewardChoice,
	'rewardDefinitionId' | 'rewardKind' | 'title' | 'description' | 'tag' | 'iconGlyph' | 'levelFrom' | 'levelTo'
> & {
	offerWeight: number;
	priority: number;
};

function buildStaticRewardOffer(rewardDefinitionId: RewardDefinitionId, rewardKind: RewardKind): RewardOffer {
	const config = KD_REWARD_OFFER_CONFIGS[rewardDefinitionId];
	if (!config) {
		throw new Error(`Missing reward offer config: ${rewardDefinitionId}`);
	}

	return {
		rewardDefinitionId,
		rewardKind,
		tag: config.tag,
		iconGlyph: config.iconGlyph,
		title: config.title,
		description: config.description,
		offerWeight: config.offerWeight,
		priority: config.priority
	};
}

function hasEmptyActionSlot(state: GameState) {
	return Object.values(state.loadout.actionSlots).some((value) => value === null);
}

function skillLevel(state: GameState, id: SkillDefinitionId) {
	return Math.max(0, state.build.skillLevels[id] ?? 0);
}

function buildSkillOffer(
	state: GameState,
	skillId: SkillDefinitionId,
	weight: number
): RewardOffer | null {
	const def = getSkillDefinition(skillId);
	const current = skillLevel(state, skillId);
	const next = Math.min(def.maxLevel, current + 1);
	if (next <= 0 || next === current) return null;

	const isNew = current <= 0;
	if (isNew && !hasEmptyActionSlot(state)) return null;
	const description = resolveSkillOfferDescription(skillId, current, next, isNew);

	return {
		rewardDefinitionId: def.rewardDefinitionId,
		rewardKind: 'skill',
		tag: isNew ? '获取 · 技能' : '升级 · 技能',
		iconGlyph: def.rewardOfferIconGlyph,
		title: def.title,
		description,
		levelFrom: isNew ? 0 : current,
		levelTo: next,
		offerWeight: weight,
		priority: isNew ? def.rewardOfferPriority.new : def.rewardOfferPriority.upgrade
	};
}

function resolveSkillOfferDescription(
	skillId: SkillDefinitionId,
	current: number,
	next: number,
	isNew: boolean
) {
	if (skillId === 'skill_pulse') {
		if (next === 2) {
			return '脉冲当前冷却时间减少 20%。';
		}
		if (next === 3) {
			return '脉冲范围扩大为当前的 150%。';
		}
	}

	if (skillId === 'skill_dash') {
		if (isNew) {
			return '获取技能冲刺，向前冲刺一段距离并对沿路怪物造成伤害。';
		}
		if (current === 1 && next === 2) {
			return '当前冲刺技能冷却时间减少 20%。';
		}
		if (current === 2 && next === 3) {
			return '当前冲刺技能的冲刺距离变长 20%。';
		}
	}

	return isNew ? `获得技能并自动挂入空槽（H/J/K/L）。` : '提升当前技能等级并刷新对应槽位冷却。';
}

function buildMainWeaponUpgradeOffers(state: GameState): RewardOffer[] {
	const weaponId = state.loadout.mainWeaponId;
	const mods = state.build.mods;
	const offers: RewardOffer[] = [];

	if (weaponId === 'weapon_main_straight') {
		if (mods.straightBurstExtra < KD_WEAPON_TUNING.straight.upgradeMaxBurstExtra) {
			offers.push(buildStaticRewardOffer('reward_upgrade_straight_burst', 'weapon'));
		}
		if (mods.straightTrajectories < KD_WEAPON_TUNING.straight.upgradeMaxTrajectories) {
			offers.push(buildStaticRewardOffer('reward_upgrade_straight_trajectory', 'weapon'));
		}
		if (mods.straightFreezeChance <= 0) {
			offers.push(buildStaticRewardOffer('reward_upgrade_straight_freeze', 'weapon'));
		}
		if (mods.straightPierce < KD_WEAPON_TUNING.straight.pierceMax) {
			offers.push(buildStaticRewardOffer('reward_upgrade_straight_pierce', 'weapon'));
		}
	}

	if (weaponId === 'weapon_main_scatter') {
		if (mods.scatterExtraPellets < KD_WEAPON_TUNING.scatter.upgradeMaxExtraPellets) {
			offers.push(buildStaticRewardOffer('reward_upgrade_scatter_pellets', 'weapon'));
		}
		if (mods.scatterCloseKnockbackChance <= 0) {
			offers.push(buildStaticRewardOffer('reward_upgrade_scatter_knockback', 'weapon'));
		}
		if (mods.scatterBleedDamagePerTick <= 0) {
			offers.push(buildStaticRewardOffer('reward_upgrade_scatter_bleed', 'weapon'));
		}
	}

	if (weaponId === 'weapon_main_missile') {
		if (mods.missileExplosionRadiusBonus < KD_WEAPON_TUNING.missile.upgradeRadiusCap) {
			offers.push(buildStaticRewardOffer('reward_upgrade_missile_radius', 'weapon'));
		}
		if (mods.missileBurningMs <= 0) {
			offers.push(buildStaticRewardOffer('reward_upgrade_missile_burn', 'weapon'));
		}
	}

	if (weaponId === 'weapon_main_laser') {
		if (mods.laserWidthMultiplier < KD_WEAPON_TUNING.laser.upgradeWidthCap) {
			offers.push(buildStaticRewardOffer('reward_upgrade_laser_width', 'weapon'));
		}
	}

	const droneCount = state.drones.length;
	let droneOffer: RewardOffer;
	if (droneCount === 0) {
		droneOffer = buildStaticRewardOffer('reward_drone_acquire', 'drone');
	} else if (droneCount < KD_DRONE_TUNING.maxActive) {
		droneOffer = buildStaticRewardOffer('reward_upgrade_drone_count', 'drone');
	} else {
		droneOffer = buildStaticRewardOffer('reward_upgrade_drone_attack_speed', 'drone');
	}
	offers.push(droneOffer);

	return offers;
}

export function buildRewardOffers(
	state: GameState,
	random: () => number,
	count: number,
	excludedRewardDefinitionIds: RewardDefinitionId[] = []
): RewardOffer[] {
	const candidates: RewardOffer[] = [];

	const pulseOffer = buildSkillOffer(state, 'skill_pulse', KD_SKILL_CONFIGS.skill_pulse.rewardOfferWeight);
	if (pulseOffer) candidates.push(pulseOffer);
	const dashOffer = buildSkillOffer(state, 'skill_dash', KD_SKILL_CONFIGS.skill_dash.rewardOfferWeight);
	if (dashOffer) candidates.push(dashOffer);
	// 空手道只保留在启动页选择，不在战斗奖励中出现
	// const karateOffer = buildSkillOffer(state, 'skill_karate', KD_SKILL_CONFIGS.skill_karate.rewardOfferWeight);
	// if (karateOffer) candidates.push(karateOffer);

	// main weapon upgrades
	candidates.push(...buildMainWeaponUpgradeOffers(state));

	// always-available tactical rewards
	candidates.push(
		buildStaticRewardOffer('reward_weapon_upgrade', 'weapon'),
		buildStaticRewardOffer('reward_xp_boost', 'xp'),
		buildStaticRewardOffer('reward_buff_move_speed', 'buff'),
		buildStaticRewardOffer('reward_buff_attack_speed', 'buff'),
		buildStaticRewardOffer('reward_buff_damage', 'buff'),
		buildStaticRewardOffer('reward_buff_shield', 'buff')
	);

	const eligibleCandidates = candidates.filter(
		(item) => !excludedRewardDefinitionIds.includes(item.rewardDefinitionId)
	);
	const pool = eligibleCandidates.length >= count ? [...eligibleCandidates] : [...candidates];
	const picked: RewardOffer[] = [];
	while (pool.length > 0 && picked.length < count) {
		const index = Math.floor(random() * pool.length);
		const [item] = pool.splice(index, 1);
		if (item) picked.push(item);
	}

	return picked;
}
