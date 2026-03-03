<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';

	const dispatch = createEventDispatcher();

	export let show = false;

	let videoElement: HTMLVideoElement;
	let fileInputElement: HTMLInputElement;
	let cameraError = '';
	let cameraReady = false;
	let isStartingCamera = false;

	let mediaStream: MediaStream | null = null;

	const attachStreamToVideo = async () => {
		if (!videoElement || !mediaStream) return;

		if (videoElement.srcObject !== mediaStream) {
			videoElement.srcObject = mediaStream;
		}

		try {
			await videoElement.play();
			cameraReady = videoElement.videoWidth > 0 && videoElement.videoHeight > 0;
		} catch {
			cameraReady = false;
		}
	};

	const startCamera = async () => {
		cameraError = '';
		cameraReady = false;
		isStartingCamera = true;
		try {
			mediaStream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: { ideal: 'environment' }
				},
				audio: false
			});
			await attachStreamToVideo();
		} catch (error) {
			const errorName = error?.name ?? '';
			if (errorName === 'NotAllowedError') {
				cameraError = '未获得摄像头权限，请在浏览器里允许摄像头访问。';
			} else if (errorName === 'NotFoundError') {
				cameraError = '未检测到可用摄像头设备。';
			} else if (errorName === 'NotReadableError') {
				cameraError = '摄像头被其他应用占用，请关闭后重试。';
			} else {
				cameraError = '摄像头不可用，请改用相册导入。';
			}
		} finally {
			isStartingCamera = false;
		}
	};

	const stopCamera = () => {
		cameraReady = false;
		isStartingCamera = false;
		if (videoElement) {
			videoElement.pause();
			videoElement.srcObject = null;
		}

		if (!mediaStream) return;
		for (const track of mediaStream.getTracks()) {
			track.stop();
		}
		mediaStream = null;
	};

	$: if (show && videoElement && mediaStream) {
		attachStreamToVideo();
	}

	$: if (show) {
		startCamera();
	} else {
		stopCamera();
	}

	onDestroy(() => {
		stopCamera();
	});

	const close = () => {
		show = false;
		dispatch('close');
	};

	const emitCapturedFile = async (file: File) => {
		dispatch('capture', { file });
		close();
	};

	const capturePhoto = async () => {
		if (!cameraReady || !videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
			cameraError = '相机尚未就绪，请稍后重试。';
			return;
		}

		const canvas = document.createElement('canvas');
		const vw = videoElement.videoWidth;
		const vh = videoElement.videoHeight;

		canvas.width = vw;
		canvas.height = vh;
		const ctx = canvas.getContext('2d');
		ctx?.drawImage(videoElement, 0, 0, vw, vh);
		

		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
		if (!blob) {
			cameraError = '拍照失败，请重试。';
			return;
		}

		const file = new File([blob], `photo-question-${Date.now()}.jpg`, { type: 'image/jpeg' });
		await emitCapturedFile(file);
	};

	const handleImport = async (event) => {
		const file = event.target?.files?.[0];
		if (!file) return;
		await emitCapturedFile(file);
	};
</script>

{#if show}
	<div class="fixed inset-0 z-[80] bg-black text-white">
		{#if mediaStream}
			<video
				bind:this={videoElement}
				class="absolute inset-0 h-full w-full object-cover"
				playsinline
				muted
				on:loadedmetadata={() => {
					cameraReady = videoElement.videoWidth > 0 && videoElement.videoHeight > 0;
				}}
				on:canplay={() => {
					cameraReady = videoElement.videoWidth > 0 && videoElement.videoHeight > 0;
				}}
			/>
		{:else}
			<div class="absolute inset-0 bg-black/95" />
		{/if}

		<div class="absolute inset-0 flex flex-col justify-between p-4">
			<div class="flex items-center justify-between">
				<button class="rounded-full bg-black/40 px-4 py-2 text-sm" on:click={close}>关闭</button>
			</div>

			

			<div class="mb-2 flex flex-col items-center gap-4">
				{#if !cameraReady && !cameraError}
					<div class="rounded-xl bg-black/50 px-3 py-2 text-sm">{isStartingCamera ? '正在启动相机…' : '等待相机画面…'}</div>
				{/if}

				{#if cameraError}
					<div class="rounded-xl bg-red-500/80 px-3 py-2 text-sm">{cameraError}</div>
				{/if}


				<button
					class="h-20 w-20 rounded-full border-4 border-white bg-sky-500 shadow-lg disabled:opacity-50"
					disabled={!cameraReady}
					on:click={capturePhoto}
				/>
			</div>
		</div>

		<input
			bind:this={fileInputElement}
			type="file"
			accept="image/*"
			hidden
			on:change={handleImport}
		/>
	</div>
{/if}
