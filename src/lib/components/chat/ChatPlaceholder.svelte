<script lang="ts">
	import { WEBUI_API_BASE_URL, WEBUI_BASE_URL } from '$lib/constants';
	import { marked } from 'marked';

	import { config, user, models as _models, temporaryChatEnabled } from '$lib/stores';
	import { onMount, getContext } from 'svelte';

	import { blur, fade } from 'svelte/transition';

	import Suggestions from './Suggestions.svelte';
	import { sanitizeResponseContent } from '$lib/utils';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import EyeSlash from '$lib/components/icons/EyeSlash.svelte';

	const i18n = getContext('i18n');

	export let modelIds = [];
	export let models = [];
	export let atSelectedModel;

	export let onSelect = (e) => {};

	let mounted = false;
	let selectedModelIdx = 0;

	$: if (modelIds.length > 0) {
		selectedModelIdx = models.length - 1;
	}

	$: models = modelIds.map((id) => $_models.find((m) => m.id === id));

	onMount(() => {
		mounted = true;
	});
</script>

{#key mounted}
	<div class="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-10 py-10">
		<section class="a1-card p-5 sm:p-6 lg:p-7">
			{#if $temporaryChatEnabled}
				<Tooltip
					content={$i18n.t("This chat won't appear in history and your messages will not be saved.")}
					className="w-full flex justify-start mb-3"
					placement="top"
				>
					<div class="flex items-center gap-2 text-gray-500 text-base w-fit">
						<EyeSlash strokeWidth="2.5" className="size-4" />
						{$i18n.t('Temporary Chat')}
					</div>
				</Tooltip>
			{/if}

			<!-- A1 标题区：更紧凑、更像面板头 -->
			<div class="flex items-center gap-4 font-primary text-left">
				<div>
					<div class="capitalize line-clamp-1 text-3xl sm:text-4xl text-gray-800 dark:text-gray-100" in:fade={{ duration: 200 }}>
						小玲
					</div>

					<div class="mt-2" in:fade={{ duration: 200, delay: 200 }}>
						<div class="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 font-p">
							{$i18n.t('How can I help you today?')}
						</div>
					</div>
				</div>
			</div>

			<!-- A1 建议：单列 + 卡片化容器 -->
			<div class="mt-5 a1-suggestions w-full font-primary" in:fade={{ duration: 200, delay: 300 }}>
				<Suggestions
					className="grid grid-cols-1 gap-3"
					suggestionPrompts={atSelectedModel?.info?.meta?.suggestion_prompts ??
						models[selectedModelIdx]?.info?.meta?.suggestion_prompts ??
						$config?.default_prompt_suggestions ??
						[]}
					{onSelect}
				/>
			</div>
		</section>
	</div>
{/key}
