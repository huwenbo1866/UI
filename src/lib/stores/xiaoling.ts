import { writable, get } from 'svelte/store';

export type XiaoLingState =
	| 'idle'
	| 'speaking'
	| 'sleep1'
	| 'sleep2'
	| 'sleep3';

export const xiaolingState = writable<XiaoLingState>('idle');

let sleepTimer1: ReturnType<typeof setTimeout> | null = null;
let sleepTimer2: ReturnType<typeof setTimeout> | null = null;
let sleepTimer3: ReturnType<typeof setTimeout> | null = null;

function clearSleepTimers() {
	if (sleepTimer1) {
		clearTimeout(sleepTimer1);
		sleepTimer1 = null;
	}
	if (sleepTimer2) {
		clearTimeout(sleepTimer2);
		sleepTimer2 = null;
	}
	if (sleepTimer3) {
		clearTimeout(sleepTimer3);
		sleepTimer3 = null;
	}
}

/**
 * 用户有新请求 / 新交互时调用
 * 立即打断睡眠链
 */
export function wakeXiaoLing() {
	clearSleepTimers();
	xiaolingState.set('idle');
}

/**
 * AI 开始说话时调用
 */
export function startXiaoLingSpeaking() {
	clearSleepTimers();
	xiaolingState.set('speaking');
}

/**
 * AI 结束回答时调用
 * 回到 idle，并重新开始“睡眠倒计时链”
 */
export function stopXiaoLingSpeaking() {
	xiaolingState.set('idle');
	startSleepCountdown();
}

/**
 * 启动睡眠倒计时
 * idle 3分钟 -> sleep1
 * 再3分钟 -> sleep2
 * 再3分钟 -> sleep3
 */
export function startSleepCountdown() {
	clearSleepTimers();

	// 只有在非 speaking 时才允许进入睡眠链
	if (get(xiaolingState) === 'speaking') return;

	sleepTimer1 = setTimeout(() => {
		if (get(xiaolingState) !== 'speaking') {
			xiaolingState.set('sleep1');
		}
	}, 3 * 60 * 1000);

	sleepTimer2 = setTimeout(() => {
		if (get(xiaolingState) !== 'speaking') {
			xiaolingState.set('sleep2');
		}
	}, 6 * 60 * 1000);

	sleepTimer3 = setTimeout(() => {
		if (get(xiaolingState) !== 'speaking') {
			xiaolingState.set('sleep3');
		}
	}, 9 * 60 * 1000);
}

/**
 * 页面初始化时可调用
 */
export function initXiaoLingState() {
	clearSleepTimers();
	xiaolingState.set('idle');
	startSleepCountdown();
}