<script lang="ts">
	import { toast } from 'svelte-sonner';
	import dayjs from 'dayjs';
	import { createEventDispatcher } from 'svelte';
	import { getContext } from 'svelte';

	import { goto } from '$app/navigation';

	import {
		updateUserById,
		getUserGroupsById,
		getUserLearningProfile,
		type UserLearningProfile
	} from '$lib/apis/users';

	import Modal from '$lib/components/common/Modal.svelte';
	import localizedFormat from 'dayjs/plugin/localizedFormat';
	import XMark from '$lib/components/icons/XMark.svelte';
	import SensitiveInput from '$lib/components/common/SensitiveInput.svelte';
	import UserProfileImage from '$lib/components/chat/Settings/Account/UserProfileImage.svelte';

	const i18n = getContext('i18n');
	const dispatch = createEventDispatcher();
	dayjs.extend(localizedFormat);

	type EditableUser = {
		id?: string;
		profile_image_url: string;
		role: string;
		name: string;
		email: string;
		password: string;
		settings?: Record<string, any>;
		oauth?: Record<string, any>;
		created_at?: number;
	};

	export let show = false;
	export let selectedUser;
	export let sessionUser;

	$: if (show) {
		init();
	}

	const init = () => {
		if (selectedUser) {
			_user = {
				...selectedUser,
				password: '',
				settings: selectedUser.settings
					? JSON.parse(JSON.stringify(selectedUser.settings))
					: undefined
			};
			learningProfile = null;
			loadUserGroups();
			loadLearningProfile();
		}
	};

	let _user: EditableUser = {
		profile_image_url: '',
		role: 'pending',
		name: '',
		email: '',
		password: '',
		settings: undefined
	};

	let userGroups: any[] | null = null;
	let learningProfile: UserLearningProfile | null = null;
	let loadingLearningProfile = false;

	const ensureLearningProfileSettings = () => {
		if (!_user.settings || typeof _user.settings !== 'object') {
			_user.settings = {};
		}

		if (!_user.settings.ui || typeof _user.settings.ui !== 'object') {
			_user.settings.ui = {};
		}

		if (
			!_user.settings.ui.learning_profile ||
			typeof _user.settings.ui.learning_profile !== 'object'
		) {
			_user.settings.ui.learning_profile = {};
		}

		return _user.settings.ui.learning_profile;
	};

	const setSelectedCapability = (capabilityKey: string | null) => {
		const learningProfileSettings = ensureLearningProfileSettings();
		learningProfileSettings.selected_capability = capabilityKey;

		if (learningProfile) {
			learningProfile = {
				...learningProfile,
				selected_capability: capabilityKey,
				capabilities: learningProfile.capabilities.map((capability) => ({
					...capability,
					selected: capability.key === capabilityKey
				}))
			};
		}
	};

	const submitHandler = async () => {
		const res = await updateUserById(localStorage.token, selectedUser.id, _user).catch((error) => {
			toast.error(`${error}`);
		});

		if (res) {
			dispatch('save');
			show = false;
		}
	};

	const loadUserGroups = async () => {
		if (!selectedUser?.id) return;
		userGroups = null;

		userGroups = await getUserGroupsById(localStorage.token, selectedUser.id).catch((error) => {
			toast.error(`${error}`);
			return null;
		});
	};

	const loadLearningProfile = async () => {
		if (!selectedUser?.id) return;
		loadingLearningProfile = true;

		learningProfile = await getUserLearningProfile(localStorage.token, selectedUser.id).catch(
			(error) => {
				toast.error(`${error}`);
				return null;
			}
		);

		if (learningProfile) {
			setSelectedCapability(learningProfile.selected_capability ?? null);
		}

		loadingLearningProfile = false;
	};
</script>

<Modal size="sm" bind:show>
	<div>
		<div class=" flex justify-between dark:text-gray-300 px-5 pt-4 pb-2">
			<div class=" text-lg font-medium self-center">{$i18n.t('Edit User')}</div>
			<button
				class="self-center"
				on:click={() => {
					show = false;
				}}
			>
				<XMark className={'size-5'} />
			</button>
		</div>

		<div class="flex flex-col md:flex-row w-full md:space-x-4 dark:text-gray-200">
			<div class=" flex flex-col w-full sm:flex-row sm:justify-center sm:space-x-6">
				<form
					class="flex flex-col w-full"
					on:submit|preventDefault={() => {
						submitHandler();
					}}
				>
					<div class=" px-5 pt-3 pb-5 w-full">
						<div class="flex self-center w-full">
							<div class=" self-start h-full mr-6">
								<UserProfileImage
									imageClassName="size-14"
									bind:profileImageUrl={_user.profile_image_url}
									user={_user}
								/>
							</div>

							<div class=" flex-1">
								<div class="overflow-hidden w-ful mb-2">
									<div class=" self-center capitalize font-medium truncate">
										{selectedUser.name}
									</div>

									<div class="text-xs text-gray-500">
										{$i18n.t('Created at')}
										{dayjs(selectedUser.created_at * 1000).format('LL')}
									</div>
								</div>

								<div class=" flex flex-col space-y-1.5">
									{#if (userGroups ?? []).length > 0}
										<div class="flex flex-col w-full text-sm">
											<div class="mb-1 text-xs text-gray-500">{$i18n.t('User Groups')}</div>

											<div class="flex flex-wrap gap-1 my-0.5 -mx-1">
												{#each userGroups as userGroup}
													<span
														class="px-1.5 py-0.5 rounded-xl bg-gray-100 dark:bg-gray-850 text-xs"
													>
														<a
															href={'/admin/users/groups?id=' + userGroup.id}
															on:click|preventDefault={() =>
																goto('/admin/users/groups?id=' + userGroup.id)}
														>
															{userGroup.name}
														</a>
													</span>
												{/each}
											</div>
										</div>
									{/if}

									<div class="flex flex-col w-full">
										<div class=" mb-1 text-xs text-gray-500">{$i18n.t('Role')}</div>

										<div class="flex-1">
											<select
												class="w-full dark:bg-gray-900 text-sm bg-transparent disabled:text-gray-500 dark:disabled:text-gray-500 outline-hidden"
												bind:value={_user.role}
												disabled={_user.id == sessionUser.id}
												required
											>
												<option value="admin">{$i18n.t('Admin')}</option>
												<option value="user">{$i18n.t('User')}</option>
												<option value="pending">{$i18n.t('Pending')}</option>
											</select>
										</div>
									</div>

									<div class="flex flex-col w-full">
										<div class=" mb-1 text-xs text-gray-500">{$i18n.t('Name')}</div>

										<div class="flex-1">
											<input
												class="w-full text-sm bg-transparent outline-hidden"
												type="text"
												bind:value={_user.name}
												placeholder={$i18n.t('Enter Your Name')}
												autocomplete="off"
												required
											/>
										</div>
									</div>

									<div class="flex flex-col w-full">
										<div class=" mb-1 text-xs text-gray-500">{$i18n.t('Email')}</div>

										<div class="flex-1">
											<input
												class="w-full text-sm bg-transparent disabled:text-gray-500 dark:disabled:text-gray-500 outline-hidden"
												type="email"
												bind:value={_user.email}
												placeholder={$i18n.t('Enter Your Email')}
												autocomplete="off"
												required
											/>
										</div>
									</div>

									{#if _user?.oauth}
										<div class="flex flex-col w-full">
											<div class=" mb-1 text-xs text-gray-500">{$i18n.t('OAuth ID')}</div>

											<div class="flex-1 text-sm break-all mb-1 flex flex-col space-y-1">
												{#each Object.keys(_user.oauth) as key}
													<div>
														<span class="text-gray-500">{key}</span>
														<span class="">{_user.oauth[key]?.sub}</span>
													</div>
												{/each}
											</div>
										</div>
									{/if}

									<div class="flex flex-col w-full">
										<div class=" mb-1 text-xs text-gray-500">{$i18n.t('New Password')}</div>

										<div class="flex-1">
											<SensitiveInput
												class="w-full text-sm bg-transparent outline-hidden"
												type="password"
												placeholder={$i18n.t('Enter New Password')}
												bind:value={_user.password}
												autocomplete="new-password"
												required={false}
											/>
										</div>
									</div>

									<div
										class="mt-2 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-950/60 p-3"
									>
										<div class="flex items-start justify-between gap-3">
											<div>
												<div class="text-sm font-medium text-gray-900 dark:text-gray-100">
													培养能力
												</div>
												<div class="mt-1 text-xs text-gray-500">
													同一时间只能选择一个培养方向，点击保存后，AI 会自动使用对应的引导式回答
													prompt。
												</div>
											</div>

											{#if learningProfile}
												<div class="text-[11px] text-right text-gray-500 leading-5">
													<div>{learningProfile.metric_label}</div>
													<div>最近 {learningProfile.sample_count} 条学习交互</div>
												</div>
											{/if}
										</div>

										{#if learningProfile?.brain_profile}
											<div
												class="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900/70 dark:bg-emerald-950/20"
											>
												<div class="flex items-start justify-between gap-3">
													<div>
														<div class="text-xs text-emerald-700 dark:text-emerald-300">
															{learningProfile.brain_profile.metric_label}
														</div>
														<div
															class="mt-1 text-2xl font-semibold text-emerald-900 dark:text-emerald-100"
														>
															{#if learningProfile.brain_profile.score != null}
																{learningProfile.brain_profile.score.toFixed(2)}
															{:else}
																--
															{/if}
														</div>
													</div>

													<div class="text-right">
														<div class="text-xs text-emerald-700 dark:text-emerald-300">
															当前 Prompt 策略
														</div>
														<div
															class="mt-1 text-sm font-medium text-emerald-900 dark:text-emerald-100"
														>
															{learningProfile.brain_profile.strategy_label ?? '等待生成'}
														</div>
													</div>
												</div>

												<div class="mt-2 text-xs text-emerald-700/80 dark:text-emerald-300/80">
													已同步 {learningProfile.brain_profile.total_message_count} 条聊天记录
													{#if learningProfile.brain_profile.path_name}
														· 分类 {learningProfile.brain_profile.path_name}
													{/if}
													{#if learningProfile.brain_profile.path_confidence != null}
														· 置信度 {(learningProfile.brain_profile.path_confidence * 100).toFixed(
															0
														)}%
													{/if}
													{#if learningProfile.brain_profile.intensity_bucket}
														· 强度 {learningProfile.brain_profile.intensity_bucket}
													{/if}
												</div>

												{#if learningProfile.brain_profile.score == null}
													<div class="mt-2 text-xs text-emerald-700/80 dark:text-emerald-300/80">
														当前累计聊天记录还不足以完成回归/分类；满
														{learningProfile.brain_profile.minimum_message_count} 条后会首次分析， 之后每新增
														{learningProfile.brain_profile.new_message_threshold} 条会自动刷新。
													</div>
												{/if}
											</div>
										{/if}

										{#if loadingLearningProfile}
											<div class="py-4 text-xs text-gray-500">正在生成能力画像...</div>
										{:else if learningProfile?.capabilities?.length}
											<div class="mt-3 flex flex-col gap-2">
												{#each learningProfile.capabilities as capability}
													<button
														class={`w-full rounded-2xl border px-3 py-2.5 text-left transition ${
															capability.selected
																? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/30'
																: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900/70 dark:hover:border-gray-700'
														}`}
														type="button"
														on:click={() => setSelectedCapability(capability.key)}
													>
														<div class="flex items-start justify-between gap-3">
															<div class="min-w-0 flex-1">
																<div class="flex items-center justify-between gap-3">
																	<div
																		class="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
																	>
																		{capability.label}
																	</div>

																	<div
																		class="shrink-0 text-sm font-semibold text-gray-700 dark:text-gray-200"
																	>
																		{learningProfile.metric_label}
																		{capability.score.toFixed(1)}
																	</div>
																</div>

																<div class="mt-1 text-xs text-gray-500">
																	{capability.description}
																</div>
															</div>

															<div
																class={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
																	capability.selected
																		? 'border-blue-500 bg-blue-500 text-white'
																		: 'border-gray-300 text-transparent dark:border-gray-700'
																}`}
															>
																✓
															</div>
														</div>
													</button>
												{/each}
											</div>
										{:else}
											<div class="py-4 text-xs text-gray-500">
												暂无足够的学习交互数据，系统会随着学生继续使用自动生成成长指数。
											</div>
										{/if}
									</div>
								</div>
							</div>
						</div>

						<div class="flex justify-end pt-3 text-sm font-medium">
							<button
								class="px-3.5 py-1.5 text-sm font-medium bg-black hover:bg-gray-900 text-white dark:bg-white dark:text-black dark:hover:bg-gray-100 transition rounded-full flex flex-row space-x-1 items-center"
								type="submit"
							>
								{$i18n.t('Save')}
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	</div>
</Modal>

<style>
	input::-webkit-outer-spin-button,
	input::-webkit-inner-spin-button {
		/* display: none; <- Crashes Chrome on hover */
		-webkit-appearance: none;
		margin: 0; /* <-- Apparently some margin are still there even though it's hidden */
	}

	.tabs::-webkit-scrollbar {
		display: none; /* for Chrome, Safari and Opera */
	}

	.tabs {
		-ms-overflow-style: none; /* IE and Edge */
		scrollbar-width: none; /* Firefox */
	}

	input[type='number'] {
		-moz-appearance: textfield; /* Firefox */
	}
</style>
