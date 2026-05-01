import type { GameState, RewardChoice, RewardDefinitionId, RewardKind, SkillDefinitionId } from '../core/types';
import { getSkillDefinition } from './skill-definitions';

type RewardOffer = Pick<
	RewardChoice,
	'rewardDefinitionId' | 'rewardKind' | 'title' | 'description' | 'tag' | 'iconGlyph' | 'levelFrom' | 'levelTo'
> & {
	offerWeight: number;
	priority: number;
};

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

	return {
		rewardDefinitionId:
			skillId === 'skill_pulse'
				? 'reward_skill_pulse'
				: skillId === 'skill_dash'
					? 'reward_skill_dash'
					: 'reward_skill_karate',
		rewardKind: 'skill',
		tag: isNew ? '获取 · 技能' : '升级 · 技能',
		iconGlyph: skillId === 'skill_pulse' ? '◎' : skillId === 'skill_dash' ? '»' : '拳',
		title: def.title,
		description: isNew
			? `获得 ${def.title} 并自动挂入空槽（H/J/K/L）。`
			: `提升 ${def.title} 等级，强化效果并刷新对应槽位冷却。`,
		levelFrom: isNew ? 0 : current,
		levelTo: next,
		offerWeight: weight,
		priority: isNew ? 10 : 30
	};
}

function buildMainWeaponUpgradeOffers(state: GameState): RewardOffer[] {
	const weaponId = state.loadout.mainWeaponId;
	const mods = state.build.mods;
	const offers: RewardOffer[] = [];

	if (weaponId === 'weapon_main_straight') {
		if (mods.straightBurstExtra < 2) {
			offers.push({
				rewardDefinitionId: 'reward_upgrade_straight_burst',
				rewardKind: 'weapon',
				tag: '升级 · 主武器',
				iconGlyph: '+',
				title: '直线射击 · 连发 +1',
				description: '每次发射额外增加一发（稳定输出）。',
				offerWeight: 0.85,
				priority: 22
			});
		}
		if (mods.straightTrajectories < 2) {
			offers.push({
				rewardDefinitionId: 'reward_upgrade_straight_trajectory',
				rewardKind: 'weapon',
				tag: '升级 · 主武器',
				iconGlyph: '≡',
				title: '直线射击 · 弹道 +1',
				description: '增加平行弹道，提高覆盖。',
				offerWeight: 0.82,
				priority: 22
			});
		}
		if (mods.straightFreezeChance <= 0) {
			offers.push({
				rewardDefinitionId: 'reward_upgrade_straight_freeze',
				rewardKind: 'weapon',
				tag: '升级 · 主武器',
				iconGlyph: '❄',
				title: '直线射击 · 冰冻附着',
				description: '子弹有 25% 概率减速敌人一段时间。',
				offerWeight: 0.78,
				priority: 24
			});
		}
		if (mods.straightPierce < 2) {
			offers.push({
				rewardDefinitionId: 'reward_upgrade_straight_pierce',
				rewardKind: 'weapon',
				tag: '升级 · 主武器',
				iconGlyph: '↯',
				title: '直线射击 · 穿透',
				description: '子弹可穿透敌人，但每次穿透后伤害衰减。',
				offerWeight: 0.74,
				priority: 24
			});
		}
	}

	if (weaponId === 'weapon_main_scatter') {
		if (mods.scatterExtraPellets < 3) {
			offers.push({
				rewardDefinitionId: 'reward_upgrade_scatter_pellets',
				rewardKind: 'weapon',
				tag: '升级 · 主武器',
				iconGlyph: '+',
				title: '散射 · 数量 +1',
				description: '每次散射额外增加一发子弹。',
				offerWeight: 0.85,
				priority: 22
			});
		}
		if (mods.scatterCloseKnockbackChance <= 0) {
			offers.push({
				rewardDefinitionId: 'reward_upgrade_scatter_knockback',
				rewardKind: 'weapon',
				tag: '升级 · 主武器',
				iconGlyph: '⇠',
				title: '散射 · 近距击退',
				description: '近距离命中时有概率触发击退，帮你解围。',
				offerWeight: 0.78,
				priority: 24
			});
		}
		if (mods.scatterBleedDps <= 0) {
			offers.push({
				rewardDefinitionId: 'reward_upgrade_scatter_bleed',
				rewardKind: 'weapon',
				tag: '升级 · 主武器',
				iconGlyph: '✹',
				title: '散射 · 流血',
				description: '命中后附加短暂持续伤害。',
				offerWeight: 0.76,
				priority: 24
			});
		}
	}

	if (weaponId === 'weapon_main_missile') {
		if (mods.missileExplosionRadiusBonus < 66) {
			offers.push({
				rewardDefinitionId: 'reward_upgrade_missile_radius',
				rewardKind: 'weapon',
				tag: '升级 · 主武器',
				iconGlyph: '◎',
				title: '导弹 · 爆炸半径增加',
				description: '爆炸影响更大范围的敌人。',
				offerWeight: 0.82,
				priority: 22
			});
		}
		if (mods.missileBurningMs <= 0) {
			offers.push({
				rewardDefinitionId: 'reward_upgrade_missile_burn',
				rewardKind: 'weapon',
				tag: '升级 · 主武器',
				iconGlyph: '≈',
				title: '导弹 · 灼烧区域',
				description: '爆炸后留下短暂灼烧区域，对范围内敌人持续伤害。',
				offerWeight: 0.74,
				priority: 24
			});
		}
	}

	if (weaponId === 'weapon_main_laser') {
		if (mods.laserWidthMultiplier < 1.55) {
			offers.push({
				rewardDefinitionId: 'reward_upgrade_laser_width',
				rewardKind: 'weapon',
				tag: '升级 · 主武器',
				iconGlyph: '┃',
				title: '激光 · 宽度 +30%',
				description: '扩大激光命中宽度，清线更稳。',
				offerWeight: 0.82,
				priority: 22
			});
		}
	}

	const droneCount = state.drones.length;
	let droneOffer: RewardOffer;
	if (droneCount === 0) {
		droneOffer = {
			rewardDefinitionId: 'reward_drone_acquire',
			rewardKind: 'drone',
			tag: '获取 · 无人机',
			iconGlyph: '✈',
			title: '无人机支援',
			description: '获得 1 架跟随无人机，自动攻击最近敌人。',
			offerWeight: 0.38,
			priority: 20
		};
	} else if (droneCount < 3) {
		droneOffer = {
			rewardDefinitionId: 'reward_upgrade_drone_count',
			rewardKind: 'drone',
			tag: '升级 · 无人机',
			iconGlyph: '+',
			title: '无人机 · 数量 +1',
			description: '增加 1 架无人机，提升火力覆盖。',
			offerWeight: 0.42,
			priority: 24
		};
	} else {
		droneOffer = {
			rewardDefinitionId: 'reward_upgrade_drone_attack_speed',
			rewardKind: 'drone',
			tag: '升级 · 无人机',
			iconGlyph: '≋',
			title: '无人机 · 攻速提升',
			description: '无人机攻击间隔缩短，输出更密集。',
			offerWeight: 0.36,
			priority: 26
		};
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

	const pulseOffer = buildSkillOffer(state, 'skill_pulse', 0.82);
	if (pulseOffer) candidates.push(pulseOffer);
	const dashOffer = buildSkillOffer(state, 'skill_dash', 0.78);
	if (dashOffer) candidates.push(dashOffer);
	// 空手道只保留在启动页选择，不在战斗奖励中出现
	// const karateOffer = buildSkillOffer(state, 'skill_karate', 0.76);
	// if (karateOffer) candidates.push(karateOffer);

	// main weapon upgrades
	candidates.push(...buildMainWeaponUpgradeOffers(state));

	// always-available tactical rewards
	candidates.push(
		{
			rewardDefinitionId: 'reward_weapon_upgrade',
			rewardKind: 'weapon',
			tag: '补给 · 武器强化',
			iconGlyph: '✦',
			title: '武器强化',
			description: '接下来数次攻击获得强化弹幕。',
			offerWeight: 0.9,
			priority: 40
		},
		{
			rewardDefinitionId: 'reward_xp_boost',
			rewardKind: 'xp',
			tag: '增益 · 经验',
			iconGlyph: 'XP',
			title: '经验增幅',
			description: '短时间内经验获取提高。',
			offerWeight: 0.72,
			priority: 50
		},
		{
			rewardDefinitionId: 'reward_buff_move_speed',
			rewardKind: 'buff',
			tag: '增益 · 临时',
			iconGlyph: '»',
			title: '移速提升',
			description: '短时间移速提升，更易吃掉落与拉扯。',
			offerWeight: 0.7,
			priority: 52
		},
		{
			rewardDefinitionId: 'reward_buff_attack_speed',
			rewardKind: 'buff',
			tag: '增益 · 临时',
			iconGlyph: '≋',
			title: '攻速提升',
			description: '短时间攻击更快，适合抢节奏。',
			offerWeight: 0.68,
			priority: 52
		},
		{
			rewardDefinitionId: 'reward_buff_damage',
			rewardKind: 'buff',
			tag: '增益 · 临时',
			iconGlyph: '✹',
			title: '伤害提升',
			description: '短时间伤害提高，适合斩高压目标。',
			offerWeight: 0.64,
			priority: 52
		},
		{
			rewardDefinitionId: 'reward_buff_shield',
			rewardKind: 'buff',
			tag: '增益 · 防护',
			iconGlyph: '◈',
			title: '格挡护盾',
			description: '获得 1 次格挡，抵挡下一次受到的伤害。',
			offerWeight: 0.62,
			priority: 54
		}
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
