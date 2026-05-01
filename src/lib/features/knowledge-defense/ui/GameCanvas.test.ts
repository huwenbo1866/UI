import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import { KD_ASSET_PATHS } from '../config/constants';
import GameCanvas from './GameCanvas.svelte';
import type { BattlefieldDropState, DroneState, LaserEffectState, MonsterState, ProjectileState } from '../core/types';
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
			lasers: [],
			damageTexts: [],
			pendingLevelUps: 0,
			abilityPulseFxMs: 0,
			abilityDashFxMs: 0,
			abilityKarateFxMs: 0,
			dashRemainingMs: 0,
			dashDirectionX: 0,
			dashDirectionY: 1,
			karateDirectionX: 0,
			karateDirectionY: 1,
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

	it('renders dash, karate, and missile-specific player feedback', () => {
		const { body } = render(GameCanvas, {
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
					moving: true,
					moveDirX: 1,
					moveDirY: 0
				},
				progress: {
					level: 1,
					exp: 0,
					nextLevelTotalExp: 10,
					pendingLevelUps: 0
				},
				monsters: [],
				battlefieldDrops: [],
				projectiles: [
					{
						id: 'missile-1',
						x: 640,
						y: 360,
						vx: 200,
						vy: -40,
						radius: 10,
						damage: 52,
						owner: 'player',
						kind: 'missile',
						color: '#fb923c'
					}
				],
				lasers: [],
				damageTexts: [],
				pendingLevelUps: 0,
				abilityPulseFxMs: 0,
				abilityDashFxMs: 180,
				abilityKarateFxMs: 180,
				dashRemainingMs: 80,
				dashDirectionX: 1,
				dashDirectionY: 0,
				karateDirectionX: 1,
				karateDirectionY: 0,
				animationTimeMs: 0,
				onTouchStartPoint: undefined,
				onTouchMovePoint: undefined,
				onTouchEndPoint: undefined,
				onPlayerActivate: undefined
			}
		});

		expect(body).toContain('ability-dash-streak');
		expect(body).toContain('ability-dash-bars');
		expect(body).toContain('ability-karate');
		expect(body).toContain('data-kind="missile"');
		expect(body).toContain('dashing');
	});

	it('anchors lasers from the player origin and renders drones when acquired', () => {
		const drones: DroneState[] = [
			{
				id: 'drone-1',
				x: 660,
				y: 390,
				orbitAngle: 0,
				cooldownMs: 0,
				targetMonsterId: null,
				moveDirX: 0,
				moveDirY: -1,
				formationSlot: 0
			}
		];
		const lasers: LaserEffectState[] = [
			{
				id: 'laser-1',
				from: { x: 600, y: 410 },
				to: { x: 760, y: 410 },
				ttlMs: 120,
				widthMultiplier: 1.5
			}
		];

		const { body } = render(GameCanvas, {
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
				monsters: [],
				drones,
				battlefieldDrops: [],
				projectiles: [],
				lasers,
				damageTexts: [],
				pendingLevelUps: 0,
				abilityPulseFxMs: 0,
				abilityDashFxMs: 0,
				abilityKarateFxMs: 0,
				dashRemainingMs: 0,
				dashDirectionX: 0,
				dashDirectionY: 1,
				karateDirectionX: 0,
				karateDirectionY: 1,
				karateRangeMultiplier: 1,
				animationTimeMs: 0,
				onTouchStartPoint: undefined,
				onTouchMovePoint: undefined,
				onTouchEndPoint: undefined,
				onPlayerActivate: undefined
			}
		});

		expect(body).toContain('class="drone ');
		expect(body).toContain(`src="${KD_ASSET_PATHS.droneSprite}"`);
		expect(body).toContain('left:600px; top:410px; width:160px; transform:translateY(-50%) rotate(0rad);');
	});
});
