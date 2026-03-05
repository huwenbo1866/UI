<script lang="ts">
	import { WEBUI_API_BASE_URL } from '$lib/constants';

	export let fileId: string;
	export let token: string;
	export let page: number = 1;

	$: pdfUrl = `${WEBUI_API_BASE_URL}/files/${fileId}/content#page=${page}`;
</script>

<div class="flex flex-col h-full w-full">
	{#key `${fileId}-${page}`}
		<iframe
			title="PDF Preview"
			src={pdfUrl}
			class="w-full h-full border-0"
			style="min-height: 100%;"
		/>
	{/key}
</div>
