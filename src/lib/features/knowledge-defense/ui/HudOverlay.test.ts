import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import HudOverlay from './HudOverlay.svelte';

describe('HudOverlay', () => {
	it('renders a compact 5-slot action bar', () => {
		const { body } = render(HudOverlay, {
			props: {
				pendingRewards: 1,
				rewardRerollsRemaining: 2,
				equippedWeaponTitle: '直射主武器',
				actionCooldownMs: { H: 0, J: 0, K: 3200, L: 0 },
				actionSlots: {
					H: { title: '脉冲', hint: '范围清场', level: 2, maxLevel: 3 },
					J: null,
					K: { title: '空手道', hint: '近战短打', level: 1, maxLevel: 4 },
					L: null
				},
				activeBuffs: [
					{
						id: 'shield',
						label: '格挡护盾',
						detail: '剩余 1 次',
						tone: 'shield'
					}
				]
			}
		});

		expect(body).toContain('主武器');
		expect(body).toContain('直射主武器');
		expect(body).toContain('H');
		expect(body).toContain('脉冲');
		expect(body).toContain('K');
		expect(body).toContain('空手道');
		expect(body).toContain('奖励待领');
		expect(body).toContain('重随机会 2');
		expect(body).toContain('格挡护盾');
	});
});
