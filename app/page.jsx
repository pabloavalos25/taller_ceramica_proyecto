import LoginForm from './login-form';
export const dynamic = 'force-dynamic';
export default function Home() {
  return <main className="shell"><section className="welcome"><div><span className="eyebrow">Multiespacio cultural · Taller de artes</span><h1>Un espacio para crear y compartir.</h1><p>Tu taller, tus encuentros y toda tu información en un mismo lugar.</p></div><footer>SUYAI · Multiespacio Cultural</footer></section><section className="form-side"><div className="panel"><img className="logo" src="/logo.png" alt="SUYAI – Multiespacio Cultural" /><h2>Te damos la bienvenida</h2><p className="sub">Ingresá con los datos que te proporcionó el taller.</p><LoginForm enabled={process.env.AUTH_WEB_ENABLED === 'true'} /><p className="help">¿Necesitás ayuda para ingresar? Contactá a la administración del taller.</p></div></section></main>;
}
