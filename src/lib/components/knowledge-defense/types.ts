export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  id: string;
  difficulty: Difficulty;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface QuestionPack {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
}

export interface Monster {
  id: string;
  difficulty: Difficulty;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  sprite: string;
  usedQuestionIds: string[];
  activeQuestionId?: string;
  isDead?: boolean;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
}

export interface FinishStats {
  result: 'win' | 'lose';
  kills: number;
  correct: number;
  wrong: number;
  remainingHp: number;
}
