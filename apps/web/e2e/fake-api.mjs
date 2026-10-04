// Fausse API pour les tests de bout en bout de l'interface : simule les routes de Better Auth.
// Le parcours avec la vraie API arrive avec le Docker Compose et les données de démonstration (I0.5).
import { createServer } from 'node:http';

const port = Number(process.env.FAKE_API_PORT ?? 3199);
const COOKIE = 'scolaly.session_token';
const MOT_DE_PASSE = 'mot de passe des tests e2e';
const user = {
  id: '01a10000-0000-7000-8000-000000000001',
  name: 'Camille Fictive',
  email: 'camille@exemple.test',
};

const readBody = (request) =>
  new Promise((resolve) => {
    let data = '';
    request.on('data', (chunk) => (data += chunk));
    request.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });

createServer(async (request, response) => {
  const connected = (request.headers.cookie ?? '').includes(`${COOKIE}=e2e`);
  const json = (status, body, headers = {}) => {
    response.writeHead(status, { 'content-type': 'application/json', ...headers });
    response.end(JSON.stringify(body));
  };
  if (request.url === '/api/auth/get-session') return json(200, connected ? { user } : null);
  if (request.url === '/api/auth/sign-in/email' && request.method === 'POST') {
    const body = await readBody(request);
    if (body.email === user.email && body.password === MOT_DE_PASSE) {
      return json(200, { user }, { 'set-cookie': `${COOKIE}=e2e; Path=/; HttpOnly; SameSite=Lax` });
    }
    return json(401, { code: 'INVALID_EMAIL_OR_PASSWORD' });
  }
  if (request.url === '/api/auth/sign-out' && request.method === 'POST') {
    return json(200, { success: true }, { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0` });
  }
  return json(404, { message: 'Route inconnue de la fausse API' });
}).listen(port, () => console.warn(`Fausse API sur le port ${port}`));
