export type Severity = 'low' | 'medium' | 'high';

export interface Rule {
  id: string;
  scope: 'file' | 'history' | 'inline';
  severity: Severity | Severity[];
  statement: string;
  exceptions?: string;
  include?: string[];
  exclude?: string[];
  matchInclude?: string[];
  matchExclude?: string[];
}

export interface CommitMeta {
  hash: string;
  timestamp: number;
  message: string;
}

export interface FileDiff {
  filePath: string;
  status: 'A' | 'M' | 'D' | 'R' | 'C';
  additions: number;
  deletions: number;
  diff?: string;
}

export interface Issue {
  severity: Severity;
  ruleId: string;
  file?: string;
  line?: number;
  message: string;
}
