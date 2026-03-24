<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { browser } from '$app/environment';

	export let markdown = '';
	export let className = '';
	export let visible = true;

	const SVG_NS = 'http://www.w3.org/2000/svg';
	const XLINK_NS = 'http://www.w3.org/1999/xlink';
	const RENDER_DEBOUNCE_MS = 120;

	let svgEl: SVGSVGElement | null = null;

	let mm: any = null;
	let Transformer: any;
	let Markmap: any;
	let loadCSS: any;
	let loadJS: any;
	let markmapModule: any;
	let transformer: any;

	let _lastRenderedMd = '';
	let _hasRendered = false;
	let _rendering = false;
	let _pending = false;
	let _destroyed = false;
	let _renderTimer: ReturnType<typeof setTimeout> | null = null;

	async function waitForPaint() {
		await tick();
		await new Promise((resolve) => requestAnimationFrame(resolve));
		await new Promise((resolve) => requestAnimationFrame(resolve));
	}

	async function fitToViewport() {
		await waitForPaint();

		if (!visible) return;

		try {
			await mm?.fit?.();
		} catch {}
	}

	function captureZoomTransform() {
		const svgNode = mm?.svg?.node?.();
		return svgNode?.__zoom ?? null;
	}

	function restoreZoomTransform(transform: any) {
		if (!transform || !mm?.zoom || !mm?.svg?.call) return;

		try {
			mm.svg.call(mm.zoom.transform, transform);
		} catch {}
	}

	async function ensureLibs() {
		if (!browser) return;
		if (Transformer && Markmap && transformer) return;

		const lib = await import('markmap-lib');
		({ Transformer } = lib);

		const view = await import('markmap-view');
		({ Markmap, loadCSS, loadJS } = view);
		markmapModule = view;

		transformer = new Transformer();
	}

	function stripFences(text: string) {
		let t = (text ?? '').trim();
		t = t.replace(/^\s*```(?:markdown|md|markmap)?\s*\n/i, '');
		t = t.replace(/\n\s*```\s*$/i, '');
		return t.trim();
	}

	function sanitize(md: string) {
		return (md || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
	}

	function clearRenderTimer() {
		if (_renderTimer) {
			clearTimeout(_renderTimer);
			_renderTimer = null;
		}
	}

	function scheduleRender(immediate = false) {
		if (!browser || !svgEl || _destroyed) return;
		clearRenderTimer();

		if (immediate) {
			void render();
			return;
		}

		_renderTimer = setTimeout(() => {
			_renderTimer = null;
			void render();
		}, RENDER_DEBOUNCE_MS);
	}

	async function render() {
		if (!browser || !svgEl) return;
		if (_rendering) {
			_pending = true;
			return;
		}

		_rendering = true;
		_pending = false;

		const mdRaw = markdown;
		_lastRenderedMd = mdRaw;

		try {
			await ensureLibs();
			if (_destroyed || !transformer || !Markmap || !svgEl) return;

			const md = sanitize(stripFences(mdRaw));
			const { root, features } = transformer.transform(md);

			const assets = transformer.getUsedAssets(features);
			if (assets?.styles?.length) loadCSS(assets.styles);
			if (assets?.scripts?.length) {
				await loadJS(assets.scripts, { getMarkmap: () => markmapModule });
			}

			if (mm?.setData) {
				const previousTransform = _hasRendered ? captureZoomTransform() : null;
				await mm.setData(root, {
					autoFit: false,
					zoom: true,
					pan: true,
					duration: 0
				});
				restoreZoomTransform(previousTransform);
			} else {
				try {
					mm?.destroy?.();
				} catch {}
				mm = Markmap.create(
					svgEl,
					{ autoFit: false, zoom: true, pan: true, duration: 160 },
					root
				);
			}

			if (!_hasRendered) {
				await fitToViewport();
			}

			_hasRendered = true;
			await waitForPaint();
		} finally {
			_rendering = false;
			if (!_destroyed && (_pending || markdown !== _lastRenderedMd)) {
				scheduleRender();
			}
		}
	}

	function inlineStylesForExport(source: Element, target: Element) {
		const sourceChildren = Array.from(source.children);
		const targetChildren = Array.from(target.children);

		const computed = getComputedStyle(source);
		const styleText = Array.from(computed)
			.map((prop) => `${prop}:${computed.getPropertyValue(prop)};`)
			.join('');

		if (styleText) {
			target.setAttribute('style', styleText);
		}

		sourceChildren.forEach((child, index) => {
			if (targetChildren[index]) {
				inlineStylesForExport(child, targetChildren[index]);
			}
		});
	}

	function parseNum(value: string | null | undefined, fallback = 0) {
		const n = parseFloat(value || '');
		return Number.isFinite(n) ? n : fallback;
	}

	function parsePx(value: string | null | undefined, fallback = 0) {
		const n = parseFloat(value || '');
		return Number.isFinite(n) ? n : fallback;
	}

	function getTextHost(fo: Element): HTMLElement | null {
		return (
			(fo.querySelector('div, span, p, a') as HTMLElement | null) ||
			(fo.firstElementChild as HTMLElement | null) ||
			null
		);
	}

	function getTextLines(el: HTMLElement | null) {
		if (!el) return [] as string[];
		const raw = (el.innerText || el.textContent || '').replace(/\r/g, '').trim();
		if (!raw) return [] as string[];
		return raw
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
	}

	function replaceForeignObjectsWithSvgText(sourceSvg: SVGSVGElement, targetSvg: SVGSVGElement) {
		const sourceFOs = Array.from(sourceSvg.querySelectorAll('foreignObject'));
		const targetFOs = Array.from(targetSvg.querySelectorAll('foreignObject'));

		targetFOs.forEach((targetFO, index) => {
			const sourceFO = sourceFOs[index] as SVGForeignObjectElement | undefined;
			if (!sourceFO) {
				targetFO.remove();
				return;
			}

			const sourceHost = getTextHost(sourceFO);
			const lines = getTextLines(sourceHost);
			if (!lines.length) {
				targetFO.remove();
				return;
			}

			const cs = sourceHost ? getComputedStyle(sourceHost) : null;
			const x = parseNum(sourceFO.getAttribute('x')) + parsePx(cs?.paddingLeft, 0);
			const y = parseNum(sourceFO.getAttribute('y')) + parsePx(cs?.paddingTop, 0);
			const fontSize = Math.max(12, parsePx(cs?.fontSize, 16));
			const lineHeight = Math.max(fontSize * 1.25, parsePx(cs?.lineHeight, fontSize * 1.35));
			const fill = cs?.color || '#1f2937';
			const fontFamily = cs?.fontFamily || 'system-ui, -apple-system, Segoe UI, Arial, sans-serif';
			const fontWeight = cs?.fontWeight || '400';
			const fontStyle = cs?.fontStyle || 'normal';
			const letterSpacing = cs?.letterSpacing || '0px';

			const textEl = document.createElementNS(SVG_NS, 'text');
			textEl.setAttribute('x', String(x));
			textEl.setAttribute('y', String(y));
			textEl.setAttribute('fill', fill);
			textEl.setAttribute('font-family', fontFamily);
			textEl.setAttribute('font-size', `${fontSize}px`);
			textEl.setAttribute('font-weight', fontWeight);
			textEl.setAttribute('font-style', fontStyle);
			textEl.setAttribute('letter-spacing', letterSpacing);
			textEl.setAttribute('dominant-baseline', 'hanging');
			textEl.setAttribute('xml:space', 'preserve');

			lines.forEach((line, lineIndex) => {
				const tspan = document.createElementNS(SVG_NS, 'tspan');
				tspan.setAttribute('x', String(x));
				if (lineIndex > 0) {
					tspan.setAttribute('dy', `${lineHeight}px`);
				}
				tspan.textContent = line;
				textEl.appendChild(tspan);
			});

			targetFO.replaceWith(textEl);
		});

		targetSvg.querySelectorAll('foreignObject').forEach((node) => node.remove());
	}

	function stripTaintedNodes(root: SVGSVGElement) {
		root.querySelectorAll('script').forEach((node) => node.remove());

		root.querySelectorAll('*').forEach((node) => {
			const href = node.getAttribute('href') || node.getAttributeNS(XLINK_NS, 'href');
			if (!href) return;

			const isExternal = /^(https?:)?\/\//i.test(href);
			const tagName = node.tagName.toLowerCase();

			if ((tagName === 'image' || tagName === 'use') && isExternal) {
				node.remove();
			}
		});
	}

	function measureContentBox() {
		if (!svgEl || typeof DOMPoint === 'undefined') return null;

		const elements = Array.from(
			svgEl.querySelectorAll(
				'path,circle,ellipse,line,polyline,polygon,rect,text,foreignObject'
			)
		) as SVGGraphicsElement[];

		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;

		for (const el of elements) {
			try {
				const bbox = el.getBBox?.();
				const ctm = el.getCTM?.();
				if (!bbox || !ctm) continue;
				if (!Number.isFinite(bbox.x) || !Number.isFinite(bbox.y)) continue;
				if (!Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)) continue;
				if (bbox.width <= 0 && bbox.height <= 0) continue;

				const points = [
					new DOMPoint(bbox.x, bbox.y).matrixTransform(ctm),
					new DOMPoint(bbox.x + bbox.width, bbox.y).matrixTransform(ctm),
					new DOMPoint(bbox.x, bbox.y + bbox.height).matrixTransform(ctm),
					new DOMPoint(bbox.x + bbox.width, bbox.y + bbox.height).matrixTransform(ctm)
				];

				for (const pt of points) {
					if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
					minX = Math.min(minX, pt.x);
					minY = Math.min(minY, pt.y);
					maxX = Math.max(maxX, pt.x);
					maxY = Math.max(maxY, pt.y);
				}
			} catch {}
		}

		if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
			return null;
		}

		const width = maxX - minX;
		const height = maxY - minY;
		if (width <= 0 || height <= 0) return null;

		return { x: minX, y: minY, width, height };
	}

	function buildExportSvgText() {
		if (!svgEl) return null;

		const clone = svgEl.cloneNode(true) as SVGSVGElement;
		inlineStylesForExport(svgEl, clone);
		replaceForeignObjectsWithSvgText(svgEl, clone);
		stripTaintedNodes(clone);

		if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', SVG_NS);
		if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', XLINK_NS);

		const padding = 48;
		const contentBox = measureContentBox();
		let exportX = 0;
		let exportY = 0;
		let exportW = 1200;
		let exportH = 800;

		if (contentBox) {
			exportX = Math.floor(contentBox.x - padding);
			exportY = Math.floor(contentBox.y - padding);
			exportW = Math.ceil(contentBox.width + padding * 2);
			exportH = Math.ceil(contentBox.height + padding * 2);
		} else {
			const sourceRect = svgEl.getBoundingClientRect();
			exportW = Math.max(1, Math.round(sourceRect.width || svgEl.clientWidth || 1200));
			exportH = Math.max(1, Math.round(sourceRect.height || svgEl.clientHeight || 800));
		}

		clone.setAttribute('viewBox', `${exportX} ${exportY} ${exportW} ${exportH}`);
		clone.setAttribute('width', String(exportW));
		clone.setAttribute('height', String(exportH));

		const background = document.createElementNS(SVG_NS, 'rect');
		background.setAttribute('x', String(exportX));
		background.setAttribute('y', String(exportY));
		background.setAttribute('width', String(exportW));
		background.setAttribute('height', String(exportH));
		background.setAttribute('fill', '#ffffff');
		clone.insertBefore(background, clone.firstChild);

		return new XMLSerializer().serializeToString(clone);
	}

	async function svgToPngBlob(svgText: string, scale = 2): Promise<Blob> {
		const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
		const url = URL.createObjectURL(svgBlob);

		const img = new Image();
		img.decoding = 'async';

		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error('Failed to load SVG image'));
			img.src = url;
		});

		URL.revokeObjectURL(url);

		let w = 1200;
		let h = 800;
		try {
			const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
			const svg = doc.documentElement as unknown as SVGSVGElement;
			const vb = svg.getAttribute('viewBox');
			if (vb) {
				const parts = vb.split(/\s+/).map((x) => parseFloat(x));
				if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
					w = parts[2] || w;
					h = parts[3] || h;
				}
			}
			const aw = parseFloat(svg.getAttribute('width') || '');
			const ah = parseFloat(svg.getAttribute('height') || '');
			if (Number.isFinite(aw) && aw > 0) w = aw;
			if (Number.isFinite(ah) && ah > 0) h = ah;
		} catch {}

		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(w * scale));
		canvas.height = Math.max(1, Math.round(h * scale));

		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas 2D context not available');

		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

		const pngBlob: Blob = await new Promise((resolve, reject) => {
			canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to create PNG blob'))), 'image/png');
		});

		return pngBlob;
	}

	function buildStandaloneHtml(md: string) {
		const safe = (md ?? '').replace(/<\/script>/gi, '<\\/script>');
		return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Markmap</title>
<style>
html,body{margin:0;height:100%;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial}
.markmap>svg{width:100%;height:90vh;min-height:720px;}
</style>
<script>window.markmap={autoLoader:{toolbar:true}};<\\/script>
<script src="https://cdn.jsdelivr.net/npm/markmap-autoloader@0.16.1"
 onerror="this.onerror=null;this.src='https://unpkg.com/markmap-autoloader@0.16.1'"><\\/script>
</head>
<body>
<div class="markmap"><script type="text/template">\n${safe}\n<\\/script></div>
</body>
</html>`;
	}

	export async function ensureRendered(): Promise<void> {
		if (!browser || !svgEl) return;

		if (_rendering) {
			_pending = true;
		}

		while (!_destroyed && (_rendering || markdown !== _lastRenderedMd || !_hasRendered)) {
			if (!_rendering && (markdown !== _lastRenderedMd || !_hasRendered)) {
				await render();
			}
			await waitForPaint();
		}
	}

	export function exportSvg(): string | null {
		return buildExportSvgText();
	}

	export async function exportPng(scale = 2): Promise<Blob | null> {
		await ensureRendered();
		const svgText = buildExportSvgText();
		if (!svgText) return null;
		return await svgToPngBlob(svgText, scale);
	}

	export function exportHtml(): string {
		return buildStandaloneHtml(sanitize(stripFences(markdown)));
	}

	onMount(() => {
		scheduleRender(true);
	});

	$: if (browser && svgEl && markdown !== _lastRenderedMd) {
		scheduleRender();
	}

	onDestroy(() => {
		_destroyed = true;
		clearRenderTimer();
		try {
			mm?.destroy?.();
		} catch {}
	});
</script>

<div
	class={
		'w-full rounded-2xl border border-gray-200/30 dark:border-gray-700/60 ' +
		'bg-white dark:bg-black shadow-sm overflow-hidden ' +
		className
	}
>
	<div class="flex items-center justify-between px-3 py-2 text-xs border-b border-gray-200/20 dark:border-gray-700/40">
		<div class="opacity-80">Markmap 预览</div>
		<div class="opacity-60">拖拽移动 · 滚轮缩放</div>
	</div>
	<div class="w-full h-[70vh] min-h-[520px] p-2">
		<svg bind:this={svgEl} class="w-full h-full"></svg>
	</div>
</div>