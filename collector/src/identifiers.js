import { createHash } from 'node:crypto';

export function assetId(projectKey, relative) {
  return `ast_${createHash('sha256').update(`${projectKey}\0${relative}`).digest('hex').slice(0, 32)}`;
}
