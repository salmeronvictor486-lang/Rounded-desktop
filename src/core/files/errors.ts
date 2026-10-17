/** Error comprensible para el usuario durante importación/exportación. */
export class FileFormatError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = 'FileFormatError';
  }
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}
