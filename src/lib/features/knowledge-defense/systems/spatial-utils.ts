import type { Vec2 } from '../core/types';

export function clampMagnitude(vector: Vec2, maxMagnitude: number): Vec2 {
	const len = Math.hypot(vector.x, vector.y);
	if (!len || len <= maxMagnitude) return vector;
	return {
		x: (vector.x / len) * maxMagnitude,
		y: (vector.y / len) * maxMagnitude
	};
}

export function normalize(x: number, y: number): Vec2 {
	const len = Math.hypot(x, y) || 1;
	return { x: x / len, y: y / len };
}

export function addVectors(...vectors: Vec2[]): Vec2 {
	return vectors.reduce(
		(acc, vector) => ({ x: acc.x + vector.x, y: acc.y + vector.y }),
		{ x: 0, y: 0 }
	);
}

export function scaleVector(vector: Vec2, scalar: number): Vec2 {
	return { x: vector.x * scalar, y: vector.y * scalar };
}

export function buildSeparationVector(
	selfX: number,
	selfY: number,
	neighbors: Array<{ x: number; y: number }>,
	radius: number
): Vec2 {
	let separation = { x: 0, y: 0 };
	let count = 0;

	for (const neighbor of neighbors) {
		const dx = selfX - neighbor.x;
		const dy = selfY - neighbor.y;
		const dist = Math.hypot(dx, dy);
		if (!dist || dist >= radius) continue;
		const strength = (radius - dist) / radius;
		separation.x += (dx / dist) * strength;
		separation.y += (dy / dist) * strength;
		count += 1;
	}

	if (!count) return separation;
	return {
		x: separation.x / count,
		y: separation.y / count
	};
}

export function moveToward(
	currentX: number,
	currentY: number,
	targetX: number,
	targetY: number,
	speed: number,
	dtSeconds: number,
	slowRadius = 0
): { x: number; y: number; moveDir: Vec2 } {
	const dx = targetX - currentX;
	const dy = targetY - currentY;
	const dist = Math.hypot(dx, dy);
	if (!dist) {
		return {
			x: currentX,
			y: currentY,
			moveDir: { x: 0, y: 0 }
		};
	}

	const dir = { x: dx / dist, y: dy / dist };
	const speedScale = slowRadius > 0 && dist < slowRadius ? Math.max(0.2, dist / slowRadius) : 1;
	const step = Math.min(dist, speed * speedScale * dtSeconds);
	return {
		x: currentX + dir.x * step,
		y: currentY + dir.y * step,
		moveDir: dir
	};
}

export function resolveMinimumSpacing<T extends { x: number; y: number; radius?: number }>(
	entities: T[],
	minGap: number,
	iterations = 1
) {
	for (let iteration = 0; iteration < iterations; iteration += 1) {
		for (let i = 0; i < entities.length; i += 1) {
			for (let j = i + 1; j < entities.length; j += 1) {
				const a = entities[i];
				const b = entities[j];
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const dist = Math.hypot(dx, dy) || 0.0001;
				const radiusA = a.radius ?? 0;
				const radiusB = b.radius ?? 0;
				const required = radiusA + radiusB + minGap;
				if (dist >= required) continue;

				const overlap = (required - dist) / 2;
				const nx = dx / dist;
				const ny = dy / dist;
				a.x -= nx * overlap;
				a.y -= ny * overlap;
				b.x += nx * overlap;
				b.y += ny * overlap;
			}
		}
	}
}
