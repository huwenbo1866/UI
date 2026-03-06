<script lang="ts">
	import { onDestroy } from 'svelte';

	export let state: 'idle' | 'speaking' = 'idle';
	export let size = 44;

	const idleSrc = '/static/XiaoLing/idle.png';

	const talkFrames = [
		'/static/XiaoLing/talk1.png',
		'/static/XiaoLing/talk2.png',
		'/static/XiaoLing/talk3.png',
		'/static/XiaoLing/talk2.png'
	];

	let frameIndex = 0;
	let timer: ReturnType<typeof setInterval> | null = null;
	let activeMode: 'idle' | 'speaking' = 'idle';

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
	}

	function enterSpeaking() {
		if (activeMode === 'speaking' && timer) return;
		clearTimer();
		activeMode = 'speaking';
		frameIndex = 0;

		timer = setInterval(() => {
			frameIndex = (frameIndex + 1) % talkFrames.length;
		}, 1000);
	}

	$: if (state === 'speaking') {
		enterSpeaking();
	} else {
		enterIdle();
	}

	$: currentSrc = state === 'speaking' ? talkFrames[frameIndex] : idleSrc;

	onDestroy(() => {
		clearTimer();
	});
</script>

<img
	src={currentSrc}
	alt="小玲"
	class="xiaoling-avatar"
	class:speaking={state === 'speaking'}
	style={`width:${size}px;height:${size}px;`}
/>

<style>
	.xiaoling-avatar {
		object-fit: contain;
		display: block;
		pointer-events: none;
		user-select: none;
		transform-origin: center;
		flex-shrink: 0;
	}

	.xiaoling-avatar.speaking {
		animation: xiaoling-float 1.1s ease-in-out infinite;
	}

	@keyframes xiaoling-float {
		0% { transform: translateY(0px) scale(1); }
		50% { transform: translateY(-2px) scale(1.03); }
		100% { transform: translateY(0px) scale(1); }
	}
</style>