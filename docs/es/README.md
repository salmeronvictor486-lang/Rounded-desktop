<p align="center">
  <img src="../../assets/hero.svg" alt="Rounded — un kit completo para agentes de programación con IA" width="100%" />
</p>

<p align="center">
  <strong>Idioma:</strong> <a href="../../README.md">English</a> | Español
</p>

# Rounded

**Rounded convierte un agente de programación con IA de propósito general en un compañero de equipo disciplinado.** Reúne agentes especializados, *skills* reutilizables, comandos, reglas siempre activas y *hooks* de seguridad que recogen cómo trabajan los buenos ingenieros al planificar, probar, revisar, asegurar y publicar software, y los instala en la herramienta que ya usas.

- **12 agentes**: planificador, arquitecto, revisor de código, revisor de seguridad, guía de TDD, reparador de compilaciones, depurador y más.
- **24 skills**: TDD, revisión de código, seguridad, depuración, diseño de API, migraciones, rendimiento, CI, contenedores, y TypeScript, Python, Go, Rust y React idiomáticos.
- **18 comandos**: `/plan`, `/tdd`, `/review`, `/verify`, `/debug`, `/checkpoint`, `/resume`, `/commit`, `/pr` y más.
- **14 reglas**: pautas breves que se cargan siempre (comunes y por lenguaje).
- **Hooks de seguridad**: bloquean comandos catastróficos, impiden escribir secretos en archivos, señalan código de depuración olvidado y conservan el contexto entre sesiones.

Todo es Markdown más un instalador pequeño en Node.js sin dependencias. El contenido está en inglés para llegar a más gente; los agentes responden en el idioma en que les hables.

> [!NOTE]
> Rounded es un proyecto joven (v0.1). Los hooks son una red de seguridad, no un entorno aislado: sigue usando control de versiones, revisiones y credenciales con los mínimos permisos.

## Inicio rápido

### Claude Code (plugin, recomendado)

Dentro de Claude Code:

```text
/plugin marketplace add salmeronvictor486-lang/Rounded-desktop
/plugin install rounded@rounded
```

Reinicia Claude Code y prueba `/rounded:plan añadir límite de intentos al inicio de sesión`. Las reglas no van en el plugin; añádelas con:

```bash
npx github:salmeronvictor486-lang/Rounded-desktop install --only rules
```

### Cualquier herramienta compatible (instalador)

Necesita Node.js 18 o superior:

```bash
# Claude Code, perfil core, en ~/.claude
npx github:salmeronvictor486-lang/Rounded-desktop install

# Varias herramientas a la vez, con todos los agentes y skills
npx github:salmeronvictor486-lang/Rounded-desktop install --target claude,codex,gemini,opencode --profile full

# Solo un proyecto (detecta sus lenguajes)
npx github:salmeronvictor486-lang/Rounded-desktop install --target cursor,claude --dir ./mi-app
```

También puedes clonar el repositorio y ejecutar `./install.sh` (macOS/Linux) o `.\install.ps1` (Windows). Usa `--dry-run` para ver los cambios antes de hacerlos y `uninstall` para quitarlo todo.

## Qué recibe cada herramienta

| | Claude Code | Codex CLI | Cursor | Gemini CLI | OpenCode (beta) |
|---|---|---|---|---|---|
| Agentes | ✅ | — | — | — | ✅ |
| Skills | ✅ | ✅ | — | — | — |
| Comandos | ✅ | — | ✅ | ✅ | ✅ |
| Reglas | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hooks | ✅ | — | — | — | — |

Detalles en [docs/harnesses.md](../harnesses.md).

## Cómo se usa

```text
/plan exportar informes a CSV      → lee el código, escribe .rounded/plan.md y espera tu visto bueno
/tdd exportar informes a CSV       → primero la prueba que falla, luego el código, luego refactorizar
/review                            → hallazgos ordenados por gravedad sobre tus cambios
/verify                            → lint, tipos, pruebas, compilación y auditoría → listo / no listo
/commit                            → mensaje Conventional Commits a partir del diff preparado
/pr                                → descripción del pull request con notas de pruebas
```

Al terminar el día, `/checkpoint` guarda el trabajo y escribe `.rounded/handoff.md`; la siguiente sesión lo muestra automáticamente y `/resume` continúa desde ahí.

La lista completa está en el **[catálogo](../CATALOG.md)**.

## Hooks de seguridad

| Hook | Qué hace |
|---|---|
| `guard-bash` | Bloquea `rm -rf /`, formatear discos, *fork bombs* y `push --force` a `main`; pide confirmación para `git reset --hard`, `curl \| sh`, publicar paquetes, `terraform destroy`, `DROP TABLE`… |
| `secret-scan` | Impide escribir claves de API, tokens y claves privadas en el código |
| `guard-paths` | Protege `.git/`, lockfiles y dependencias instaladas |
| `debug-statements` | Señala `console.log`, `debugger`, `breakpoint()`… recién añadidos |
| `session-start` / `save-session` | Contexto del proyecto al empezar y notas guardadas entre sesiones |
| `stop-check` (estricto) | Pide pruebas si cambió código sin cambiar ningún test |

Se ajustan con `ROUNDED_HOOK_PROFILE=minimal|standard|strict` y `ROUNDED_DISABLED_HOOKS=id1,id2`. Más en [docs/hooks.md](../hooks.md).

## Contribuir

Son bienvenidas nuevas skills, mejores agentes, más lenguajes y herramientas, y traducciones. Lee [CONTRIBUTING.md](../../CONTRIBUTING.md) y la [guía de autoría](../authoring.md), y ejecuta `npm run check` antes de abrir un pull request.

## Licencia

[MIT](../../LICENSE).
