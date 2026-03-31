<script lang="ts">
	import { browser } from '$app/environment';
	import { WEBUI_API_BASE_URL } from '$lib/constants';
	import { onDestroy, onMount } from 'svelte';
	import { tick } from 'svelte';

	export let fileId: string;
	export let token: string;
	export let page: number = 1;

	// 地址配置
	$: pdfSourceUrl = `${WEBUI_API_BASE_URL}/files/${fileId}/content`;
	$: downloadUrl = `${WEBUI_API_BASE_URL}/files/${fileId}/content?attachment=true`;
	$: iframeUrl = `${pdfSourceUrl}#page=${page}`;

	// 状态
	let containerEl: HTMLDivElement;
	let canvasEl: HTMLCanvasElement;
	let isLoading = false;
	let loadError = '';
	let isMobile = false;
	let iframeBlobUrl: string | null = null;
	let lastRenderedPage = 0; // 你代码里的变量

	// PDF.js 实例
	let pdfjsLib: any = null;
	let pdfDoc: any = null;
	let renderTask: any = null;
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;

	// ==============================================
	// 设备判断：移动端=true / PC=false
	// ==============================================
	const detectDevice = () => {
		if (!browser) return false;
		const hasTouch = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
		const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent);
		const isIpadDesktop = navigator.userAgent.includes('Macintosh') && hasTouch;
		return hasTouch || mobileUA || isIpadDesktop;
	};

	// ==============================================
	// PC 端：iframe 鉴权 Blob
	// ==============================================
	const generateAuthBlob = async () => {
		if (!browser) return;
		try {
			const headers = token ? { Authorization: `Bearer ${token}` } : {};
			const res = await fetch(pdfSourceUrl, { headers, credentials: 'include' });
			const blob = await res.blob();
			const pdfBlob = new Blob([blob], { type: 'application/pdf' });
			if (iframeBlobUrl) URL.revokeObjectURL(iframeBlobUrl);
			iframeBlobUrl = URL.createObjectURL(pdfBlob);
		} catch (err) {
			iframeBlobUrl = null;
		}
	};

	// ==============================================
	// 移动端：你提供的 原版 renderPage（完整保留）
	// ==============================================
	async function renderPage(pageNumber: number) {
		if (!pdfDoc || !canvasEl || !containerEl) return;

		const targetPage = Math.max(1, Math.min(pageNumber, pdfDoc.numPages));

		isLoading = true;
		loadError = '';

		try {
			renderTask?.cancel();

			const pdfPage = await pdfDoc.getPage(targetPage);

			const baseViewport = pdfPage.getViewport({ scale: 1 });

			// 等待容器真正完成布局，避免移动端首次 clientWidth=0
			if (containerEl.clientWidth === 0) {
				await new Promise((resolve) => requestAnimationFrame(resolve));
				await new Promise((resolve) => requestAnimationFrame(resolve));
			}

			const containerWidth = containerEl.clientWidth || window.innerWidth || 375;

			// 给移动端留 padding，避免贴边
			const availableWidth = Math.max(containerWidth - 16, 280);

			const scale = availableWidth / baseViewport.width;
			const viewport = pdfPage.getViewport({ scale });

			const dpr = Math.min(window.devicePixelRatio || 1, 2);

			const context = canvasEl.getContext('2d');
			if (!context) throw new Error('Canvas context unavailable');

			canvasEl.width = Math.floor(viewport.width * dpr);
			canvasEl.height = Math.floor(viewport.height * dpr);

			canvasEl.style.width = `${viewport.width}px`;
			canvasEl.style.height = `${viewport.height}px`;

			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			context.clearRect(0, 0, canvasEl.width, canvasEl.height);

			renderTask = pdfPage.render({
				canvasContext: context,
				viewport
			});

			await renderTask.promise;
			lastRenderedPage = targetPage;
		} catch (err: any) {
			if (err?.name !== 'RenderingCancelledException') {
				console.error(err);
				loadError = 'PDF 渲染失败';
			}
		} finally {
			isLoading = false;
		}
	}

	// ==============================================
	// 移动端：你提供的 原版 initPdfJs（完整保留）
	// ==============================================
	async function initPdfJs() {
		if (!browser || !isMobile || !fileId) return;

		isLoading = true;
		loadError = '';

		try {
			pdfjsLib ??= await import('pdfjs-dist');

			pdfjsLib.GlobalWorkerOptions.workerSrc =
				'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.js';

			pdfDoc = await pdfjsLib.getDocument({
				url: pdfSourceUrl,
				withCredentials: true,
				disableRange: true,
				httpHeaders: token
					? {
							Authorization: `Bearer ${token}`
					  }
					: {}
			}).promise;

			// 移动端首次进入时等待 DOM 完成布局
			await new Promise((resolve) => requestAnimationFrame(resolve));
			await new Promise((resolve) => requestAnimationFrame(resolve));

			await renderPage(page);
		} catch (err) {
			console.error(err);
			loadError = 'PDF 加载失败';
		} finally {
			isLoading = false;
		}
	}

	// ==============================================
	// 移动端：你提供的 原版 handleResize（完整保留）
	// ==============================================
	function handleResize() {
		if (!isMobile || !pdfDoc) return;

		if (resizeTimer) clearTimeout(resizeTimer);

		resizeTimer = setTimeout(async () => {
			resizeTimer = null;

			await new Promise((resolve) => requestAnimationFrame(resolve));

			renderPage(page);
		}, 150);
	}

	// ==============================================
	// 清理资源
	// ==============================================
	const cleanup = () => {
		if (renderTask) renderTask.cancel();
		pdfDoc?.destroy();
		if (resizeTimer) clearTimeout(resizeTimer);
	};

	// ==============================================
	// 生命周期
	// ==============================================
	onMount(() => {
		isMobile = detectDevice();
		if (isMobile) {
			window.addEventListener('resize', handleResize);
			initPdfJs();
		} else {
			generateAuthBlob();
		}
	});

	onDestroy(() => {
		cleanup();
		window.removeEventListener('resize', handleResize);
		if (iframeBlobUrl) URL.revokeObjectURL(iframeBlobUrl);
	});

	// 响应式更新
	$: if (isMobile && pdfDoc) renderPage(page);
	$: if (fileId && isMobile) { cleanup(); initPdfJs(); }
	$: if (fileId && !isMobile && page >= 1) generateAuthBlob();
</script>

<!-- 主容器 -->
<div class="w-full h-full min-h-0 relative bg-white">
	<!-- 移动端：强制 PDF.js Canvas 渲染 -->
	{#if isMobile}
		<div bind:this={containerEl} class="w-full h-full overflow-auto flex justify-center p-2">
			<canvas bind:this={canvasEl} class="bg-white shadow-md max-w-full" />

			{#if isLoading}
				<div class="absolute inset-0 flex items-center justify-center bg-white/90">加载中...</div>
			{/if}

			{#if loadError}
				<div class="absolute inset-0 flex flex-col items-center justify-center gap-3">
					<p class="text-gray-500">{loadError}</p>
					<a href={downloadUrl} class="bg-blue-600 text-white px-3 py-1 rounded">下载</a>
				</div>
			{/if}
		</div>

	<!-- PC 端：强制 iframe 预览 -->
	{:else}
		{#key `${fileId}-${page}`}
			<iframe
				src={iframeBlobUrl ? `${iframeBlobUrl}#page=${page}` : iframeUrl}
				class="w-full h-full border-0"
				allow="fullscreen"
			/>
		{/key}
	{/if}
</div>