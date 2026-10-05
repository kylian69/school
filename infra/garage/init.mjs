// Initialise un nœud Garage unique par son API d'administration (v2), sans dépendance :
// topologie, clé d'accès importée et bucket. Idempotent : peut être relancé à chaque démarrage.
// Variables : GARAGE_ADMIN_URL, GARAGE_ADMIN_TOKEN, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
// S3_BUCKET, GARAGE_CAPACITY (octets, 10 Gio par défaut).
const env = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
};
const adminUrl = env('GARAGE_ADMIN_URL', 'http://localhost:3903');
const token = env('GARAGE_ADMIN_TOKEN');
const accessKeyId = env('S3_ACCESS_KEY_ID');
const secretAccessKey = env('S3_SECRET_ACCESS_KEY');
const bucket = env('S3_BUCKET');
const capacity = Number(env('GARAGE_CAPACITY', String(10 * 1024 ** 3)));

async function call(method, path, body) {
  const response = await fetch(`${adminUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok)
    throw Object.assign(new Error(`${method} ${path} : ${response.status} ${text}`), {
      status: response.status,
    });
  return text ? JSON.parse(text) : null;
}

async function waitForGarage() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      return await call('GET', '/v2/GetClusterStatus');
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Garage injoignable sur ${adminUrl}`);
}

const status = await waitForGarage();
const node = status.nodes[0];
if (!node.role) {
  const layout = await call('GET', '/v2/GetClusterLayout');
  await call('POST', '/v2/UpdateClusterLayout', {
    roles: [{ id: node.id, zone: 'dc1', capacity, tags: [] }],
  });
  await call('POST', '/v2/ApplyClusterLayout', { version: layout.version + 1 });
}

try {
  await call('GET', `/v2/GetKeyInfo?id=${encodeURIComponent(accessKeyId)}`);
} catch (error) {
  if (error.status !== 404 && error.status !== 400) throw error;
  await call('POST', '/v2/ImportKey', { accessKeyId, secretAccessKey, name: 'scolaly' });
}

let bucketInfo;
try {
  bucketInfo = await call('GET', `/v2/GetBucketInfo?globalAlias=${encodeURIComponent(bucket)}`);
} catch (error) {
  if (error.status !== 404 && error.status !== 400) throw error;
  bucketInfo = await call('POST', '/v2/CreateBucket', { globalAlias: bucket });
}
await call('POST', '/v2/AllowBucketKey', {
  bucketId: bucketInfo.id,
  accessKeyId,
  permissions: { read: true, write: true, owner: true },
});
console.warn(`Garage prêt : bucket « ${bucket} », clé ${accessKeyId}.`);
