import {
	ATTACK_SPEED_DROP_DURATION_MS,
	BATTLEFIELD_DROP_EXP_BOOST_DURATION_MS,
	BATTLEFIELD_DROP_HEAL_AMOUNT,
	DAMAGE_BOOST_DROP_DURATION_MS,
	MOVE_SPEED_DROP_DURATION_MS,
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
	id:
		| 'early-run'
		| 'pending-reward'
		| 'ability-ready'
		| 'low-hp'
		| 'sample-fallback'
		| 'steady'
		| 'active-buffs'
		;
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
			'H / J / K / L 释放对应槽位技能；R 在奖励面板中重随机；Esc 关闭面板或退出当前局。'
		],
		rewardTiming:
			'升级后奖励不会自动弹出，而是先挂在“奖励待领”里，等你觉得安全再答题领取；属性加成与护盾会持续显示，方便你判断当前战力。',
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
	pulseCooldownMs,
	shieldBlockCharges,
	activeBuffLabels,
	hp,
	maxHp,
	usingSampleFallback
}: {
	kills: number;
	level: number;
	pendingRewards: number;
	pulseCooldownMs: number;
	shieldBlockCharges: number;
	activeBuffLabels: string[];
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
				'奖励不会自动弹出；看准空档后按空格或点击角色，答对即可领取完整奖励，再继续推进。',
			tone: 'accent'
		});
	}

	if (activeBuffLabels.length > 0 || shieldBlockCharges > 0) {
		messages.push({
			id: 'active-buffs',
			title: '当前属性加成已生效',
			detail:
				shieldBlockCharges > 0
					? `当前增益：${[...activeBuffLabels, '单次格挡护盾'].join('、')}；优先维持节奏并扩大优势。`
					: `当前增益：${activeBuffLabels.join('、')}；继续推进，把怪潮和战场掉落一起处理掉。`,
			tone: 'accent'
		});
	}

	if (pulseCooldownMs <= 0) {
		messages.push({
			id: 'ability-ready',
			title: '脉冲已就绪',
			detail: '怪物贴身或需要抢一口恢复时按 H，脉冲能清近身怪并顺手回血。',
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
	},
	{
		id: 'speed',
		badge: '移速',
		label: '疾行补剂',
		detail: `${Math.round(MOVE_SPEED_DROP_DURATION_MS / 1000)} 秒移速提升，适合绕开压力、补吃其他掉落。`,
		tone: 'info'
	},
	{
		id: 'attack-speed',
		badge: '攻速',
		label: '速射手册',
		detail: `${Math.round(ATTACK_SPEED_DROP_DURATION_MS / 1000)} 秒攻击提速，适合在怪潮前多打一轮输出。`,
		tone: 'accent'
	},
	{
		id: 'damage',
		badge: '火力',
		label: '火力核心',
		detail: `${Math.round(DAMAGE_BOOST_DROP_DURATION_MS / 1000)} 秒伤害提高，适合斩掉中高压怪。`,
		tone: 'accent'
	},
	{
		id: 'shield',
		badge: '护盾',
		label: '格挡护盾',
		detail: '会替你挡掉下一次伤害；拿到后可以更从容地穿一次危险身位。',
		tone: 'warning'
	},
	{
		id: 'reroll',
		badge: '改签',
		label: '重随机会',
		detail: '拾取后本局重随机会 +1；留给关键升级节点再用更赚。',
		tone: 'info'
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
