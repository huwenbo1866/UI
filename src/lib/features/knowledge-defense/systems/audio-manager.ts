// src/lib/features/knowledge-defense/systems/audio-manager.ts

import {
  ENABLE_AUDIO,
  ENABLE_BGM,
  ENABLE_CLICK_SOUND,
  ENABLE_HIT_SOUND,
  ENABLE_DEATH_SOUND,
  ENABLE_PANEL_SOUND
} from '../config/constants';

class AudioManager {
  private bgm: HTMLAudioElement | null = null;
  private sounds: Record<string, HTMLAudioElement> = {};

  constructor() {
    if (!ENABLE_AUDIO) return;

    // 背景音乐
    if (ENABLE_BGM) {
      this.bgm = new Audio('/sounds/bgm.mp3');
      this.bgm.loop = true;
      this.bgm.volume = 0.35;
    }

    // 音效
    if (ENABLE_CLICK_SOUND) this.sounds.click = new Audio('/sounds/click.mp3');
    if (ENABLE_HIT_SOUND) this.sounds.hit = new Audio('/sounds/hit.mp3');
    if (ENABLE_DEATH_SOUND) this.sounds.death = new Audio('/sounds/death.mp3');
    if (ENABLE_PANEL_SOUND) this.sounds.panel = new Audio('/sounds/panel.mp3');
  }

  playBGM() {
    if (!ENABLE_AUDIO || !this.bgm) return;
    // 关键优化：如果已经在播放，就不再重复 play
    if (this.bgm.paused || this.bgm.ended) {
      this.bgm.play().catch(() => {});
    }
  }

  pauseBGM() {
    if (this.bgm) this.bgm.pause();
  }

  playClick() {
    if (!ENABLE_AUDIO || !this.sounds.click) return;
    this.sounds.click.currentTime = 0;
    this.sounds.click.volume = 0.7;
    this.sounds.click.play().catch(() => {});
  }

  playHit() {
    if (!ENABLE_AUDIO || !this.sounds.hit) return;
    this.sounds.hit.currentTime = 0;
    this.sounds.hit.volume = 0.85;
    this.sounds.hit.play().catch(() => {});
  }

  playDeath() {
    if (!ENABLE_AUDIO || !this.sounds.death) return;
    this.sounds.death.currentTime = 0;
    this.sounds.death.volume = 0.9;
    this.sounds.death.play().catch(() => {});
  }

  playPanel() {
    if (!ENABLE_AUDIO || !this.sounds.panel) return;
    this.sounds.panel.currentTime = 0;
    this.sounds.panel.volume = 0.65;
    this.sounds.panel.play().catch(() => {});
  }
}

// 单例导出
export const audioManager = new AudioManager();