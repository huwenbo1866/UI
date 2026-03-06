import { writable } from 'svelte/store';

export const xiaolingState = writable<'idle' | 'speaking'>('idle');