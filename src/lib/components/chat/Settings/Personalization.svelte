<script lang="ts">
	import Switch from '$lib/components/common/Switch.svelte';
	import { config, models, settings, user } from '$lib/stores';
	import { createEventDispatcher, onMount, getContext, tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import ManageModal from './Personalization/ManageModal.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	const dispatch = createEventDispatcher();

	const i18n = getContext('i18n');

	export let saveSettings: Function;

	let showManageModal = false;

	// Addons
	let enableMemory = false;
	let enableStudentPersonalization = true;
	let showStudentPanel = true;
	let growthScore = 0;
	let growthMood = '在路上';
	let growthHint = '每天都会更了解你一点点';
	let growthBars: number[] = [];

	$: learningProfile =
		$settings?.learning_profile && typeof $settings.learning_profile === 'object'
			? $settings.learning_profile
			: {};
	$: personalizationGrowth =
		learningProfile?.personalization_growth &&
		typeof learningProfile.personalization_growth === 'object'
			? learningProfile.personalization_growth
			: null;
	$: growthTrendLabel =
		personalizationGrowth?.growth_trend === 'up'
			? $i18n.t('Improving')
			: personalizationGrowth?.growth_trend === 'down'
				? $i18n.t('Needs support')
				: $i18n.t('Stable');
	$: memoriesEnabled = $config?.features?.enable_memories ?? false;
	$: growthScore = Math.max(0, Math.min(100, Math.round((personalizationGrowth?.current_score ?? 0.5) * 100)));
	$: growthBars = [
		growthScore,
		Math.max(10, growthScore - 12),
		Math.max(16, growthScore - 6),
		Math.max(24, growthScore + 4),
		Math.max(18, growthScore + 10)
	];
	$: growthMood =
		personalizationGrowth?.growth_trend === 'up'
			? '越来越懂你'
			: personalizationGrowth?.growth_trend === 'down'
				? '需要多陪伴'
				: '慢慢成长中';
	$: growthHint =
		personalizationGrowth?.growth_trend === 'up'
			? '最近的回答更贴近你的学习节奏了'
			: personalizationGrowth?.growth_trend === 'down'
				? '可以多聊一会儿，帮助它更认识你'
				: '它正在积累你的学习偏好和表达习惯';

	const saveLearningProfileSettings = async (overrides = {}) => {
		const currentLearningProfile =
			$settings?.learning_profile && typeof $settings.learning_profile === 'object'
				? $settings.learning_profile
				: {};

		await saveSettings({
			learning_profile: {
				...currentLearningProfile,
				...overrides
			}
		});
	};

	onMount(async () => {
		enableMemory = $settings?.memory ?? false;
		enableStudentPersonalization =
			$settings?.learning_profile?.personalization_runtime_enabled ?? true;
		showStudentPanel = $settings?.learning_profile?.personalization_panel_enabled ?? true;
	});
</script>

<ManageModal bind:show={showManageModal} />

<form
	id="tab-personalization"
	class="flex flex-col h-full justify-between space-y-3 text-sm"
	on:submit|preventDefault={() => {
		dispatch('save');
	}}
>
	<div class="py-1 overflow-y-scroll max-h-[28rem] md:max-h-full">
		<div class="mb-5 rounded-[1.5rem] border border-amber-200/80 dark:border-amber-800/60 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 p-4 shadow-sm">
			<div class="flex items-start justify-between gap-3 mb-2">
				<div>
					<div class="text-lg font-semibold text-gray-900 dark:text-gray-100">我们的成长小站</div>
					<div class="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
						让助手更懂你的学习节奏、表达方式和需要帮助的地方。
					</div>
				</div>
				<Switch
					bind:state={enableStudentPersonalization}
					on:change={async () => {
						await saveLearningProfileSettings({
							personalization_runtime_enabled: enableStudentPersonalization
						});
					}}
				/>
			</div>

			<div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
				<div class="rounded-2xl bg-white/70 dark:bg-gray-900/70 border border-white/60 dark:border-gray-800 p-3">
					<div class="text-[11px] text-gray-500 dark:text-gray-400">成长分</div>
					<div class="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{growthScore}</div>
					<div class="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">{growthMood}</div>
				</div>
				<div class="rounded-2xl bg-white/70 dark:bg-gray-900/70 border border-white/60 dark:border-gray-800 p-3 sm:col-span-2">
					<div class="text-[11px] text-gray-500 dark:text-gray-400">成长小条</div>
					<div class="mt-2 flex items-end gap-1.5 h-16">
						{#each growthBars as bar, index}
							<div class="flex-1 rounded-t-xl bg-gradient-to-t from-amber-300 via-orange-400 to-rose-400 dark:from-amber-500 dark:via-orange-400 dark:to-pink-400 transition-all" style={`height:${Math.max(18, Math.min(100, bar))}%`} aria-label={`growth-bar-${index}`}></div>
						{/each}
					</div>
				</div>
			</div>

			<div class="mt-3 rounded-2xl bg-white/70 dark:bg-gray-900/70 border border-white/60 dark:border-gray-800 p-3">
				<div class="text-sm font-medium text-gray-900 dark:text-gray-100">{growthTrendLabel}</div>
				<div class="mt-1 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{growthHint}</div>
			</div>

			<div class="mt-3 flex items-center justify-between">
				<div class="text-xs text-gray-500 dark:text-gray-400">
					显示成长面板
				</div>
				<Switch
					bind:state={showStudentPanel}
					on:change={async () => {
						await saveLearningProfileSettings({ personalization_panel_enabled: showStudentPanel });
					}}
				/>
			</div>

			{#if showStudentPanel}
				<div class="mt-3 rounded-[1.25rem] border border-amber-200/80 dark:border-amber-800/60 bg-white/80 dark:bg-gray-900/80 p-3">
					<div class="text-xs font-medium text-gray-700 dark:text-gray-200 mb-2">
						成长小结
					</div>
					<div class="grid grid-cols-2 gap-2 text-xs">
						<div class="rounded-2xl bg-amber-50 dark:bg-amber-950/30 p-3 border border-amber-100 dark:border-amber-900/40">
							<div class="text-gray-500 dark:text-gray-400">当前成长分</div>
							<div class="text-gray-900 dark:text-gray-100 font-semibold text-lg mt-1">
								{personalizationGrowth?.current_score ?? '--'}
							</div>
						</div>
						<div class="rounded-2xl bg-orange-50 dark:bg-orange-950/30 p-3 border border-orange-100 dark:border-orange-900/40">
							<div class="text-gray-500 dark:text-gray-400">成长状态</div>
							<div class="text-gray-900 dark:text-gray-100 font-semibold text-lg mt-1">{growthTrendLabel}</div>
						</div>
					</div>
					<div class="mt-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
						{growthHint}
					</div>
				</div>
			{/if}
		</div>

		{#if memoriesEnabled}
			<div>
				<div class="flex items-center justify-between mb-1">
					<Tooltip
						content={$i18n.t(
							'This is an experimental feature, it may not function as expected and is subject to change at any time.'
						)}
					>
						<div class="text-sm font-medium">
							{$i18n.t('Memory')}

							<span class=" text-xs text-gray-500">({$i18n.t('Experimental')})</span>
						</div>
					</Tooltip>

					<div class="">
						<Switch
							bind:state={enableMemory}
							on:change={async () => {
								saveSettings({ memory: enableMemory });
							}}
						/>
					</div>
				</div>
			</div>

			<div class="text-xs text-gray-600 dark:text-gray-400">
				<div>
					{$i18n.t(
						"You can personalize your interactions with LLMs by adding memories through the 'Manage' button below, making them more helpful and tailored to you."
					)}
				</div>

				<!-- <div class="mt-3">
				To understand what LLM remembers or teach it something new, just chat with it:

				<div>- “Remember that I like concise responses.”</div>
				<div>- “I just got a puppy!”</div>
				<div>- “What do you remember about me?”</div>
				<div>- “Where did we leave off on my last project?”</div>
			</div> -->
			</div>

			<div class="mt-3 mb-1 ml-1">
				<button
					type="button"
					class=" px-3.5 py-1.5 font-medium hover:bg-black/5 dark:hover:bg-white/5 outline outline-1 outline-gray-300 dark:outline-gray-800 rounded-3xl"
					on:click={() => {
						showManageModal = true;
					}}
				>
					{$i18n.t('Manage')}
				</button>
			</div>
		{/if}
	</div>

	<div class="flex justify-end text-sm font-medium">
		<button
			class="px-3.5 py-1.5 text-sm font-medium bg-black hover:bg-gray-900 text-white dark:bg-white dark:text-black dark:hover:bg-gray-100 transition rounded-full"
			type="submit"
		>
			{$i18n.t('Save')}
		</button>
	</div>
</form>
