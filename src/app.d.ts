// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	interface Window {
		NativeCameraCapture?: {
			capturePhoto?: (payload?: {
				preferFacingMode?: 'environment' | 'user';
				preferResolution?: 'max' | 'high' | 'medium';
			}) =>
				| Promise<{ base64?: string; dataUrl?: string; mimeType?: string; filename?: string } | null>
				| { base64?: string; dataUrl?: string; mimeType?: string; filename?: string }
				| null;
		};
		__nativeCameraCallbacks?: Record<
			string,
			(payload: { base64?: string; dataUrl?: string; mimeType?: string; filename?: string }) => void
		>;
	}

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
