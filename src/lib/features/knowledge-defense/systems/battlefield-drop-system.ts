import {
	BATTLEFIELD_DROP_CHANCE,
	BATTLEFIELD_DROP_EXP_BOOST_DURATION_MS,
	BATTLEFIELD_DROP_FEEDBACK_TTL_MS,
	BATTLEFIELD_DROP_HEAL_AMOUNT,
	BATTLEFIELD_DROP_RADIUS,
	BATTLEFIELD_DROP_TTL_MS,
	BATTLEFIELD_DROP_WEAPON_USES
} from '../config/constants';
import type {
	AttackPattern,
	BattlefieldDropKind,
	BattlefieldDropState,
	GameState,
	MonsterState
} from '../core/types';
import { distance, uid } from '../core/utils';
import {
	gainExpForKill,
	grantExpBoost,
	grantQueuedWeaponBuff,
	restorePlayerHealth
} from './progression-system';

export interface BattlefieldDropDefinition {
	kind: BattlefieldDropKind;
	title: string;
	shortLabel: string;
	arenaGlyph: string;
	pickupDetail: string;
}

const DROP_DEFINITIONS: Record<BattlefieldDropKind, BattlefieldDropDefinition> = {
	weapon: {
		kind: 'weapon',
		title: '武备补给',
		shortLabel: '武器',
		arenaGlyph: '✦',
		pickupDetail: `下 ${BATTLEFIELD_DROP_WEAPON_USES} 次攻击强化`
	},
	xp: {
		kind: 'xp',
		title: '经验结晶',
		shortLabel: '经验',
		arenaGlyph: '◎',
		pickupDetail: `${Math.round(BATTLEFIELD_DROP_EXP_BOOST_DURATION_MS / 1000)} 秒经验增幅`
	},
	heal: {
		kind: 'heal',
		title: '急救包',
		shortLabel: '治疗',
		arenaGlyph: '+',
		pickupDetail: `恢复 ${BATTLEFIELD_DROP_HEAL_AMOUNT} 点生命`
	}
};

function rollBattlefieldDropKind(random: () => number): BattlefieldDropKind {
	const roll = random();
	if (roll < 0.34) return 'weapon';
	if (roll < 0.68) return 'xp';
	return 'heal';
}

function spawnBattlefieldDrop(
	state: GameState,
	kind: BattlefieldDropKind,
	monster: MonsterState
): BattlefieldDropState {
	const drop: BattlefieldDropState = {
		id: uid('drop'),
		kind,
		x: monster.x,
		y: monster.y,
		radius: BATTLEFIELD_DROP_RADIUS,
		ttlMs: BATTLEFIELD_DROP_TTL_MS
	};

	state.battlefieldDrops.push(drop);
	return drop;
}

function maybeSpawnBattlefieldDrop(state: GameState, monster: MonsterState, random: () => number) {
	if (random() >= BATTLEFIELD_DROP_CHANCE[monster.difficulty]) {
		return null;
	}

	return spawnBattlefieldDrop(state, rollBattlefieldDropKind(random), monster);
}

function setPickupFeedback(state: GameState, kind: BattlefieldDropKind, detail: string) {
	state.ui.pickupFeedback = {
		kind,
		title: DROP_DEFINITIONS[kind].title,
		detail,
		ttlMs: BATTLEFIELD_DROP_FEEDBACK_TTL_MS
	};
}

export function getBattlefieldDropDefinition(kind: BattlefieldDropKind) {
	return DROP_DEFINITIONS[kind];
}

export function getQueuedWeaponBuffLabel(pattern: AttackPattern | null) {
	if (pattern === 'straight4') return '4 连发';
	if (pattern === 'scatter7') return '7 发散射';
	return '武器强化';
}

export function finalizeMonsterDeath(
	state: GameState,
	monster: MonsterState,
	options: { random?: () => number } = {}
) {
	if (monster.isDead) return null;

	monster.isDead = true;
	state.battle.kills += 1;
	gainExpForKill(state);

	return maybeSpawnBattlefieldDrop(state, monster, options.random ?? Math.random);
}

export function removeDefeatedMonsters(state: GameState) {
	state.monsters = state.monsters.filter((monster) => !monster.isDead);
}

export function applyBattlefieldDropPickup(
	state: GameState,
	drop: BattlefieldDropState,
	now = Date.now()
) {
	if (drop.kind === 'weapon') {
		grantQueuedWeaponBuff(state, BATTLEFIELD_DROP_WEAPON_USES);
		setPickupFeedback(state, drop.kind, DROP_DEFINITIONS.weapon.pickupDetail);
		return;
	}

	if (drop.kind === 'xp') {
		grantExpBoost(state, BATTLEFIELD_DROP_EXP_BOOST_DURATION_MS, now);
		setPickupFeedback(state, drop.kind, DROP_DEFINITIONS.xp.pickupDetail);
		return;
	}

	restorePlayerHealth(state, BATTLEFIELD_DROP_HEAL_AMOUNT);
	setPickupFeedback(state, drop.kind, DROP_DEFINITIONS.heal.pickupDetail);
}

export function updateBattlefieldDrops(state: GameState, dtMs: number, now = Date.now()) {
	if (state.ui.pickupFeedback) {
		state.ui.pickupFeedback.ttlMs = Math.max(0, state.ui.pickupFeedback.ttlMs - dtMs);
		if (state.ui.pickupFeedback.ttlMs <= 0) {
			state.ui.pickupFeedback = null;
		}
	}

	const remainingDrops: BattlefieldDropState[] = [];

	for (const drop of state.battlefieldDrops) {
		if (
			distance(state.player.x, state.player.y, drop.x, drop.y) <=
			state.player.radius + drop.radius
		) {
			applyBattlefieldDropPickup(state, drop, now);
			continue;
		}

		drop.ttlMs = Math.max(0, drop.ttlMs - dtMs);
		if (drop.ttlMs > 0) {
			remainingDrops.push(drop);
		}
	}

	state.battlefieldDrops = remainingDrops;
}
