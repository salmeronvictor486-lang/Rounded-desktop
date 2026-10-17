import { debounce, type Debounced } from '@/core/util/debounce';
import { repository } from './repository';
import { ConflictError, type FileMeta } from './types';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

export interface AutosaveOptions {
  delay?: number;
  /** Intervalo mínimo entre instantáneas automáticas del historial. */
  snapshotInterval?: number;
  onStatus?: (status: SaveStatus, error?: unknown) => void;
  onSaved?: (meta: FileMeta) => void;
}

/**
 * Controla el guardado automático de un archivo abierto: agrupa cambios,
 * serializa escrituras, detecta conflictos y crea instantáneas periódicas.
 */
export class AutosaveController<T> {
  private revision: number;
  private latest: T | null = null;
  private saving: Promise<void> | null = null;
  private status: SaveStatus = 'saved';
  private lastSnapshot = Date.now();
  private readonly debounced: Debounced<[]>;
  private disposed = false;

  constructor(
    readonly fileId: string,
    initialRevision: number,
    private readonly serialize: () => T,
    private readonly opts: AutosaveOptions = {},
  ) {
    this.revision = initialRevision;
    this.debounced = debounce(() => void this.flush(), opts.delay ?? 800);
  }

  get currentRevision(): number {
    return this.revision;
  }

  get currentStatus(): SaveStatus {
    return this.status;
  }

  private setStatus(s: SaveStatus, err?: unknown) {
    this.status = s;
    this.opts.onStatus?.(s, err);
  }

  /** Marca el documento como modificado y programa el guardado. */
  markDirty(): void {
    if (this.disposed || this.status === 'conflict') return;
    this.setStatus('dirty');
    this.debounced();
  }

  /** Guarda inmediatamente (si hay cambios pendientes). */
  async flush(opts: { force?: boolean } = {}): Promise<void> {
    this.debounced.cancel();
    if (this.status === 'conflict' && !opts.force) return;
    if (this.saving) await this.saving;
    if (this.status !== 'dirty' && this.status !== 'error' && !opts.force) return;
    this.latest = this.serialize();
    const content = this.latest;
    this.setStatus('saving');
    this.saving = (async () => {
      try {
        const meta = await repository.saveContent(this.fileId, content, this.revision, { force: opts.force });
        this.revision = meta.revision;
        // Si hubo cambios mientras se guardaba, el estado ya es 'dirty' de nuevo.
        if (this.status === 'saving') this.setStatus('saved');
        this.opts.onSaved?.(meta);
        if (Date.now() - this.lastSnapshot > (this.opts.snapshotInterval ?? 10 * 60 * 1000)) {
          this.lastSnapshot = Date.now();
          await repository.createVersion(this.fileId, 'Instantánea automática', true);
        }
      } catch (err) {
        if (err instanceof ConflictError) this.setStatus('conflict', err);
        else this.setStatus('error', err);
      } finally {
        this.saving = null;
      }
    })();
    await this.saving;
    if (this.status === 'dirty') this.debounced();
  }

  /** Resuelve un conflicto sobrescribiendo con la versión local. */
  async overwrite(): Promise<void> {
    this.status = 'dirty';
    await this.flush({ force: true });
  }

  /** Acepta la revisión externa (tras recargar el contenido). */
  adoptRevision(revision: number): void {
    this.revision = revision;
    this.setStatus('saved');
  }

  hasPendingChanges(): boolean {
    return this.status === 'dirty' || this.status === 'saving' || this.debounced.pending();
  }

  dispose(): void {
    this.disposed = true;
    this.debounced.cancel();
  }
}
