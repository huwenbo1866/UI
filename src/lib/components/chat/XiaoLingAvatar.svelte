<script lang="ts">
	import { onDestroy } from 'svelte';

	export let state: 'idle' | 'speaking' | 'sleep1' | 'sleep2' | 'sleep3' = 'idle';
	export let size = 46;

	const idleSrc = '/static/XiaoLing/idle.png';

	const talkFrames = [
		'/static/XiaoLing/talk1.png',
		'/static/XiaoLing/talk2.png',
		'/static/XiaoLing/talk1.png',
		'/static/XiaoLing/talk3.png'
	];

	const sleepMap = {
		sleep1: '/static/XiaoLing/sleep1.png',
		sleep2: '/static/XiaoLing/sleep2.png',
		sleep3: '/static/XiaoLing/sleep3.png'
	} as const;

	let frameIndex = 0;
	let timer: ReturnType<typeof setInterval> | null = null;
	let currentSrc = idleSrc;
	let activeMode: 'idle' | 'speaking' | 'sleep1' | 'sleep2' | 'sleep3' = 'idle';

	function clearTimer() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}

	function enterIdle() {
		if (activeMode === 'idle') return;
		clearTimer();
		activeMode = 'idle';
		frameIndex = 0;
		currentSrc = idleSrc;
	}

	function enterSpeaking() {
		if (activeMode === 'speaking') return;

		clearTimer();
		activeMode = 'speaking';
		frameIndex = 0;
		currentSrc = talkFrames[frameIndex];

		timer = setInterval(() => {
			frameIndex = (frameIndex + 1) % talkFrames.length;
			currentSrc = talkFrames[frameIndex];
		}, 1000);
	}

	function enterSleep(mode: 'sleep1' | 'sleep2' | 'sleep3') {
		if (activeMode === mode) return;
		clearTimer();
		activeMode = mode;
		currentSrc = sleepMap[mode];
	}

	$: {
		if (state === 'speaking') {
			enterSpeaking();
		} else if (state === 'sleep1' || state === 'sleep2' || state === 'sleep3') {
			enterSleep(state);
		} else {
			enterIdle();
		}
	}

	onDestroy(() => {
		clearTimer();
	});
</script>

<img
	src={currentSrc}
	alt="小玲"
	class="xiaoling-avatar"
	style={`width:${size}px;height:${size}px;`}
/>

<style>
	.xiaoling-avatar {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		user-select: none;
		pointer-events: none;
		flex-shrink: 0;
	}
</style>