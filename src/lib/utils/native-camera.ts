export type NativeCaptureOptions = {
	preferFacingMode?: 'environment' | 'user';
	preferResolution?: 'max' | 'high' | 'medium';
	timeoutMs?: number;
};

export type NativeCaptureResult = {
	base64?: string;
	dataUrl?: string;
	mimeType?: string;
	filename?: string;
};

type NativeCameraBridge = {
	capturePhoto?: (payload?: Record<string, unknown>) => unknown;
};

const DEFAULT_TIMEOUT_MS = 12_000;

const normalizeDataUrl = (raw: string) => {
	const trimmed = raw.trim();
	if (trimmed.startsWith('data:image/')) {
		return trimmed;
	}
	const guessMime = trimmed.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
	return `data:${guessMime};base64,${trimmed}`;
};

const toFileFromResult = async (result: NativeCaptureResult): Promise<File | null> => {
	if (!result) return null;

	const raw = result.dataUrl || result.base64;
	if (!raw) return null;

	const dataUrl = normalizeDataUrl(raw);
	const response = await fetch(dataUrl);
	const blob = await response.blob();
	const mimeType = result.mimeType || blob.type || 'image/jpeg';
	const ext = mimeType.includes('png') ? 'png' : 'jpg';
	const filename = result.filename || `photo-question-${Date.now()}.${ext}`;
	return new File([blob], filename, { type: mimeType });
};

const createCallbackBridgePromise = (
	options: NativeCaptureOptions,
	timeoutMs: number
): Promise<File | null> => {
	return new Promise((resolve) => {
		const callbackId = `native-camera-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const timer = setTimeout(() => {
			delete (window as any).__nativeCameraCallbacks?.[callbackId];
			resolve(null);
		}, timeoutMs);

		(window as any).__nativeCameraCallbacks = (window as any).__nativeCameraCallbacks || {};
		(window as any).__nativeCameraCallbacks[callbackId] = async (result: NativeCaptureResult) => {
			clearTimeout(timer);
			delete (window as any).__nativeCameraCallbacks?.[callbackId];
			resolve(await toFileFromResult(result));
		};

		const messagePayload = {
			action: 'capturePhoto',
			callbackId,
			preferFacingMode: options.preferFacingMode || 'environment',
			preferResolution: options.preferResolution || 'max'
		};

		try {
			(window as any).webkit?.messageHandlers?.nativeCamera?.postMessage(messagePayload);
		} catch {
			clearTimeout(timer);
			delete (window as any).__nativeCameraCallbacks?.[callbackId];
			resolve(null);
		}
	});
};

export const capturePhotoViaNativeBridge = async (
	options: NativeCaptureOptions = {}
): Promise<File | null> => {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	try {
		const nativeBridge = (window as any).NativeCameraCapture as NativeCameraBridge | undefined;
		if (nativeBridge?.capturePhoto) {
			const maybe = await Promise.resolve(
				nativeBridge.capturePhoto({
					preferFacingMode: options.preferFacingMode || 'environment',
					preferResolution: options.preferResolution || 'max'
				})
			);
			if (maybe) {
				return await toFileFromResult(maybe as NativeCaptureResult);
			}
		}
	} catch {
		// fallback to other native channels
	}

	if ((window as any).webkit?.messageHandlers?.nativeCamera?.postMessage) {
		const file = await createCallbackBridgePromise(options, timeoutMs);
		if (file) return file;
	}

	return null;
};
