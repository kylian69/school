import 'reflect-metadata';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const app = await createApp();
app.enableShutdownHooks();
await app.listen({ port, host: '0.0.0.0' });
