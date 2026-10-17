export type StoryAct = 1 | 2 | 3;

export type Barrier = 0 | 1 | 2 | 3;

export interface StoryEvent {
  id: string;
  timestamp: string;
  act: StoryAct;
  barrier: Barrier;
  title: string;
  detail: string;
  prometheusComment?: string;
}

export interface RecoveryReport {
  elapsedSeconds: number;
  verifiedDevices: number;
  totalDevices: number;
  alertsResolved: number;
  riskBefore: number;
  riskAfter: number;
  xaiCorrect: number;
  xaiWrong: number;
  operatorName?: string;
}

