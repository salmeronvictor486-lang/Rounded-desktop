/** CSS mínimo para renderizar diapositivas fuera de la aplicación (impresión/PDF). */
export const SLIDE_PRINT_CSS = `
.slide-frame { position: relative; overflow: hidden; }
.slide-surface { position: relative; transform-origin: 0 0; overflow: hidden; }
.sl-el { position: absolute; box-sizing: border-box; }
.sl-text { width: 100%; height: 100%; display: flex; flex-direction: column; box-sizing: border-box; overflow: visible; word-wrap: break-word; }
.sl-text.valign-top { justify-content: flex-start; } .sl-text.valign-middle { justify-content: center; } .sl-text.valign-bottom { justify-content: flex-end; }
.sl-rich { font-size: 24px; line-height: 1.2; }
.sl-rich p { margin: 0; min-height: 1em; }
.sl-rich ul, .sl-rich ol { margin: 0; padding-left: 1.2em; }
.sl-rich li { margin: 0 0 .25em; }
.sl-rich a { color: inherit; }
.sl-table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; }
.sl-table td { border: 1px solid; padding: 4px 8px; vertical-align: middle; overflow: hidden; }
`;
