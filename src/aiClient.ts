import fs from 'fs';
import os from 'os';
import path from 'path';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Severity } from './types.js';

type ProviderName = 'openai' | 'gemini';

interface ProviderConfig {
  provider: ProviderName;
  credentials: Record<string, any>;
}

interface EvalResult {
  violation: boolean;
  severity?: Severity;
  message?: string;
}

export class AIClient {
  private providers = new Map<ProviderName, any>();

  constructor() {
    const cfgFile = path.join(os.homedir(), '.ai', 'review', 'credentials.json');
    const cfgs: ProviderConfig[] = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));
    for (const c of cfgs) {
      if (c.provider === 'openai')
        this.providers.set('openai', new OpenAI({ apiKey: c.credentials.apiKey }));
      if (c.provider === 'gemini')
        this.providers.set('gemini', new GoogleGenerativeAI(c.credentials.apiKey));
    }
    if (!this.providers.size) throw new Error('No AI provider configured.');
  }

  async evaluate(
    provider: ProviderName,
    systemPrompt: string,
    userPrompt: string
  ): Promise<EvalResult> {
    if (provider === 'openai') {
      const openai = this.providers.get('openai') as OpenAI;
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });
      return JSON.parse(res.choices[0].message.content ?? '{}');
    }
    if (provider === 'gemini') {
      throw new Error('Gemini is not supported yet');
    }
    throw new Error(`Unsupported provider ${provider}`);
  }
}
