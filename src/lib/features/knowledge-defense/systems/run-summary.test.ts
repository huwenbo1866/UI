import { describe, expect, it } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from '../state/game-store';
import { deriveRunSummary } from './run-summary';

describe('deriveRunSummary', () => {
	it('derives a concrete defeat cause, key stats, and telemetry-based tips', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.progress.level = 4;
		state.progress.pendingLevelUps = 2;
		state.battle.kills = 9;
		state.battle.correct = 3;
		state.battle.wrong = 4;
		state.runTelemetry.elapsedMs = 68000;
		state.runTelemetry.totalDamageTaken = 110;
		state.runTelemetry.damageBySource.melee.damage = 20;
		state.runTelemetry.damageBySource.melee.hits = 1;
		state.runTelemetry.damageBySource.dash.damage = 80;
		state.runTelemetry.damageBySource.dash.hits = 2;
		state.runTelemetry.damageBySource.projectile.damage = 10;
		state.runTelemetry.damageBySource.projectile.hits = 1;
		state.runTelemetry.lastDamageSource = 'dash';
		state.runTelemetry.defeatSource = 'dash';

		const summary = deriveRunSummary(state);

		expect(summary.primaryDefeatReason).toBe('主要败因：冲刺突进');
		expect(summary.explanation).toContain('冲刺突进');
		expect(summary.explanation).toContain('80');
		expect(summary.survivalTimeLabel).toBe('1 分 08 秒');
		expect(summary.levelReached).toBe(4);
		expect(summary.kills).toBe(9);
		expect(summary.correct).toBe(3);
		expect(summary.wrong).toBe(4);
		expect(summary.accuracy).toBeCloseTo(3 / 7);
		expect(summary.accuracyLabel).toBe('43%');
		expect(summary.pendingRewards).toBe(2);
		expect(summary.tips).toHaveLength(3);
		expect(summary.tips[0]).toContain('冲刺');
		expect(summary.tips[1]).toContain('待领奖励');
		expect(summary.tips[2]).toContain('准确率');
	});

	it('keeps at least two actionable tips even when the run ends before any answers', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.progress.level = 2;
		state.battle.kills = 8;
		state.runTelemetry.elapsedMs = 21000;
		state.runTelemetry.totalDamageTaken = 32;
		state.runTelemetry.damageBySource.projectile.damage = 32;
		state.runTelemetry.damageBySource.projectile.hits = 2;
		state.runTelemetry.lastDamageSource = 'projectile';
		state.runTelemetry.defeatSource = 'projectile';

		const summary = deriveRunSummary(state);

		expect(summary.primaryDefeatReason).toBe('主要败因：远程投射');
		expect(summary.survivalTimeLabel).toBe('21 秒');
		expect(summary.accuracyLabel).toBe('0%');
		expect(summary.tips).toHaveLength(3);
		expect(summary.tips.some((tip) => tip.includes('投掷怪'))).toBe(true);
		expect(summary.tips.some((tip) => tip.includes('第一次升级强化'))).toBe(true);
		expect(summary.tips.some((tip) => tip.includes('21 秒'))).toBe(true);
	});
});
