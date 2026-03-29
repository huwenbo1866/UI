<script lang="ts">
	import { getContext } from 'svelte';
	const i18n = getContext('i18n');

	export let items: Array<{
		id?: string;
		title: string;
		start_page?: number;
		end_page?: number;
		order_index?: number;
	}> = [];
	export let selectedIndex: number = -1;
	export let onClick: (item: any, index: number) => void = () => {};
	export let type: 'chapter' | 'section' = 'chapter';
	export let actionLabel: string | null = null;
	export let actionTitle: string | null = null;
	export let onActionClick: (item: any, index: number) => void = () => {};
</script>

<div class="flex flex-col h-full overflow-y-auto">
	<div
		class="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b dark:border-gray-700"
	>
		{#if type === 'chapter'}
			{$i18n.t('目录')}
		{:else}
			{$i18n.t('Sections')}
		{/if}
		<span class="ml-1 text-gray-400">({items.length})</span>
	</div>

	{#if items.length === 0}
		<div class="flex items-center justify-center py-8 text-xs text-gray-400">
			{#if type === 'chapter'}
				{$i18n.t('No chapters found')}
			{:else}
				{$i18n.t('No sections found')}
			{/if}
		</div>
	{:else}
		<div class="flex flex-col">
			{#each items as item, index}
				<div
					class="flex items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 border-b dark:border-gray-800
						{selectedIndex === index
						? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500'
						: 'border-l-2 border-l-transparent'}"
				>
					<button
						type="button"
						class="min-w-0 flex-1 flex items-start gap-2 text-left"
						on:click={() => onClick(item, index)}
					>
						<span
							class="shrink-0 w-5 h-5 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400"
						>
							{index + 1}
						</span>
						<div class="flex flex-col min-w-0">
							<span class="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2">
								{item.title}
							</span>
							{#if type === 'chapter' && item.start_page !== undefined}
								<span class="text-xs text-gray-400 mt-0.5">
									p.{item.start_page + 1} - p.{(item.end_page ?? item.start_page) + 1}
								</span>
							{/if}
						</div>
					</button>

					{#if actionLabel}
						<button
							type="button"
							class="shrink-0 rounded-md border border-pink-200 bg-white px-2 py-1 text-xs text-pink-600 transition-colors hover:bg-pink-50 dark:border-pink-900/40 dark:bg-gray-900 dark:text-pink-300 dark:hover:bg-pink-950/30"
							title={actionTitle ?? actionLabel}
							on:click|stopPropagation={() => onActionClick(item, index)}
						>
							{actionLabel}
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
