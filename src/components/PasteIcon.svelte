<script lang="ts">
  // The Paste icon (a clipboard): one symbol for "paste here" in the setup list, the group steps and on the device view.
  let { size = 16 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
  <rect x="3" y="3" width="10" height="11" rx="1.5" />
  <path d="M6 3V2h4v1" />
  <path d="M6 8h4M6 11h4" />
</svg>
