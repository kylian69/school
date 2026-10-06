import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import { createApp } from '../app.js';
import { buildOpenApiDocument } from '../contracts/openapi.js';
import {
  OPENAPI_FILE,
  OPENAPI_VERSION,
  OPENAPI_GENERATION_ENV,
} from '../contracts/openapi-file.js';

// Génère apps/api/openapi.json sans se connecter à la base ni à Valkey (connexions paresseuses).
const app = await createApp(OPENAPI_GENERATION_ENV);
await app.init();
const document = buildOpenApiDocument(app, OPENAPI_VERSION);
await writeFile(OPENAPI_FILE, `${JSON.stringify(document, null, 2)}\n`);
await app.close();
console.warn(`Document OpenAPI écrit dans ${OPENAPI_FILE}`);
