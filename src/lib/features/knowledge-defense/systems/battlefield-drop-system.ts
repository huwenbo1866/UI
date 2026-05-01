import {
	ATTACK_SPEED_DROP_DURATION_MS,
	ATTACK_SPEED_DROP_MULTIPLIER,
	DAMAGE_BOOST_DROP_DURATION_MS,
	DAMAGE_BOOST_DROP_MULTIPLIER,
	BATTLEFIELD_DROP_CHANCE,
	BATTLEFIELD_DROP_EXP_BOOST_DURATION_MS,
	BATTLEFIELD_DROP_FEEDBACK_TTL_MS,
	BATTLEFIELD_DROP_HEAL_AMOUNT,
	BATTLEFIELD_DROP_RADIUS,
	BATTLEFIELD_DROP_TTL_MS,
	MOVE_SPEED_DROP_DURATION_MS,
	MOVE_SPEED_DROP_MULTIPLIER,
	BATTLEFIELD_DROP_WEAPON_USES
} from '../config/constants';
import {
	getBattlefieldDropDefinitionById,
	getBattlefieldDropDefinitionIdByKind,
	listBattlefieldDropDefinitions
} from '../data/drop-definitions';
import type {
	AttackPattern,
	BattlefieldDropDefinitionId,
	BattlefieldDropKind,
	BattlefieldDropState,
	GameState,
	MonsterState
} from '../core/types';
import { distance, uid } from '../core/utils';
import {
	gainExpForKill,
	grantAttackSpeedBoost,
	grantDamageBoost,
	grantExpBoost,
	grantMoveSpeedBoost,
	grantQueuedWeaponBuff,
	grantShieldBlock,
	restorePlayerHealth
} from './progression-system';


function rollBattlefieldDropDefinitionId(random: () => number): BattlefieldDropDefinitionId {
	const definitions = listBattlefieldDropDefinitions();
	const totalWeight = definitions.reduce((sum, definition) => sum + Math.max(0, definition.rollWeight), 0);

	if (definitions.length === 0) {
		return 'drop_weapon_supply';
	}

	if (totalWeight <= 0) {
		return definitions[0].id;
	}

	let cursor = random() * totalWeight;
	for (const definition of definitions) {
		cursor -= Math.max(0, definition.rollWeight);
		if (cursor <= 0) {
			return definition.id;
		}
	}

	return definitions[definitions.length - 1].id;
}

function spawnBattlefieldDrop(
	state: GameState,
	definitionId: BattlefieldDropState['definitionId'],
	monster: MonsterState
): BattlefieldDropState {
	const resolvedDefinitionId = definitionId ?? 'drop_weapon_supply';
	const definition = getBattlefieldDropDefinitionById(resolvedDefinitionId);
	const drop: BattlefieldDropState = {
		id: uid('drop'),
		definitionId: resolvedDefinitionId,
		kind: definition.kind,
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

	return spawnBattlefieldDrop(state, rollBattlefieldDropDefinitionId(random), monster);
}


function setPickupFeedback(
	state: GameState,
	definitionId: BattlefieldDropState['definitionId'],
	detail: string
) {
	const resolvedDefinitionId = definitionId ?? 'drop_weapon_supply';
	const definition = getBattlefieldDropDefinitionById(resolvedDefinitionId);
	state.ui.pickupFeedback = {
		kind: definition.kind,
		definitionId: resolvedDefinitionId,
		title: definition.title,
		detail,
		ttlMs: BATTLEFIELD_DROP_FEEDBACK_TTL_MS
	};
}

export function getBattlefieldDropDefinition(kind: BattlefieldDropKind) {
	return getBattlefieldDropDefinitionById(getBattlefieldDropDefinitionIdByKind(kind));
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
	const definitionId = drop.definitionId ?? getBattlefieldDropDefinitionIdByKind(drop.kind);
	const definition = getBattlefieldDropDefinitionById(definitionId);
		const pickupHandlers: Record<BattlefieldDropDefinitionId, () => void> = {
			drop_weapon_supply: () => grantQueuedWeaponBuff(state, BATTLEFIELD_DROP_WEAPON_USES),
			drop_xp_crystal: () => grantExpBoost(state, BATTLEFIELD_DROP_EXP_BOOST_DURATION_MS, now),
			drop_heal_pack: () => restorePlayerHealth(state, BATTLEFIELD_DROP_HEAL_AMOUNT),
			drop_speed_tonic: () =>
			grantMoveSpeedBoost(state, MOVE_SPEED_DROP_DURATION_MS, MOVE_SPEED_DROP_MULTIPLIER, now),
			drop_attack_manual: () =>
			grantAttackSpeedBoost(
				state,
				ATTACK_SPEED_DROP_DURATION_MS,
				ATTACK_SPEED_DROP_MULTIPLIER,
				now
			),
			drop_damage_core: () =>
			grantDamageBoost(state, DAMAGE_BOOST_DROP_DURATION_MS, DAMAGE_BOOST_DROP_MULTIPLIER, now),
			drop_guard_shield: () => grantShieldBlock(state),
			drop_reroll_coupon: () => {
				state.ui.rewardRerollsRemaining += 1;
			}
		};

	const applyPickup = pickupHandlers[definitionId];
	if (!applyPickup) {
		throw new Error(`Unknown battlefield drop definition: ${definitionId}`);
	}

	applyPickup();
	setPickupFeedback(state, definitionId, definition.pickupDetail);
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
