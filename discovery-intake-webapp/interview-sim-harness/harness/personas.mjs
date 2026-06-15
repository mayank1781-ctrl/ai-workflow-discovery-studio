import { promises as fs } from 'node:fs';

export async function loadPersonas(path) {
  const raw = JSON.parse(await fs.readFile(path, 'utf8'));
  const personas = Array.isArray(raw.personas) ? raw.personas : [];
  if (!personas.length) throw new Error(`No personas found in ${path}`);
  return {
    globalRules: raw.global_interviewee_rules || [],
    personas
  };
}
