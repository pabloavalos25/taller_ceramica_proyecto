import {formatArsCents} from '../../src/fees/amounts.mjs';

export default function CategorySummary({summary}) {
  return <div className="portal-category-grid">{[['FEE','Cuotas pendientes'],['KILN','Hornos'],['MATERIAL','Materiales']].map(([key,label]) => <section className="portal-card" key={key}><span className="portal-eyebrow">{label}</span><p className="portal-value">{summary.inconsistent ? 'Requiere revisión' : formatArsCents(summary.byCategory[key])}</p><p className="portal-hint">Saldo pendiente</p></section>)}</div>;
}
