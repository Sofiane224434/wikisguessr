#!/usr/bin/env node

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5000/api';
const IDENTIFIER = process.env.SMOKE_ADMIN_IDENTIFIER || process.env.ADMIN_IDENTIFIER || '';
const PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '';

const fail = (message) => {
  console.error(`SMOKE KO: ${message}`);
  process.exit(1);
};

const ok = (message) => {
  console.log(`SMOKE OK: ${message}`);
};

const callApi = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const reason = data?.error || `${response.status}`;
    throw new Error(`${method} ${path} -> ${reason}`);
  }

  return data;
};

const run = async () => {
  if (!IDENTIFIER || !PASSWORD) {
    console.log('SMOKE SKIPPED: define SMOKE_ADMIN_IDENTIFIER and SMOKE_ADMIN_PASSWORD to run full checks.');
    process.exit(0);
  }

  ok(`Base URL ${BASE_URL}`);

  const login = await callApi('/auth/login', {
    method: 'POST',
    body: {
      identifier: IDENTIFIER,
      password: PASSWORD
    }
  });

  const token = login?.token;
  if (!token) {
    fail('Login did not return a token.');
  }
  ok('Admin login');

  const me = await callApi('/auth/me', { token });
  if (me?.user?.role !== 'admin') {
    fail(`Expected admin role, got ${me?.user?.role || 'unknown'}.`);
  }
  ok('Profile role=admin');

  const users = await callApi('/auth/users', { token });
  if (!Array.isArray(users?.users)) {
    fail('Users list payload invalid.');
  }
  ok(`Users list (${users.users.length})`);

  const roll = await callApi('/games/random-roll', { token });
  const startArticle = roll?.roll?.startArticle;
  if (!startArticle) {
    fail('Random roll missing startArticle.');
  }
  ok(`Random roll start=${startArticle}`);

  const wiki = await callApi(`/wiki/mobile-html?title=${encodeURIComponent(startArticle)}`);
  if (!wiki?.html) {
    fail('Wiki mobile-html response missing html field.');
  }
  ok('Wiki mobile-html fetch');

  const pending = await callApi('/wiki/articles/disambiguation-pending', { token });
  if (!Array.isArray(pending?.pending)) {
    fail('Disambiguation pending payload invalid.');
  }
  ok(`Disambiguation pending (${pending.pending.length})`);

  console.log('SMOKE SUCCESS: admin + game critical flow is healthy.');
};

run().catch((error) => {
  fail(error.message || String(error));
});
