<script lang="ts">
	import Modal from '$lib/components/common/Modal.svelte';
	import Switch from '$lib/components/common/Switch.svelte';
	import { settings } from '$lib/stores';
	import { updateUserSettings } from '$lib/apis/users';
	import { toast } from 'svelte-sonner';

	export let show = false;

	let enableRuntime = true;
	let showGrowthPanel = true;

	$: learningProfile =
		$settings?.learning_profile && typeof $settings.learning_profile === 'object'
			? $settings.learning_profile
			: {};

	$: growth =
		learningProfile?.personalization_growth &&
		typeof learningProfile.personalization_growth === 'object'
			? learningProfile.personalization_growth
			: null;

	$: growthScore = Math.max(0, Math.min(100, Math.round((growth?.current_score ?? 0.5) * 100)));
	$: growthTrend = String(growth?.growth_trend ?? 'flat').toLowerCase();
	$: trendLabel =
		growthTrend === 'up'
			? '小火箭上升'
			: growthTrend === 'down'
				? '需要多练练'
				: '稳稳进步中';
	$: trendHint =
		growthTrend === 'up'
			? '太棒啦，最近更贴合你的学习节奏了。'
			: growthTrend === 'down'
				? '别担心，多聊几次就会重新追上来。'
				: '继续保持，系统正在慢慢学会你的习惯。';

	$: tinyBars = [
		Math.max(22, growthScore - 14),
		Math.max(18, growthScore - 8),
		Math.max(20, growthScore - 4),
		Math.max(24, growthScore + 2),
		Math.max(26, growthScore + 8)
	];

	$: enableRuntime = learningProfile?.personalization_runtime_enabled ?? true;
	$: showGrowthPanel = learningProfile?.personalization_panel_enabled ?? true;

	const saveLearningProfile = async (overrides: Record<string, any>) => {
		const current =
			$settings?.learning_profile && typeof $settings.learning_profile === 'object'
				? $settings.learning_profile
				: {};

		const nextSettings = {
			...$settings,
			learning_profile: {
				...current,
				...overrides
			}
		};

		settings.set(nextSettings);
		await updateUserSettings(localStorage.token, { ui: nextSettings });
	};
</script>

<Modal size="md" bind:show>
	<div class="px-4 pb-4 pt-3 text-gray-800 dark:text-gray-100">
		<div class="flex items-center justify-between">
			<div>
				<div class="text-xl font-semibold">成长面板</div>
				<div class="mt-1 text-xs text-gray-500 dark:text-gray-400">和小玲一起，天天进步一点点</div>
			</div>
			<button
				type="button"
				class="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
				on:click={() => {
					show = false;
				}}
			>
				关闭
			</button>
		</div>

		<div class="mt-3 rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-4 dark:border-amber-800/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
			<div class="grid grid-cols-2 gap-3">
				<div class="rounded-2xl bg-white/80 p-3 dark:bg-gray-900/70">
					<div class="text-xs text-gray-500 dark:text-gray-400">今日成长分</div>
					<div class="mt-1 text-3xl font-black text-orange-500">{growthScore}</div>
				</div>
				<div class="rounded-2xl bg-white/80 p-3 dark:bg-gray-900/70">
					<div class="text-xs text-gray-500 dark:text-gray-400">成长状态</div>
					<div class="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{trendLabel}</div>
				</div>
			</div>

			<div class="mt-3 rounded-2xl bg-white/80 p-3 dark:bg-gray-900/70">
				<div class="text-xs text-gray-500 dark:text-gray-400">成长能量条</div>
				<div class="mt-2 flex h-16 items-end gap-1.5">
					{#each tinyBars as h, idx}
						<div
							aria-label={`成长柱-${idx}`}
							class="flex-1 rounded-t-xl bg-gradient-to-t from-amber-300 via-orange-400 to-rose-400"
							style={`height:${Math.min(100, h)}%`}
						></div>
					{/each}
				</div>
				<div class="mt-2 text-xs text-gray-600 dark:text-gray-300">{trendHint}</div>
			</div>
		</div>

		<div class="mt-3 rounded-2xl border border-gray-200 p-3 dark:border-gray-800">
			<div class="flex items-center justify-between py-1">
				<div>
					<div class="text-sm font-medium">开启个性化学习</div>
					<div class="text-xs text-gray-500 dark:text-gray-400">让回答更贴合你的节奏</div>
				</div>
				<Switch
					bind:state={enableRuntime}
					on:change={async () => {
						await saveLearningProfile({ personalization_runtime_enabled: enableRuntime });
						toast.success('已更新');
					}}
				/>
			</div>
			<div class="mt-2 flex items-center justify-between py-1">
				<div>
					<div class="text-sm font-medium">显示成长卡片</div>
					<div class="text-xs text-gray-500 dark:text-gray-400">在聊天中持续看见成长变化</div>
				</div>
				<Switch
					bind:state={showGrowthPanel}
					on:change={async () => {
						await saveLearningProfile({ personalization_panel_enabled: showGrowthPanel });
						toast.success('已更新');
					}}
				/>
			</div>
		</div>
	</div>
</Modal>
