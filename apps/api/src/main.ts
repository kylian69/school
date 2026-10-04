import 'reflect-metadata';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = await createApp(env);
await app.listen({ port: env.PORT, host: '0.0.0.0' });
