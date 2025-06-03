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
    // Try environment variables first
    const envOpenAI = process.env.OPENAI_API_KEY;
    const envGemini = process.env.GEMINI_API_KEY;

    if (envOpenAI) {
      this.providers.set('openai', new OpenAI({ apiKey: envOpenAI }));
    }
    if (envGemini) {
      this.providers.set('gemini', new GoogleGenerativeAI(envGemini));
    }

    // Then try config file if needed
    if (!this.providers.size) {
      const cfgFile = path.join(os.homedir(), '.ai', 'review', 'credentials.json');
      let cfgs: ProviderConfig[] = [];
      
      try {
        cfgs = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));
      } catch (err: any) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new Error(`Failed to read credentials file: ${err.message}`);
        }
        // File doesn't exist - continue with empty config
      }

      for (const c of cfgs) {
        if (c.provider === 'openai' && !this.providers.has('openai')) {
          this.providers.set('openai', new OpenAI({ apiKey: c.credentials.apiKey }));
        }
        if (c.provider === 'gemini' && !this.providers.has('gemini')) {
          this.providers.set('gemini', new GoogleGenerativeAI(c.credentials.apiKey));
        }
      }
    }

    if (!this.providers.size) {
      throw new Error(
        'No AI providers configured. Please either:\n' +
        '1. Set OPENAI_API_KEY or GEMINI_API_KEY environment variables, or\n' +
        '2. Create a credentials file at ~/.ai/review/credentials.json'
      );
    }
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
