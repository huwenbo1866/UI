import {
	BATTLEFIELD_DROP_EXP_BOOST_DURATION_MS,
	BATTLEFIELD_DROP_HEAL_AMOUNT,
	BATTLEFIELD_DROP_WEAPON_USES
} from '../config/constants';
import type { AttackPreference } from '../core/types';

export const KNOWLEDGE_DEFENSE_MODE_NAME = 'Knowledge Defense / 知识防御';
export const KNOWLEDGE_DEFENSE_ONBOARDING_STORAGE_KEY =
	'knowledge-defense.onboarding-dismissed';

export type GuidanceTone = 'accent' | 'info' | 'warning';

export interface ModeSourceSummary {
	label: string;
	detail: string;
	isFallback: boolean;
}

export interface PreRunBriefing {
	modeLoop: string;
	controls: string[];
	rewardTiming: string;
	reviewValue: string;
	attackPreference: string;
	attackPreferenceDetail: string;
	contentSource: string;
	contentSourceDetail: string;
}

export interface ModeGuidanceMessage {
	id: 'early-run' | 'pending-reward' | 'ability-ready' | 'low-hp' | 'sample-fallback' | 'steady';
	title: string;
	detail: string;
	tone: GuidanceTone;
}

export interface ModeLegendItem {
	id: string;
	label: string;
	badge: string;
	detail: string;
	tone: GuidanceTone;
}

export function getAttackPreferenceLabel(attackPreference: AttackPreference) {
	return attackPreference === 'straight' ? '直线发射' : '散射';
}

export function getAttackPreferenceDetail(attackPreference: AttackPreference) {
	if (attackPreference === 'straight') {
		return '单线输出更稳，方便边走位边确认怪物前摇。';
	}

	return '扇面覆盖更宽，近身清怪更快，但更依赖走位贴脸。';
}

export function deriveContentSourceSummary({
	usingSampleFallback,
	chapterTitle,
	selectedKnowledgeId,
	selectedFileId,
	selectedHomeworkId
}: {
	usingSampleFallback: boolean;
	chapterTitle?: string | null;
	selectedKnowledgeId?: string;
	selectedFileId?: string;
	selectedHomeworkId?: string;
}): ModeSourceSummary {
	const normalizedChapterTitle = chapterTitle?.trim();

	if (!usingSampleFallback) {
		return {
			label: normalizedChapterTitle
				? `知识库章节作业 · ${normalizedChapterTitle}`
				: '知识库章节作业',
			detail:
				'当前题目来自你选中的知识库章节作业；本局会沿用既有章节作业答题与强化节奏。',
			isFallback: false
		};
	}

	if (!selectedKnowledgeId) {
		return {
			label: '备用样例题源（Fallback）',
			detail:
				'当前还没选择知识库章节，系统先用备用样例题源帮助你熟悉玩法与操作。',
			isFallback: true
		};
	}

	if (!selectedFileId) {
		return {
			label: '备用样例题源（Fallback）',
			detail:
				'你已选知识库，但还没锁定文件；当前仍是备用样例题源，不会回写章节作业。',
			isFallback: true
		};
	}

	if (!selectedHomeworkId) {
		return {
			label: '备用样例题源（Fallback）',
			detail:
				'你已选文件，但还没锁定章节作业；开局前仍会使用备用样例题源。',
			isFallback: true
		};
	}

	return {
		label: '备用样例题源（Fallback）',
		detail:
			'所选章节暂时不可用或加载失败，系统已明确回退到备用样例题源继续本局。',
		isFallback: true
	};
}

export function derivePreRunBriefing({
	attackPreference,
	sourceSummary
}: {
	attackPreference: AttackPreference;
	sourceSummary: ModeSourceSummary;
}): PreRunBriefing {
	return {
		modeLoop:
			'走位清怪 → 累积经验升级 → 在安全时机打开奖励答题 → 领取增益后继续推进。',
		controls: [
			'W / A / S / D 移动；触屏可朝按下方向拖动。',
			'空格或点击角色：有待领奖励时打开奖励答题。',
			'E 释放脉冲；答对奖励题会立即回满脉冲并存 1 层超载，留给你自己挑时机放强化脉冲；Esc 关闭面板或退出当前局。'
		],
		rewardTiming:
			'升级后奖励不会自动弹出，而是先挂在 HUD 的“奖励待领”里，等你觉得安全再答题领取；答对还能立刻回脉冲并存一层强化脉冲。',
		reviewValue:
			'答错会进入错题集；先复盘再开局，能更快抓住薄弱点，也不会改变现有错题与章节持久化流程。',
		attackPreference: getAttackPreferenceLabel(attackPreference),
		attackPreferenceDetail: getAttackPreferenceDetail(attackPreference),
		contentSource: sourceSummary.label,
		contentSourceDetail: sourceSummary.detail
	};
}

export function deriveInRunGuidance({
	kills,
	level,
	pendingRewards,
	abilityCooldownMs,
	pulseOverchargeStacks,
	hp,
	maxHp,
	usingSampleFallback
}: {
	kills: number;
	level: number;
	pendingRewards: number;
	abilityCooldownMs: number;
	pulseOverchargeStacks: number;
	hp: number;
	maxHp: number;
	usingSampleFallback: boolean;
}): ModeGuidanceMessage[] {
	const messages: ModeGuidanceMessage[] = [];
	const hpRatio = maxHp > 0 ? hp / maxHp : 0;

	if (hpRatio <= 0.35) {
		messages.push({
			id: 'low-hp',
			title: '血量偏低，先保命',
			detail: '先拉开距离找治疗掉落；别急着贪伤害，活着才能等到下一次奖励。',
			tone: 'warning'
		});
	}

	if (pendingRewards > 0) {
		messages.push({
			id: 'pending-reward',
			title: '有奖励待领',
			detail:
				'奖励不会自动弹出；看准空档后按空格或点击角色，答对会立刻回脉冲并存 1 层超载，再继续推进。',
			tone: 'accent'
		});
	}

	if (pulseOverchargeStacks > 0) {
		messages.push({
			id: 'ability-ready',
			title: '脉冲已超载',
			detail: `你存着 ${pulseOverchargeStacks} 层强化脉冲；等怪物贴脸或准备抢节奏时再按 E，会比普通脉冲更赚。`,
			tone: 'accent'
		});
	}

	if (abilityCooldownMs <= 0 && pulseOverchargeStacks <= 0) {
		messages.push({
			id: 'ability-ready',
			title: '脉冲已就绪',
			detail: '怪物贴身或需要抢一口恢复时按 E，脉冲能清近身怪并顺手回血。',
			tone: 'accent'
		});
	}

	if (usingSampleFallback) {
		messages.push({
			id: 'sample-fallback',
			title: '当前是 fallback 样例题源',
			detail: '这一局使用的是备用样例题源；熟悉玩法没问题，但它不是你选中的知识库章节内容。',
			tone: 'info'
		});
	}

	if (level <= 1 && kills <= 0) {
		messages.push({
			id: 'early-run',
			title: '开局先拿第一波节奏',
			detail: '先稳住走位拿到第一只怪和第一次升级，别在开局就为了输出硬吃伤害。',
			tone: 'info'
		});
	}

	if (messages.length === 0) {
		messages.push({
			id: 'steady',
			title: '节奏稳定，继续推进',
			detail: '保持走位、留意怪物前摇，下一次升级前尽量把战场掉落安全吃干净。',
			tone: 'info'
		});
	}

	return messages;
}

export const KNOWLEDGE_DEFENSE_DROP_LEGEND: ModeLegendItem[] = [
	{
		id: 'weapon',
		badge: '武器',
		label: '武备补给',
		detail: `拾取后下 ${BATTLEFIELD_DROP_WEAPON_USES} 次攻击会强化，适合在安全窗口里迅速补输出。`,
		tone: 'accent'
	},
	{
		id: 'xp',
		badge: '经验',
		label: '经验结晶',
		detail: `${Math.round(BATTLEFIELD_DROP_EXP_BOOST_DURATION_MS / 1000)} 秒经验增幅，适合在怪多时快速抢升级。`,
		tone: 'info'
	},
	{
		id: 'heal',
		badge: '治疗',
		label: '急救包',
		detail: `恢复 ${BATTLEFIELD_DROP_HEAL_AMOUNT} 点生命；低血时优先让它帮你续命，而不是继续硬换。`,
		tone: 'warning'
	}
];

export const KNOWLEDGE_DEFENSE_TELEGRAPH_LEGEND: ModeLegendItem[] = [
	{
		id: 'melee',
		badge: '扑击',
		label: '普通怪贴脸前摇',
		detail: '看到扑击标签和圆环时，马上后撤或侧移，别原地和它交换血量。',
		tone: 'info'
	},
	{
		id: 'dash',
		badge: '冲刺',
		label: '中型怪直线突进',
		detail: '中型怪会先锁方向再冲；最稳的处理是横向拉开，不要沿着它的冲线跑。',
		tone: 'accent'
	},
	{
		id: 'throw',
		badge: '投掷',
		label: '高难怪远程投掷',
		detail: '看到投掷标签就继续移动，提前离开它正对你的线路，避免吃到飞行物。',
		tone: 'warning'
	}
];
