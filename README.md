# PERSONAL OS — Iteración 1: HOY + FOCUS

Aplicación web de rutina semanal. Esta iteración contiene **solo** la pantalla HOY y el modo FOCUS, con el martes como dataset real.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # motor de horario (vitest)
npm run build      # typecheck + build de producción
```

## Revisar cualquier momento del día

| Parámetro | Efecto |
| --- | --- |
| `?t=10:14` | El reloj arranca a esa hora y sigue corriendo desde ahí. |
| `?motion=completo` · `sutil` · `reducido` | Fuerza un nivel de movimiento (por defecto: `reducido` si el sistema pide `prefers-reduced-motion`, si no `completo`). |
| `?entry=full` · `micro` · `none` | Fuerza la entrada diaria completa, la micro entrada o ninguna, ignorando las reglas de sesión (no guarda nada). |

Momentos útiles: `06:10` (meditación activa), `07:10` (meditación pendiente → ¿mover a las 9:30?), `08:29` (transición entre bloques), `10:14` (Páginas Web, bloque profundo con objetivo), `12:05` (recuperación), `14:10` (bloque profundo sin objetivo), `17:00` (cuerpo), `19:30` (segundo pico), `21:00` (cierre, atmósfera profunda), `04:00` (noche).

El estado del día se guarda en `localStorage` por fecha (`personal-os:day:YYYY-MM-DD`), así una recarga no pierde lo marcado y cada día empieza limpio. Para reiniciar un día, borra esa clave.

## Entrada diaria

```
ABRIR APP → CAMPO ATMOSFÉRICO → MENSAJE DEL DÍA → DISOLUCIÓN → PUNTOS SE ORGANIZAN
→ ¿LISTO PARA [ESTADO]? → actividad actual → ENTRAR → HOY se materializa
```

- **Primera apertura real del día** (fecha local): entrada completa. `dailyEntrySeenDate` se guarda al pulsar ENTRAR, no al empezar: si la app se cierra antes, el ritual vuelve a aparecer.
- **Mismo día, vuelta tras ≥ 30 min**: micro entrada (≈1,7 s): atmósfera breve → *¿Listo para volver?* → HOY.
- **Mismo día, vuelta en < 30 min**: HOY directamente.
- Cambiar de pestaña, bloquear el teléfono o volver de otra app no dispara nada: se decide una vez por carga de página. Si cambia el día con la app abierta, la entrada del nuevo día llega en la siguiente apertura real.
- Con una sesión de Focus en curso no se muestra ninguna entrada.
- **Mensaje del día**: biblioteca editorial local en `src/data/dailyMessages.ts`, sin IA ni red. Se elige con `díaDelAño % mensajes` y se guarda `dailyMessageId` con la fecha, así todo el día muestra el mismo.
- **Orientación**: *¿Listo para [estado]?* según el estado energético (`ENERGY_QUESTION` en `src/domain/energy.ts`) y debajo la actividad actual. Es independiente del mensaje.
- Memoria en `localStorage` → `personal-os:entry` (`dailyEntrySeenDate`, `dailyMessage`, `lastActiveAt`).

## Arquitectura

```
src/
  domain/          modelo puro, sin React
    types.ts       Rutina, bloques, estados (PRÓXIMO, ACTIVO, EN FOCUS, COMPLETADO, PARCIAL, OMITIDO)
    schedule.ts    buildDayView(rutina, estado, hora) → ahora / siguiente / después / camino / progreso
    time.ts, labels.ts, energy.ts
  data/
    routines/      una rutina por día + registro semanal (index.ts)
    profile.ts
  state/           reloj, reducer del día, persistencia, DayProvider
  motion/          vocabulario de movimiento (tokens.ts) y niveles COMPLETO / SUTIL / REDUCIDO
  atmosphere/      Astral Fade (halos), partículas, presets por estado energético
  components/      dot typography (DotWord, glifos 5×7), botones, labels, glifos de estado
  features/
    today/         HOY: contexto, AHORA, SIGUIENTE, camino del día, meditación pendiente
    focus/         flujo HOY → FOCUS → RESULTADO → SIGUIENTE → HOY
    closing/       pregunta de resultado (Sí / Parcial / No), compartida por HOY y FOCUS
  layout/          navegación lateral (desktop) y secciones
```

**Añadir un día:** crea `src/data/routines/lunes.ts` con la misma forma que `tuesday.ts` y regístralo en `src/data/routines/index.ts` (`1: lunes`). La UI no contiene datos de rutina.

## Decisiones de interpretación

Puntos donde la especificación dejaba margen. Todos son fáciles de cambiar.

- **Bloques pasados sin acción cuentan como cumplidos** (así el camino muestra ✓ como en el ejemplo, sin exigir confirmar cada bloque). Se pueden corregir desde el camino del día (desplegar el bloque → *Marcar omitido*). La meditación es la excepción: nunca se da por hecha.
- **Meditación:** si su franja pasa sin marcarla, queda *pendiente* y aparece *¿Mover a las 09:30?* hasta el final de esa franja. *Sí* la mueve y sustituye a Lectura (Lectura no se reubica). Añadí *Ya la hice* por si se hizo sin marcarla. Si nadie responde antes de las 10:00, cuenta como omitida.
- **Resultado "No"** deja el bloque COMPLETADO (se trabajó) con resultado *no conseguido*; *Parcial* → estado PARCIAL con la nota de lo pendiente. Nada se reprograma.
- **Transiciones** (llevar hermana, pausa, alimentación, comida/ducha y huecos cortos entre bloques) aparecen en AHORA cuando tocan, sin acciones, y no cuentan en el camino ni en el progreso. El progreso cuenta 13 bloques (todo el camino excepto Dormir).
- **Acciones de AHORA:** bloque profundo → *Iniciar focus* · *Cerrar bloque* · *Omitir*; resto → *Completar* · *Omitir*. Tras cerrar, *Deshacer* permite corregir un toque accidental.
- **FOCUS** tiene *Finalizar bloque* y, discreto, *Salir sin cerrar* (vuelve a HOY sin registrar resultado). El temporizador cuenta lo que queda del bloque; si se pasa, muestra el exceso con `+`.
- **CIERRE** (20:50 en adelante) usa la atmósfera profunda también en HOY; el resto de estados son claros.
- **Días sin rutina propia** muestran la del martes, con una nota discreta junto al tema del día.
- **Navegación:** en desktop aparecen Semana, Aprender y Sistema atenuadas y sin acción, solo para validar la estructura. Para ocultarlas, basta con quitarlas de `src/layout/sections.ts`. En móvil no hay navegación: solo existe HOY.
- **Sin marca:** el único signo de identidad es una matriz de 3×3 puntos (placeholder).

## Sistema de movimiento

| Verbo | Dónde |
| --- | --- |
| FADE | Entrada escalonada de HOY, información que aparece/desaparece |
| DRIFT | Halos (ciclos de 26–44 s) y partículas (15–40 s), solo CSS |
| CONVERGE | Partículas hacia el centro y puntos que forman `FOCUS` |
| DISSOLVE | La palabra `FOCUS` se deshace; el temporizador se desvanece al finalizar |
| EXPAND | Camino del día y detalle de cada bloque |
| PULSE | Punto del bloque activo |
| MORPH | Cambio de bloque en AHORA, estado energético, acciones → resultado |
| ORBIT | Anillo del temporizador en FOCUS |

Transición HOY → FOCUS: 0–250 ms superficies secundarias · 250–650 ms sale la navegación, AHORA toma protagonismo, los halos se expanden · 650–1000 ms la luz pasa a azul profundo y las partículas convergen · `FOCUS` en dot typography · se disuelve y quedan temporizador, proyecto, objetivo y finalizar.

Con `prefers-reduced-motion` no hay partículas, halos animados ni secuencia cinematográfica: solo fundidos.
