<script lang="ts">
	import { createEventDispatcher, onDestroy, tick } from 'svelte';
	import Portal from '$lib/components/common/Portal.svelte';

	const dispatch = createEventDispatcher();
	export let show = false;

	let videoElement: HTMLVideoElement;
	let fileInputElement: HTMLInputElement;

	let cameraError = '';
	let cameraReady = false;
	let isStartingCamera = false;
	let isCapturing = false;
	let isStabilizing = false;

	let mediaStream: MediaStream | null = null;

	// 防竞态：过期 start 作废
	let startSeq = 0;

	// 首帧门禁：稳定前不展示 video（避免启动抖动/绿块）
	let showVideo = false;

	// 调试信息：你能肉眼看到实际分辨率到底是多少
	let debugText = '';

	function stopStream(stream: MediaStream | null) {
		if (!stream) return;
		for (const track of stream.getTracks()) {
			try {
				track.stop();
			} catch {}
		}
	}

	async function attachStreamToVideo() {
		if (!videoElement || !mediaStream) return;
		if (videoElement.srcObject !== mediaStream) {
			videoElement.srcObject = mediaStream;
		}
		try {
			await videoElement.play();
		} catch {}
	}

	async function waitFirstFrame(seq: number) {
		if (!videoElement) return;
		const anyVideo = videoElement as any;

		// Chrome/Edge: 最可靠
		if (typeof anyVideo.requestVideoFrameCallback === 'function') {
			await new Promise<void>((resolve) => anyVideo.requestVideoFrameCallback(() => resolve()));
			return;
		}

		// fallback: 等 videoWidth/Height ready
		for (let i = 0; i < 40; i++) {
			if (seq !== startSeq || !show) return;
			if (videoElement.readyState >= 2 && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) return;
			await new Promise((r) => setTimeout(r, 50));
		}
	}

	const OCR_MIN_WIDTH = 1600;
	const OCR_MIN_HEIGHT = 1200;

	function formatTrackInfo(track: MediaStreamTrack) {
		const s = track.getSettings?.() as any;
		const w = s?.width ?? '?';
		const h = s?.height ?? '?';
		const fps = s?.frameRate ?? '?';
		return `track: ${w}x${h} @${fps}fps`;
	}

	// 关键：用“阶梯式”约束请求更高分辨率（4K -> 1080p -> 720p）
	async function getBestStream(seq: number) {
		const tries: MediaStreamConstraints[] = [
			{
				video: {
					facingMode: { ideal: 'environment' },
					width: { ideal: 4032 },
					height: { ideal: 3024 },
					frameRate: { ideal: 30, min: 24 }
				},
				audio: false
			},
			{
				video: {
					facingMode: { ideal: 'environment' },
					width: { ideal: 3264 },
					height: { ideal: 2448 },
					frameRate: { ideal: 30, min: 20 }
				},
				audio: false
			},
			{
				video: {
					facingMode: { ideal: 'environment' },
					width: { ideal: 2560 },
					height: { ideal: 1920 },
					frameRate: { ideal: 24, min: 20 }
				},
				audio: false
			},
			{
				video: {
					facingMode: { ideal: 'environment' },
					width: { ideal: 1920 },
					height: { ideal: 1080 },
					frameRate: { ideal: 24, min: 15 }
				},
				audio: false
			},
			{
				video: { facingMode: { ideal: 'environment' } },
				audio: false
			}
		];

		let lastErr: any = null;
		for (const c of tries) {
			if (seq !== startSeq || !show) return null;
			try {
				return await navigator.mediaDevices.getUserMedia(c);
			} catch (e) {
				lastErr = e;
			}
		}
		throw lastErr;
	}

	// 关键：拿到 stream 后，再用 capabilities 强制 applyConstraints 到“设备支持的最高值”
	async function upgradeTrackToMax(track: MediaStreamTrack) {
		const appliedConstraints: string[] = [];

		try {
			const caps = (track.getCapabilities?.() as any) ?? null;
			
			if (!caps) {
				debugText = `${debugText} | capabilities unavailable`;
				return;
			}

			// caps.width / caps.height 有时是 {min,max}
			const maxW = caps.width?.max;
			const maxH = caps.height?.max;

			// 某些设备 caps 为空或不规范
			if (!maxW || !maxH) return;

			// 选择一个“上限”，但别离谱（比如某些设备报告 8000+，实际上不可用）
			const targetW = Math.min(maxW, 4096);
			const targetH = Math.min(maxH, 2160);

			await track.applyConstraints({
				width: { ideal: targetW },
				height: { ideal: targetH },
				frameRate: { ideal: 24, min: 15 }
			});
			appliedConstraints.push(`resolution~${targetW}x${targetH}`);
		} catch {
			appliedConstraints.push('resolution upgrade failed');
		}

		// 尝试连续对焦/曝光（支持则更稳）
		try {
			await track.applyConstraints({
				advanced: [
					{ focusMode: 'continuous' as any },
					{ exposureMode: 'continuous' as any },
					{ whiteBalanceMode: 'continuous' as any },
					{ frameRate: 15 as any }
				]
			} as any);
			appliedConstraints.push('focus/exposure advanced applied');
		} catch {
			appliedConstraints.push('focus/exposure advanced unsupported');
		}

		if (appliedConstraints.length > 0) {
			debugText = `${debugText}${debugText ? ' | ' : ''}${appliedConstraints.join(' | ')}`;
		}
	}

	function meetsOcrResolution(track: MediaStreamTrack) {
		const s = (track.getSettings?.() as any) ?? {};
		const w = Number(s?.width ?? 0);
		const h = Number(s?.height ?? 0);
		return w >= OCR_MIN_WIDTH && h >= OCR_MIN_HEIGHT;
	}

	async function waitForNextFrame() {
		if (!videoElement) return;
		const anyVideo = videoElement as any;
		if (typeof anyVideo.requestVideoFrameCallback === 'function') {
			await new Promise<void>((resolve) => anyVideo.requestVideoFrameCallback(() => resolve()));
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}

	function computeSharpnessScoreFromCurrentFrame() {
		if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) return 0;
		const sampleWidth = Math.min(640, videoElement.videoWidth);
		const sampleHeight = Math.max(1, Math.round((sampleWidth * videoElement.videoHeight) / videoElement.videoWidth));

		const canvas = document.createElement('canvas');
		canvas.width = sampleWidth;
		canvas.height = sampleHeight;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return 0;

		ctx.drawImage(videoElement, 0, 0, sampleWidth, sampleHeight);
		const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
		const gray = new Float32Array(sampleWidth * sampleHeight);

		for (let i = 0, p = 0; i < imageData.length; i += 4, p++) {
			gray[p] = 0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2];
		}

		let sum = 0;
		let sumSq = 0;
		let count = 0;
		for (let y = 1; y < sampleHeight - 1; y++) {
			for (let x = 1; x < sampleWidth - 1; x++) {
				const idx = y * sampleWidth + x;
				const lap =
					gray[idx - sampleWidth] + gray[idx + sampleWidth] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx];
				sum += lap;
				sumSq += lap * lap;
				count++;
			}
		}

		if (!count) return 0;
		const mean = sum / count;
		return sumSq / count - mean * mean;
	}

	async function waitForStableFrames() {
		isStabilizing = true;
		try {
			const scores: number[] = [];
			for (let i = 0; i < 6; i++) {
				await waitForNextFrame();
				scores.push(computeSharpnessScoreFromCurrentFrame());
			}

			const tail = scores.slice(-3);
			const avg = tail.reduce((a, b) => a + b, 0) / Math.max(tail.length, 1);
			const spread = Math.max(...tail) - Math.min(...tail);
			debugText = `${debugText}${debugText ? ' | ' : ''}sharpness~${avg.toFixed(1)} Δ${spread.toFixed(1)}`;
		} finally {
			isStabilizing = false;
		}
	}

	const startCamera = async () => {
		if (isStartingCamera || mediaStream) return;

		cameraError = '';
		cameraReady = false;
		showVideo = false;
		debugText = '';
		isStartingCamera = true;

		const seq = ++startSeq;

		try {
			const stream = await getBestStream(seq);
			if (!stream) return;

			if (seq !== startSeq || !show) {
				stopStream(stream);
				return;
			}

			const track = stream.getVideoTracks()[0];
			if (!track) throw new Error('No video track');

			// 尽可能升级到设备可用的高分辨率
			await upgradeTrackToMax(track);

			if (!meetsOcrResolution(track)) {
				debugText = `${debugText}${debugText ? ' | ' : ''}低于OCR建议分辨率(${OCR_MIN_WIDTH}x${OCR_MIN_HEIGHT})`;
			}

			// 保存
			mediaStream = stream;

			await tick();
			await attachStreamToVideo();
			await waitFirstFrame(seq);
			await new Promise((r) => setTimeout(r, 400));

			if (seq !== startSeq || !show) return;

			// 现在才显示 video
			showVideo = true;

			cameraReady = videoElement.videoWidth > 0 && videoElement.videoHeight > 0;

			// 调试：显示 video 实际尺寸 + track 设置
			const vInfo = `video: ${videoElement.videoWidth}x${videoElement.videoHeight}`;
			const tInfo = formatTrackInfo(track);
			debugText = `${vInfo} | ${tInfo}${debugText ? ' | ' + debugText : ''}`;
		} catch (error: any) {
			const errorName = error?.name ?? '';
			if (errorName === 'NotAllowedError') {
				cameraError = '未获得摄像头权限，请在浏览器里允许摄像头访问。';
			} else if (errorName === 'NotFoundError') {
				cameraError = '未检测到可用摄像头设备。';
			} else if (errorName === 'NotReadableError') {
				cameraError = '摄像头被其他应用占用，请关闭后重试。';
			} else {
				cameraError = `摄像头不可用：${errorName || 'unknown'}，请改用相册导入。`;
			}
		} finally {
			if (seq === startSeq) isStartingCamera = false;
		}
	};

	const stopCamera = () => {
		startSeq++;

		cameraReady = false;
		isStartingCamera = false;
		isCapturing = false;
		isStabilizing = false;
		showVideo = false;
		debugText = '';

		if (videoElement) {
			try {
				videoElement.pause();
			} catch {}
			videoElement.srcObject = null;
		}

		stopStream(mediaStream);
		mediaStream = null;
	};

	$: if (show) startCamera();
	else stopCamera();

	onDestroy(() => stopCamera());

	const close = () => {
		show = false;
		dispatch('close');
	};

	const emitCapturedFile = async (file: File) => {
		dispatch('capture', { file });
	};

	// 优先 ImageCapture.takePhoto（更接近“系统拍照”）
	async function tryTakePhoto(track: MediaStreamTrack): Promise<Blob | null> {
		try {
			const AnyWindow = window as any;
			if (!AnyWindow.ImageCapture) return null;
			const ic = new AnyWindow.ImageCapture(track);
			const blob: Blob = await ic.takePhoto();
			return blob;
		} catch {
			return null;
		}
	}

	const capturePhoto = async () => {
		if (isCapturing) return;
		isCapturing = true;

		try {
			if (!show || !mediaStream) {
				cameraError = '相机尚未就绪，请稍后重试。';
				return;
			}

			const track = mediaStream.getVideoTracks()?.[0];
			if (!track) {
				cameraError = '相机轨道不可用，请重试。';
				return;
			}

			await waitForStableFrames();

			// 1) ImageCapture
			const photoBlob = await tryTakePhoto(track);
			if (photoBlob) {
				const file = new File([photoBlob], `photo-question-${Date.now()}.jpg`, {
					type: photoBlob.type || 'image/jpeg'
				});
				await emitCapturedFile(file);
				return;
			}

			// 2) fallback：截取视频帧（质量取决于预览流分辨率）
			if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
				cameraError = '相机画面未准备好，请稍后重试。';
				return;
			}

			const vw = videoElement.videoWidth;
			const vh = videoElement.videoHeight;

			const canvas = document.createElement('canvas');
			canvas.width = vw;
			canvas.height = vh;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				cameraError = '拍照失败（无法创建画布），请重试。';
				return;
			}

			ctx.drawImage(videoElement, 0, 0, vw, vh);

			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, 'image/jpeg', 0.98)
			);

			if (!blob) {
				cameraError = '拍照失败，请重试。';
				return;
			}
			const file = new File([blob], `photo-question-${Date.now()}.jpg`, { type: 'image/jpeg' });
			await emitCapturedFile(file);
		} finally {
			isCapturing = false;
		}
	};

	const handleImport = async (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		await emitCapturedFile(file);
	};
</script>

{#if show}
	<Portal target="body">
		<div class="fixed inset-0 z-[80] bg-black text-white">
			<!-- 永远渲染 video，但在 showVideo=false 时隐藏，避免用户看到启动抖动/绿块 -->
			<video
				bind:this={videoElement}
				class="camera-preview absolute inset-0 h-full w-full transition-opacity duration-200"
				style="opacity: {showVideo ? 1 : 0}; object-fit: contain;"
				playsinline
				muted
			/>

			{#if !showVideo}
				<div class="absolute inset-0 bg-black/95" />
			{/if}

			<div class="absolute inset-0 flex flex-col justify-between p-4">
				<div class="flex items-center justify-between">
					<button class="rounded-full bg-black/40 px-4 py-2 text-sm" on:click={close}>关闭</button>
				</div>

				<!-- 调试信息：你能看到实际分辨率，判断“有没有变清晰” -->
				<div class="absolute left-3 top-14 rounded-lg bg-black/55 px-3 py-2 text-xs">
					{#if debugText}
						<div>{debugText}</div>
					{:else}
						<div>camera: (starting...)</div>
					{/if}
				</div>

				<div class="mb-2 flex flex-col items-center gap-4">
					{#if !cameraReady && !cameraError}
						<div class="rounded-xl bg-black/50 px-3 py-2 text-sm">
							{isStartingCamera ? '正在启动相机…' : '等待相机画面…'}
						</div>
					{/if}

					{#if isStabilizing}
						<div class="rounded-xl bg-black/50 px-3 py-2 text-sm">正在对焦并稳定画面…</div>
					{/if}

					{#if cameraError}
						<div class="rounded-xl bg-red-500/80 px-3 py-2 text-sm">{cameraError}</div>
					{/if}

					<button
						class="h-20 w-20 rounded-full border-4 border-white bg-white/15 shadow-lg disabled:opacity-50 active:scale-95"
						disabled={!cameraReady || isCapturing}
						on:click={capturePhoto}
					>
						{#if isCapturing}
							<span class="text-xs">处理中</span>
						{/if}
					</button>
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
	</Portal>
{/if}


<style>
  /* 只影响相机预览 */
  :global(video.camera-preview) {
    transform: translateZ(0);
    backface-visibility: hidden;
    will-change: transform, opacity;


  }
</style>
