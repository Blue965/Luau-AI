import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function loadEnvKey(key) {
  if (process.env[key]) return process.env[key];
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')
  ];
  for (const candidate of candidates) {
    console.log('try candidate', candidate);
    try {
      if (!fs.existsSync(candidate)) continue;
      const text = fs.readFileSync(candidate, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [name, ...rest] = trimmed.split('=');
        if (name.trim() !== key) continue;
        let value = rest.join('=');
        value = value.trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
        return value;
      }
    } catch (err) {
      console.error('err', err);
    }
  }
  return undefined;
}

console.log('HUGGINGFACE_API_KEY', loadEnvKey('HUGGINGFACE_API_KEY'));
