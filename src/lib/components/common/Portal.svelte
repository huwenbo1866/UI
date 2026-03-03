<script lang="ts">
	import { onDestroy } from 'svelte';

	export let target: string = 'body';

	let host: HTMLElement | null = null;
	let mountPoint: HTMLElement | null = null;

	function mount(node: HTMLElement) {
		mountPoint = node;
		const t = document.querySelector(target) as HTMLElement | null;
		host = t ?? document.body;

		host.appendChild(mountPoint);

		return {
			destroy() {
				if (host && mountPoint && host.contains(mountPoint)) {
					host.removeChild(mountPoint);
				}
			}
		};
	}

	onDestroy(() => {
		if (host && mountPoint && host.contains(mountPoint)) {
			host.removeChild(mountPoint);
		}
	});
</script>

<div use:mount>
	<slot />
</div>