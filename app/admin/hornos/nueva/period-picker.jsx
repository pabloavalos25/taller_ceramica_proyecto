'use client';
import {useEffect, useRef, useState} from 'react';
import {formatPeriod, makePeriod, monthNames, periodHint} from '../../../../src/kiln/period.mjs';

export default function PeriodPicker({value, onChange, kind}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(null);
  const container = useRef(null);
  const trigger = useRef(null);
  const label = formatPeriod(value);
  function toggle() {
    if (!open) setYear(label ? Number(value.slice(0, 4)) : new Date().getFullYear());
    setOpen(!open);
  }
  useEffect(() => {
    if (!open) return;
    function dismiss(event) { if (!container.current?.contains(event.target)) setOpen(false); }
    function escape(event) { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="period-field" ref={container}>
    <span id="kiln-period-label" className="period-label">Período de cobro</span>
    <button type="button" className="period-trigger" ref={trigger} onClick={toggle} aria-expanded={open} aria-controls="kiln-period-menu" aria-labelledby="kiln-period-label kiln-period-value"><span id="kiln-period-value">{label || 'Elegir mes y año'}</span><span aria-hidden="true">▦</span></button>
    {value && !label && <p className="period-hint">Elegí nuevamente el mes y el año del borrador.</p>}
    {open && <div className="period-menu" id="kiln-period-menu" aria-label="Elegir período de cobro">
      <div className="period-year"><button type="button" disabled={year <= 1} onClick={() => setYear(year - 1)} aria-label="Año anterior">‹</button><strong aria-live="polite">{year}</strong><button type="button" disabled={year >= 9999} onClick={() => setYear(year + 1)} aria-label="Año siguiente">›</button></div>
      <div className="period-months">{monthNames.map((month, index) => <button type="button" key={month} aria-pressed={value === makePeriod(year, index)} onClick={() => {onChange(makePeriod(year, index)); setOpen(false); trigger.current?.focus();}}>{month}</button>)}</div>
    </div>}
    <p className="period-hint">{periodHint(kind)}</p>
  </div>;
}
