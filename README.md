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
| `?field=hold` · `collapse` · `fast` | Revisión del DAY FIELD: `hold` lo mantiene vivo e inspeccionable sin salida automática (CONTINUAR sigue funcionando); `collapse` acorta mensaje y exploración para revisar estabilización → desmaterialización → partículas → HOY a velocidad normal; `fast` acelera toda la entrada. Se pueden combinar (`fast,hold`). Sin el parámetro, nada cambia. |

Momentos útiles: `06:10` (meditación activa), `07:10` (meditación pendiente → ¿mover a las 9:30?), `08:29` (transición entre bloques), `10:14` (Páginas Web, bloque profundo con objetivo), `12:05` (recuperación), `14:10` (bloque profundo sin objetivo), `17:00` (cuerpo), `19:30` (segundo pico), `21:00` (cierre, atmósfera profunda), `04:00` (noche).

El estado del día se guarda en `localStorage` por fecha (`personal-os:day:YYYY-MM-DD`), así una recarga no pierde lo marcado y cada día empieza limpio. Para reiniciar un día, borra esa clave.

## Entrada diaria

```
ABRIR APP → ATMÓSFERA VIVA → MENSAJE → EL MENSAJE SE DISUELVE → DAY FIELD (≥ 15 s, vivo e inspeccionable)
→ ESTABILIZACIÓN → LAS FORMAS SE DESMATERIALIZAN → PARTÍCULAS → CONVERGEN EN AHORA → HOY SE MATERIALIZA
```

- **Primera apertura real del día** (fecha local): entrada completa, automática (≈ 30 s en total, de ellos ≥ 15 s de campo). Un toque durante el mensaje lo hace avanzar; en el campo, los toques inspeccionan. `dailyEntrySeenDate` se guarda cuando HOY ya está en pantalla: si la app se cierra antes, el ritual vuelve a aparecer.
- **Mismo día, vuelta tras ≥ 30 min**: micro entrada (≈1,7 s): atmósfera breve → *¿Listo para volver?* → HOY.
- **Mismo día, vuelta en < 30 min**: HOY directamente.
- Cambiar de pestaña, bloquear el teléfono o volver de otra app no dispara nada: se decide una vez por carga de página. Si cambia el día con la app abierta, la entrada del nuevo día llega en la siguiente apertura real.
- Con una sesión de Focus en curso no se muestra ninguna entrada.
- **Mensaje del día**: biblioteca editorial local en `src/data/dailyMessages.ts`, sin IA ni red. Se elige con `díaDelAño % mensajes` y se guarda `dailyMessageId` con la fecha, así todo el día muestra el mismo.
- Memoria en `localStorage` → `personal-os:entry` (`dailyEntrySeenDate`, `dailyMessage`, `lastActiveAt`).

### DAY FIELD

El día como campo alrededor del presente, visto una vez al entrar. No es un calendario.

- **Mismos datos que HOY**: se construye con `buildDayView` (sin duplicar horarios). Inicio y fin salen de la rutina: primer bloque → inicio de Dormir. Nada está fijado al martes ni a las 06:00/22:00.
- **Gramática**: posición = orden · distancia al presente = distancia temporal (algo comprimida lejos de ahora) · tamaño = peso del bloque · nitidez y opacidad = cercanía temporal · halo = intensidad / estado energético · densidad de micro-puntos = concentración · espacio abierto = recuperación y transiciones · pulso del presente = estado energético.
- **Roles** (`getVisualRole`, derivados del tipo de bloque; `visualRole` en la rutina los sobrescribe): micro, medio, mayor, espacio (sin nodo: trayectoria abierta y luz difusa) y extremo (Dormir). El bloque actual siempre es el nodo presente.
- **Tiempo y ejecución separados**: pasado / presente / futuro sale del reloj; completado (núcleo sólido), parcial (medio núcleo), omitido (anillo abierto) y sin registrar (anillo hueco) salen **solo** del estado guardado, en el núcleo de cada forma. Un bloque pasado sin registro nunca se muestra como hecho. El campo no modifica el estado.
- **Composición**: el presente anclado (móvil ≈ 45 % × 44 %), trayectoria en S abierta y fragmentada; los nodos se apartan unos píxeles de la línea para que sea un campo, no una timeline. Por la mañana casi todo está delante; por la noche, detrás. Como máximo tres nombres.

#### Polymorphic Aperture System (V0.6)

Una sola materia visual con cinco configuraciones: **A · Cardinal perlado** (esquinas abiertas), **B · Órbita astral hielo** (arcos incompletos), **C · Apertura hielo disolvente** (segmentos irregulares), **D · Eje azul-plata** (ejes desplazados) y **E · Prisma perlado hielo** (láminas facetadas translúcidas).

- **No codifican el tipo de actividad**: son el estado dinámico de la materia. Se reparten por el campo de forma que los vecinos no se repiten y las cinco coexisten.
- **Misma materia**: cada forma son los mismos seis fragmentos curvos alrededor de un núcleo modular (núcleo + cuatro satélites), así que cualquier forma se transforma en otra moviendo sus fragmentos: es *morph*, no un fundido. Cadena: Cardinal → Órbita → Prisma → Eje → Disolvente.
- **Coreografía** (`morphPlan`): 90 % quietud. Entre los 3 y los 15 s, uno o dos nodos secundarios cambian a la vez, en zonas distintas, cada vez más sutil. AHORA recorre las cinco configuraciones y siempre termina en Apertura disolvente antes del colapso.
- **Luz**: color en halos, reflejos y profundidad, no en rellenos. Cada forma tiene su Astral Fade irregular (perla, plata, hielo y un violeta casi invisible) que nace, deriva, se expande y vuelve. Deriva de pocos píxeles y micro-reflejos ocasionales; el presente es lo más estable.
- **Inspección**: tocar cualquier nodo detiene su morph, lo acerca, lo enfoca y atenúa el resto; aparece una microcard (nombre, horario, tipo · estado, objetivo y pendiente si existen), sin acciones. Tocar fuera o Esc la cierra; unos 800 ms después el nodo retoma su ciclo. Con una microcard abierta el campo nunca sale solo: espera a que se cierre y luego ≈ 2 s. Hacia los 12 s aparece, discreto, **CONTINUAR →**, que empieza la transición (no salta a HOY).
- **Desmaterialización diferenciada**: Cardinal separa sus esquinas y las erosiona; Órbita fragmenta sus arcos, que siguen girando; Disolvente se erosiona desde los extremos; Eje se rompe del centro hacia fuera; Prisma pierde el borde y sus facetas se separan como láminas de luz. Todas acaban como **la misma partícula** (canvas, solo para las partículas). Lo lejano se deshace primero; AHORA, el último.
- **Partículas → AHORA → HOY**: la materia converge en AHORA; la mayor parte se disuelve, una parte la absorbe el presente y cuatro partículas completan, junto al núcleo y sus satélites, el módulo 3 × 3, que aterriza sobre el marcador AHORA de HOY mientras HOY se materializa.
- **Movimiento reducido**: las cinco formas siguen presentes (variedad estática), sin morph, deriva ni trayectorias de partículas; fundidos hacia AHORA y HOY.
- Código: `src/features/dayfield/` — `model.ts` (modelo), `geometry.ts` (composición), `forms.ts` (las cinco formas, morph, reparto y coreografía), `particles.ts` (materia), `FormNode.tsx`, `AstralFade.tsx`, `ParticleCanvas.tsx`, `MicroCard.tsx`, `DayField.tsx`.

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
    entry/         entrada diaria y micro entrada, reglas de sesión, mensaje del día
    dayfield/      DAY FIELD: modelo, composición y dibujo del día alrededor del presente
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
