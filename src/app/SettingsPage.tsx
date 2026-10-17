import { useEffect, useState } from 'react';
import { DatabaseBackup, HardDrive, Upload } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { DEFAULT_LIMITS, getLimits, setLimits } from '@/config/limits';
import { exportBackup, importBackup, requestPersistence, storageEstimate } from '@/core/storage/backup';
import { repository } from '@/core/storage/repository';
import { downloadBlob, pickFiles } from '@/core/files/download';
import { readFileBytes } from '@/core/files/validate';
import { formatBytes } from '@/core/util/format';
import { Button } from '@/ui/Button';
import { reportError, toast } from '@/ui/toast';
import { useTheme, type ThemePref } from './theme';
import { usePreferences } from './preferences';

export function SettingsPage() {
  const { pref, setPref } = useTheme();
  const prefs = usePreferences();
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [maxMb, setMaxMb] = useState(Math.round(getLimits().maxFileBytes / 1024 / 1024));

  useEffect(() => {
    void storageEstimate().then(setEstimate);
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-header">
        <h1>Ajustes</h1>
      </div>

      <section className="section">
        <div className="section-header"><h2>Apariencia</h2></div>
        <div className="chip-row" role="radiogroup" aria-label="Tema">
          {(['light', 'dark', 'system'] as ThemePref[]).map((p) => (
            <button key={p} type="button" className="chip" role="radio" aria-checked={pref === p} aria-pressed={pref === p} onClick={() => setPref(p)}>
              {p === 'light' ? 'Claro' : p === 'dark' ? 'Oscuro' : 'Según el sistema'}
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-header"><h2>Edición</h2></div>
        <div className="field">
          <label className="field-label" htmlFor="spell-lang">Idioma del corrector ortográfico</label>
          <select id="spell-lang" className="select" value={prefs.spellLang} onChange={(e) => prefs.set({ spellLang: e.target.value })}>
            <option value="es">Español</option>
            <option value="en">Inglés</option>
            <option value="fr">Francés</option>
            <option value="de">Alemán</option>
            <option value="it">Italiano</option>
            <option value="pt">Portugués</option>
            <option value="ca">Catalán</option>
          </select>
          <p className="faint" style={{ marginTop: 6 }}>
            Se usa el corrector integrado del navegador o del sistema operativo. Debe tener instalado el diccionario del idioma.
          </p>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={prefs.spellcheck} onChange={(e) => prefs.set({ spellcheck: e.target.checked })} />
          Activar corrección ortográfica
        </label>
      </section>

      <section className="section">
        <div className="section-header"><h2>Almacenamiento</h2></div>
        <p className="muted">
          {BRAND.suiteName} guarda los archivos únicamente en este navegador (IndexedDB). No se envía nada a ningún servidor.
        </p>
        <p>
          <HardDrive size={15} style={{ verticalAlign: -2 }} /> Uso: {estimate ? `${formatBytes(estimate.usage)} de ${formatBytes(estimate.quota)}` : 'no disponible'}
          {' · '}
          Persistente: {persisted === null ? 'desconocido' : persisted ? 'sí' : 'no'}
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {!persisted && (
            <Button
              onClick={async () => {
                const ok = await requestPersistence();
                setPersisted(ok);
                if (ok) toast.success('El navegador conservará tus archivos aunque falte espacio.');
                else toast.warning('El navegador no ha concedido almacenamiento persistente.');
              }}
            >
              Solicitar almacenamiento persistente
            </Button>
          )}
          <Button
            icon={DatabaseBackup}
            onClick={async () => {
              try {
                const blob = await exportBackup();
                downloadBlob(blob, `copia-${BRAND.shortName.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.zip`);
              } catch (e) {
                reportError(e, 'No se pudo crear la copia de seguridad');
              }
            }}
          >
            Descargar copia de seguridad
          </Button>
          <Button
            icon={Upload}
            onClick={async () => {
              const [file] = await pickFiles('.zip');
              if (!file) return;
              try {
                const res = await importBackup(await readFileBytes(file));
                toast.success(`Copia restaurada: ${res.files} archivo(s), ${res.folders} carpeta(s).`);
              } catch (e) {
                reportError(e, 'No se pudo restaurar la copia');
              }
            }}
          >
            Restaurar copia
          </Button>
        </div>
      </section>

      <section className="section">
        <div className="section-header"><h2>Seguridad</h2></div>
        <div className="field" style={{ maxWidth: 320 }}>
          <label className="field-label" htmlFor="max-size">Tamaño máximo de importación (MB)</label>
          <input
            id="max-size"
            className="input"
            type="number"
            min={1}
            max={2048}
            value={maxMb}
            onChange={(e) => setMaxMb(Number(e.target.value))}
            onBlur={async () => {
              const mb = Math.min(2048, Math.max(1, Math.round(maxMb || DEFAULT_LIMITS.maxFileBytes / 1048576)));
              setMaxMb(mb);
              setLimits({ maxFileBytes: mb * 1024 * 1024 });
              await repository.setSetting('limits', getLimits());
            }}
          />
        </div>
        <p className="faint">
          Las macros y el contenido activo de los documentos importados nunca se ejecutan. Los archivos ZIP se inspeccionan antes de descomprimirse.
        </p>
      </section>

      <section className="section">
        <div className="section-header"><h2>Acerca de</h2></div>
        <p className="muted">
          {BRAND.suiteName} {__APP_VERSION__} — software libre (MIT). Sin telemetría. Consulta THIRD_PARTY_NOTICES.md para las licencias de terceros.
        </p>
      </section>
    </div>
  );
}
