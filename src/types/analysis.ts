export interface BrainDimension {
  label: string;
  score: number;
  description: string;
  roi: string;
}

export interface ViralityResult {
  overall_score: number;
  dimensions: BrainDimension[];
  verdict: string;
  recommendation: string;
  processing_time_ms: number;
}
