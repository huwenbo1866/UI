import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import GameCanvas from './GameCanvas.svelte';
import type { BattlefieldDropState, MonsterState, ProjectileState } from '../core/types';
import { getMonsterAnimationOffset, resolveMonsterSpriteFrame } from './monster-sprites';

function createMonster(overrides: Partial<MonsterState> = {}): MonsterState {
	return {
		id: 'monster-test',
		difficulty: 'easy',
		x: 520,
		y: 380,
		radius: 22,
		hp: 100,
		maxHp: 100,
		speed: 45,
		damage: 10,
		isDead: false,
		hurtFlashMs: 0,
		attackCooldownMs: 280,
		attackState: 'idle',
		attackWindupMs: 0,
		moving: false,
		moveDirX: 0,
		moveDirY: 1,
		...overrides
	};
}

function renderCanvas(
	monsters: MonsterState[],
	animationTimeMs = 0,
	battlefieldDrops: BattlefieldDropState[] = [],
	projectiles: ProjectileState[] = []
) {
	return render(GameCanvas, {
		props: {
			width: 1200,
			height: 820,
			player: {
				x: 600,
				y: 410,
				radius: 34,
				speed: 80,
				hp: 200,
				maxHp: 200,
				contactInvulnMs: 0,
				hurtFlashMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			},
			progress: {
				level: 1,
				exp: 0,
				nextLevelTotalExp: 10,
				pendingLevelUps: 0
			},
			monsters,
			battlefieldDrops,
			projectiles,
			drones: [],
			lasers: [],
			damageTexts: [],
			pendingLevelUps: 0,
			abilityPulseFxMs: 0,
			animationTimeMs,
			onTouchStartPoint: undefined,
			onTouchMovePoint: undefined,
			onTouchEndPoint: undefined,
			onPlayerActivate: undefined
		}
	});
}

describe('GameCanvas monster sprite rendering', () => {
	it('renders telegraph frames from committed monster assets while keeping telegraph battlefield effects', () => {
		const monster = createMonster({
			id: 'telegraph-monster',
			difficulty: 'hard',
			attackState: 'telegraph',
			attackWindupMs: 160
		});
		const animationTimeMs = 120;
		const expectedSpritePath = resolveMonsterSpriteFrame({
			difficulty: monster.difficulty,
			visualState: 'telegraph',
			elapsedMs: animationTimeMs,
			animationOffsetMs: getMonsterAnimationOffset(monster.id)
		});
		const { body } = renderCanvas([monster], animationTimeMs);

		expect(body).toContain(`src="${expectedSpritePath}"`);
		expect(body).toContain('data-visual-state="telegraph"');
		expect(body).toContain('monster-telegraph-aura');
		expect(body).toContain('monster-attack-flare');
		expect(body).toContain('monster-attack-ring');
		expect(body).not.toContain('/knowledge-defense/monster-hard.png');
	});

	it('renders idle frames without telegraph overlays for stationary monsters', () => {
		const monster = createMonster({
			id: 'idle-monster',
			difficulty: 'medium',
			attackState: 'idle',
			attackWindupMs: 0,
			moving: false
		});
		const animationTimeMs = 0;
		const expectedSpritePath = resolveMonsterSpriteFrame({
			difficulty: monster.difficulty,
			visualState: 'idle',
			elapsedMs: animationTimeMs,
			animationOffsetMs: getMonsterAnimationOffset(monster.id)
		});
		const { body } = renderCanvas([monster], animationTimeMs);

		expect(body).not.toContain('telegraphing');
		expect(body).toContain(`src="${expectedSpritePath}"`);
		expect(body).toContain('data-visual-state="idle"');
		expect(body).not.toContain('monster-telegraph-aura');
		expect(body).not.toContain('monster-attack-flare');
		expect(body).not.toContain('monster-attack-ring');
		expect(body).not.toContain('/knowledge-defense/monster-medium.png');
	});

	it('renders hurt frames even while telegraphing', () => {
		const monster = createMonster({
			id: 'hurt-monster',
			difficulty: 'easy',
			attackState: 'telegraph',
			attackWindupMs: 220,
			hurtFlashMs: 80,
			moving: true
		});
		const expectedSpritePath = resolveMonsterSpriteFrame({
			difficulty: monster.difficulty,
			visualState: 'hurt',
			elapsedMs: 0,
			animationOffsetMs: getMonsterAnimationOffset(monster.id)
		});
		const { body } = renderCanvas([monster]);

		expect(body).toContain(`src="${expectedSpritePath}"`);
		expect(body).toContain('data-visual-state="hurt"');
		expect(body).toContain('monster-telegraph-aura');
	});

	it('renders battlefield drops with readable labels in the arena', () => {
		const { body } = renderCanvas([], 0, [
			{
				id: 'drop-xp',
				kind: 'xp',
				x: 640,
				y: 420,
				radius: 20,
				ttlMs: 5000
			}
		]);

		expect(body).toContain('battlefield-drop xp');
		expect(body).toContain('drop-label');
		expect(body).toContain('经验');
	});

	it('renders skill-specific telegraph readability cues and hostile projectiles', () => {
		const dashMonster = createMonster({
			id: 'dash-monster',
			difficulty: 'medium',
			attackState: 'telegraph',
			attackWindupMs: 180
		});
		const throwMonster = createMonster({
			id: 'throw-monster',
			difficulty: 'hard',
			attackState: 'telegraph',
			attackWindupMs: 210,
			x: 700
		});
		const { body } = renderCanvas(
			[dashMonster, throwMonster],
			0,
			[],
			[
				{
					id: 'hostile-throw',
					x: 640,
					y: 420,
					vx: 0,
					vy: 0,
					radius: 12,
					damage: 30,
					color: '#7f1d1d',
					owner: 'monster',
					ttlMs: 1200
				}
			]
		);

		expect(body).toContain('data-attack-kind="dash"');
		expect(body).toContain('data-attack-kind="throw"');
		expect(body).toContain('monster-skill-tag dash');
		expect(body).toContain('monster-skill-tag throw');
		expect(body).toContain('冲刺');
		expect(body).toContain('投掷');
		expect(body).toContain('projectile hostile');
		expect(body).toContain('data-owner="monster"');
	});
});
