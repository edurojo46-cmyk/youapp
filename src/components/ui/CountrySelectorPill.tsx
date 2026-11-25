import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import {
  COUNTRY_CHANGED_EVENT,
  SUPPORTED_COUNTRIES,
  detectCountryFromBrowser,
  getActiveCountryProfile,
  getSavedCountryPreference,
  setUserCountryPreference,
  type CountryProfile,
  type SupportedCountryCode
} from '../../lib/geo/userCountry';

export function CountrySelectorPill({
  onChange
}: {
  onChange?: (profile: CountryProfile) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pref, setPref] = useState<SupportedCountryCode | 'auto'>(() => getSavedCountryPreference());
  const [active, setActive] = useState<CountryProfile>(() => getActiveCountryProfile());
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onCountryEvent = () => {
      setPref(getSavedCountryPreference());
      setActive(getActiveCountryProfile());
    };
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener(COUNTRY_CHANGED_EVENT, onCountryEvent);
    document.addEventListener('mousedown', onDocClick);
    return () => {
      window.removeEventListener(COUNTRY_CHANGED_EVENT, onCountryEvent);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, []);

  const handleSelect = (choice: SupportedCountryCode | 'auto') => {
    const next = setUserCountryPreference(choice);
    setPref(choice);
    setActive(next);
    setOpen(false);
    onChange?.(next);
  };

  const detectedCode = detectCountryFromBrowser();

  return (
    <div ref={wrapRef} className="csp-wrap">
      <button
        type="button"
        className="csp-pill"
        onClick={() => setOpen((v) => !v)}
        title={`País activo: ${active.name}${pref === 'auto' ? ' (automático)' : ''} · Tocá para cambiar`}
        aria-label={`País activo: ${active.name}`}
        aria-expanded={open}
      >
        <span className="csp-flag" aria-hidden="true">{active.flag}</span>
        <span className="csp-code">{active.code}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="csp-menu" role="listbox" aria-label="Elegir país de contenido">
          <div className="csp-menu-title">País de noticias y música</div>
          <button
            type="button"
            className={`csp-item ${pref === 'auto' ? 'active' : ''}`}
            onClick={() => handleSelect('auto')}
          >
            <span className="csp-item-left">
              <Globe size={13} color="#64d2ff" />
              <span>Automático ({detectedCode})</span>
            </span>
            {pref === 'auto' && <Check size={13} color="#64d2ff" />}
          </button>
          <div className="csp-sep" />
          {SUPPORTED_COUNTRIES.map((c) => {
            const isSelected = pref === c.code;
            return (
              <button
                key={c.code}
                type="button"
                className={`csp-item ${isSelected ? 'active' : ''}`}
                onClick={() => handleSelect(c.code)}
              >
                <span className="csp-item-left">
                  <span aria-hidden="true">{c.flag}</span>
                  <span>{c.name}</span>
                </span>
                {isSelected && <Check size={13} color="#64d2ff" />}
              </button>
            );
          })}
        </div>
      )}

      <style>{`
        .csp-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
        }
        .csp-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #f5f5f7;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
          white-space: nowrap;
        }
        .csp-pill:hover {
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(100, 210, 255, 0.55);
        }
        .csp-flag { font-size: 13px; line-height: 1; }
        .csp-code { font-size: 11px; }
        .csp-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          z-index: 260;
          min-width: 215px;
          padding: 8px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(18, 22, 30, 0.92);
          backdrop-filter: blur(22px) saturate(160%);
          -webkit-backdrop-filter: blur(22px) saturate(160%);
          box-shadow: 0 20px 44px rgba(0, 0, 0, 0.55);
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .csp-menu-title {
          padding: 4px 8px 6px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(245, 245, 247, 0.55);
        }
        .csp-sep {
          height: 1px;
          background: rgba(255, 255, 255, 0.12);
          margin: 4px 4px;
        }
        .csp-item {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 7px 9px;
          border-radius: 10px;
          border: none;
          background: transparent;
          color: #f5f5f7;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          text-align: left;
          transition: background 0.14s ease;
        }
        .csp-item:hover { background: rgba(255, 255, 255, 0.1); }
        .csp-item.active {
          background: rgba(100, 210, 255, 0.16);
          color: #bae6fd;
        }
        .csp-item-left {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
      `}</style>
    </div>
  );
}
