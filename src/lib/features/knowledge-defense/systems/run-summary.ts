import type { GameState, PlayerDamageSource, RunSummary } from '../core/types';

const DAMAGE_SOURCE_COPY: Record<
	PlayerDamageSource,
	{ reason: string; label: string; tip: string }
> = {
	melee: {
		reason: '主要败因：近战扑击',
		label: '近战扑击',
		tip: '近战怪贴脸压力最大，下局尽量保持圆周走位，不要在怪群正前方停住。'
	},
	dash: {
		reason: '主要败因：冲刺突进',
		label: '冲刺突进',
		tip: '中型怪读出“冲刺”后会锁定方向，下局看到提示就立刻横向拉开。'
	},
	projectile: {
		reason: '主要败因：远程投射',
		label: '远程投射',
		tip: '远程投掷会在外围持续压血，下局优先清理读条的投掷怪，并改用斜向走位躲弹。'
	}
};

function formatSurvivalTime(ms: number) {
	const totalSeconds = Math.max(0, Math.round(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	if (minutes <= 0) {
		return `${totalSeconds} 秒`;
	}

	return `${minutes} 分 ${seconds.toString().padStart(2, '0')} 秒`;
}

function formatAccuracy(accuracy: number) {
	return `${Math.round(accuracy * 100)}%`;
}

function pushTip(tips: string[], tip: string) {
	if (!tips.includes(tip)) {
		tips.push(tip);
	}
}

function getPrimaryDamageSource(state: GameState): PlayerDamageSource {
	if (state.runTelemetry.defeatSource) {
		return state.runTelemetry.defeatSource;
	}

	let primarySource: PlayerDamageSource = 'melee';
	let highestDamage = -1;
	let highestHits = -1;

	for (const source of ['melee', 'dash', 'projectile'] as const) {
		const stats = state.runTelemetry.damageBySource[source];
		if (stats.damage > highestDamage || (stats.damage === highestDamage && stats.hits > highestHits)) {
			highestDamage = stats.damage;
			highestHits = stats.hits;
			primarySource = source;
		}
	}

	return primarySource;
}

export function deriveRunSummary(state: GameState): RunSummary {
	const totalAnswers = state.battle.correct + state.battle.wrong;
	const accuracy = totalAnswers > 0 ? state.battle.correct / totalAnswers : 0;
	const accuracyLabel = formatAccuracy(accuracy);
	const survivalTimeMs = state.runTelemetry.elapsedMs;
	const survivalTimeLabel = formatSurvivalTime(survivalTimeMs);
	const primarySource = getPrimaryDamageSource(state);
	const sourceCopy = DAMAGE_SOURCE_COPY[primarySource];
	const sourceStats = state.runTelemetry.damageBySource[primarySource];
	const damageShare =
		state.runTelemetry.totalDamageTaken > 0
			? Math.round((sourceStats.damage / state.runTelemetry.totalDamageTaken) * 100)
			: 0;

	const explanation =
		sourceStats.damage > 0
			? `最后一击判定为${sourceCopy.label}，本局它共命中 ${sourceStats.hits} 次，造成 ${Math.round(sourceStats.damage)} 点伤害，占承伤 ${damageShare}%。`
			: `倒下时的伤害记录较少，当前按${sourceCopy.label}判定本局最直接的失守原因。`;

	const tips: string[] = [];
	pushTip(tips, sourceCopy.tip);

	if (state.progress.pendingLevelUps > 0) {
		pushTip(
			tips,
			`倒下时还有 ${state.progress.pendingLevelUps} 次待领奖励，下局升级后记得及时打开奖励面板补强。`
		);
	}

	if (totalAnswers === 0) {
		pushTip(tips, '本局还没拿到有效答题节奏，下局先稳住前 30 秒，尽快拿到第一次升级强化。');
	} else if (accuracy < 0.6) {
		pushTip(
			tips,
			`本局答题准确率只有 ${accuracyLabel}，先去错题集复盘高频错题，再回来冲更深层数。`
		);
	} else if (state.battle.wrong >= 3) {
		pushTip(
			tips,
			`本局答错 ${state.battle.wrong} 题，拿奖励前先拉开身位，给自己留出完整读题时间。`
		);
	}

	if (state.battle.kills < Math.max(8, state.progress.level * 3)) {
		pushTip(
			tips,
			`击杀只有 ${state.battle.kills} 个，下局多做绕圈拉扯，让自动攻击持续命中，别让怪群堆到脸上。`
		);
	}

	if (survivalTimeMs < 45000) {
		pushTip(
			tips,
			`这局只撑了 ${survivalTimeLabel}，前半分钟先保命拉扯，比硬吃伤害抢输出更划算。`
		);
	}

	if (tips.length < 2) {
		pushTip(
			tips,
			`你已经打到 Lv.${state.progress.level}，下局继续保持输出节奏，优先点掉正在读条的危险怪。`
		);
	}

	return {
		primaryDefeatReason: sourceCopy.reason,
		explanation,
		survivalTimeMs,
		survivalTimeLabel,
		levelReached: state.progress.level,
		kills: state.battle.kills,
		correct: state.battle.correct,
		wrong: state.battle.wrong,
		accuracy,
		accuracyLabel,
		pendingRewards: state.progress.pendingLevelUps,
		tips: tips.slice(0, 3)
	};
}
