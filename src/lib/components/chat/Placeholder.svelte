<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { marked } from 'marked';

	import { onMount, getContext, tick, createEventDispatcher } from 'svelte';
	import { blur, fade } from 'svelte/transition';

	const dispatch = createEventDispatcher();

	import { getChatList } from '$lib/apis/chats';
	import { updateFolderById } from '$lib/apis/folders';

	import XiaoLingAvatar from '$lib/components/chat/XiaoLingAvatar.svelte';
	import { xiaolingState } from '$lib/stores/xiaoling';

	import {
		config,
		user,
		models as _models,
		temporaryChatEnabled,
		selectedFolder,
		chats,
		currentChatPage
	} from '$lib/stores';
	import { sanitizeResponseContent, extractCurlyBraceWords } from '$lib/utils';
	import { WEBUI_API_BASE_URL, WEBUI_BASE_URL } from '$lib/constants';

	import Suggestions from './Suggestions.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import EyeSlash from '$lib/components/icons/EyeSlash.svelte';
	import MessageInput from './MessageInput.svelte';
	import FolderPlaceholder from './Placeholder/FolderPlaceholder.svelte';
	import FolderTitle from './Placeholder/FolderTitle.svelte';

	const i18n = getContext('i18n');

	export let createMessagePair: Function;
	export let stopResponse: Function;

	export let autoScroll = false;

	export let atSelectedModel: Model | undefined;
	export let selectedModels: [''];

	export let history;

	export let prompt = '';
	export let files = [];
	export let messageInput = null;

	export let selectedToolIds = [];
	export let selectedFilterIds = [];

	export let showCommands = false;

	export let imageGenerationEnabled = false;
	export let codeInterpreterEnabled = false;
	export let webSearchEnabled = false;

	export let onUpload: Function = (e) => {};
	export let onSelect = (e) => {};
	export let onChange = (e) => {};

	export let toolServers = [];

	let models = [];
	let selectedModelIdx = 0;

	$: if (selectedModels.length > 0) {
		selectedModelIdx = models.length - 1;
	}

	$: models = selectedModels.map((id) => $_models.find((m) => m.id === id));

	let homepageXiaoLingState: 'idle' | 'sleep1' | 'sleep2' | 'sleep3' = 'idle';

	$: {
		if ($xiaolingState === 'sleep1' || $xiaolingState === 'sleep2' || $xiaolingState === 'sleep3') {
			homepageXiaoLingState = $xiaolingState;
		} else {
			homepageXiaoLingState = 'idle';
		}
	}
</script>

<div class="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-10 py-10">
	{#if $temporaryChatEnabled}
		<Tooltip
			content={$i18n.t("This chat won't appear in history and your messages will not be saved.")}
			className="w-full flex justify-center mb-2"
			placement="top"
		>
			<div class="flex items-center gap-2 text-gray-500 text-base w-fit">
				<EyeSlash strokeWidth="2.5" className="size-4" />{$i18n.t('Temporary Chat')}
			</div>
		</Tooltip>
	{/if}

	{#if $selectedFolder}
		<!-- Folder 模式先保持原逻辑（不做 A1 深改） -->
		<div class="a1-card p-5 sm:p-6 lg:p-7">
			<FolderTitle
				folder={$selectedFolder}
				onUpdate={async (folder) => {
					await chats.set(await getChatList(localStorage.token, $currentChatPage));
					currentChatPage.set(1);
				}}
				onDelete={async () => {
					await chats.set(await getChatList(localStorage.token, $currentChatPage));
					currentChatPage.set(1);
					selectedFolder.set(null);
				}}
			/>

			<div class="mt-4">
				<div class="a1-card-soft p-2">
					<MessageInput
						bind:this={messageInput}
						{history}
						{selectedModels}
						bind:files
						bind:prompt
						bind:autoScroll
						bind:selectedToolIds
						bind:selectedFilterIds
						bind:imageGenerationEnabled
						bind:codeInterpreterEnabled
						bind:webSearchEnabled
						bind:atSelectedModel
						bind:showCommands
						{toolServers}
						{stopResponse}
						{createMessagePair}
						placeholder={$i18n.t('How can I help you today?')}
						{onChange}
						{onUpload}
						on:submit={(e) => dispatch('submit', e.detail)}
					/>
				</div>
			</div>
		</div>

		<div class="mx-auto mt-6 px-4 md:max-w-3xl md:px-6 font-primary min-h-62">
			<FolderPlaceholder folder={$selectedFolder} />
		</div>
	{:else}
		<div class="mb-4 flex justify-center">
			<XiaoLingAvatar state={homepageXiaoLingState} size={220} />
		</div>
		
		<!-- A1：首页“卡片工作台” -->
		<section class="a1-card p-5 sm:p-6 lg:p-7">
			<div class="flex flex-col items-center text-center">
				{#if models[selectedModelIdx]?.info?.meta?.description ?? null}
					<div class="mt-2">
						<Tooltip
							className="w-fit"
							content={marked.parse(
								sanitizeResponseContent(
									models[selectedModelIdx]?.info?.meta?.description ?? ''
								).replaceAll('\n', '<br>')
							)}
							placement="top"
						>
							<div class="px-2 text-sm font-normal text-gray-500 dark:text-gray-400 line-clamp-2 max-w-2xl markdown">
								{@html marked.parse(
									sanitizeResponseContent(
										models[selectedModelIdx]?.info?.meta?.description ?? ''
									).replaceAll('\n', '<br>')
								)}
							</div>
						</Tooltip>
					</div>
				{/if}
			</div>


			<!-- 输入框：用软卡片包一层-->
			<div class="mt-5">
				
					<MessageInput
						bind:this={messageInput}
						{history}
						{selectedModels}
						bind:files
						bind:prompt
						bind:autoScroll
						bind:selectedToolIds
						bind:selectedFilterIds
						bind:imageGenerationEnabled
						bind:codeInterpreterEnabled
						bind:webSearchEnabled
						bind:atSelectedModel
						bind:showCommands
						{toolServers}
						{stopResponse}
						{createMessagePair}
						placeholder={$i18n.t('How can I help you today?')}
						{onChange}
						{onUpload}
						on:submit={(e) => dispatch('submit', e.detail)}
					/>
				
			</div>

			<!-- 建议：用 a1-suggestions 容器 + 单列卡片 -->
			<div class="mt-5 a1-suggestions">
				<Suggestions
					className="grid grid-cols-1 gap-3"
					suggestionPrompts={atSelectedModel?.info?.meta?.suggestion_prompts ??
						models[selectedModelIdx]?.info?.meta?.suggestion_prompts ??
						$config?.default_prompt_suggestions ??
						[]}
					inputValue={prompt}
					{onSelect}
				/>
			</div>
		</section>
	{/if}
</div>