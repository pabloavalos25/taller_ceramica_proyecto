import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import pg from 'pg';
import { bootstrapAdmin } from '../src/auth/bootstrap.mjs';

if (!process.stdin.isTTY || !process.stdout.isTTY || !process.env.DATABASE_URL) {
  console.error('Se requiere una terminal interactiva y DATABASE_URL configurada.');
  process.exitCode = 1;
} else {
  let muted = false;
  const output = new Writable({ write(chunk, encoding, done) { if (!muted) process.stdout.write(chunk, encoding); done(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const question = (prompt, secret = false) => new Promise((resolve) => {
    if (secret) { process.stdout.write(prompt); muted = true; }
    rl.question(secret ? '' : prompt, (answer) => { if (secret) { muted = false; process.stdout.write('\n'); } resolve(answer); });
  });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const email = await question('Correo del primer administrador: ');
    const password = await question('Contraseña (mínimo 12 caracteres): ', true);
    const confirmation = await question('Repetir contraseña: ', true);
    if (password !== confirmation) throw new Error('Las contraseñas no coinciden');
    await bootstrapAdmin(pool, email, password);
    console.log('Administrador creado.');
  } catch (error) {
    console.error(`No se creó el administrador: ${error.message}`);
    process.exitCode = 1;
  } finally { rl.close(); await pool.end(); }
}
