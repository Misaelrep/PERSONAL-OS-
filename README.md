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
| `?field=collapse` · `fast` · `hold` | Revisión de DAYSCAPE: `collapse` acorta el mensaje, forma el día de golpe (sin nombres) y sale solo tras 1,2 s para revisar FORMAS → FRAGMENTOS → PARTÍCULAS → CONVERGENCIA → HOY a velocidad normal; `fast` acelera toda la entrada; `hold` impide la salida automática de `collapse`. Se pueden combinar (`fast,collapse`). Sin el parámetro, nada cambia: DAYSCAPE solo sale con CONTINUAR. |

Momentos útiles: `06:10` (meditación activa), `07:10` (meditación pendiente → ¿mover a las 9:30?), `08:29` (transición entre bloques), `10:14` (Páginas Web, bloque profundo con objetivo), `12:05` (recuperación), `14:10` (bloque profundo sin objetivo), `17:00` (cuerpo), `19:30` (segundo pico), `21:00` (cierre, atmósfera profunda), `04:00` (noche).

El estado del día se guarda en `localStorage` por fecha (`personal-os:day:YYYY-MM-DD`), así una recarga no pierde lo marcado y cada día empieza limpio. Para reiniciar un día, borra esa clave.

## Entrada diaria

```
ABRIR APP → MENSAJE → EL MENSAJE SE DISUELVE → DAYSCAPE (el día entero se forma por oleadas; explorar sin límite)
→ CONTINUAR → FORMAS → FRAGMENTOS → CAMPO DE PARTÍCULAS → CONVERGENCIA EN AHORA → HOY EMERGE DE LA MISMA ATMÓSFERA
```

- **Primera apertura real del día** (fecha local): entrada completa. Un toque durante el mensaje lo hace avanzar; en DAYSCAPE, los toques exploran. DAYSCAPE no sale solo: **CONTINUAR →** aparece, discreto, a los ~14 s. `dailyEntrySeenDate` se guarda cuando HOY ya está en pantalla: si la app se cierra antes, el ritual vuelve a aparecer.
- **Mismo día, vuelta tras ≥ 30 min**: micro entrada (≈1,7 s): atmósfera breve → *¿Listo para volver?* → HOY.
- **Mismo día, vuelta en < 30 min**: HOY directamente.
- Cambiar de pestaña, bloquear el teléfono o volver de otra app no dispara nada: se decide una vez por carga de página. Si cambia el día con la app abierta, la entrada del nuevo día llega en la siguiente apertura real.
- Con una sesión de Focus en curso no se muestra ninguna entrada.
- **Mensaje del día**: biblioteca editorial local en `src/data/dailyMessages.ts`, sin IA ni red. Se elige con `díaDelAño % mensajes` y se guarda `dailyMessageId` con la fecha, así todo el día muestra el mismo.
- Memoria en `localStorage` → `personal-os:entry` (`dailyEntrySeenDate`, `dailyMessage`, `lastActiveAt`, `dayscapeHintDate`).

### DAYSCAPE (V0.7)

Todo el día a la vez, alrededor del presente (arquitectura D aprobada: radial alrededor de AHORA + profundidad y parallax). No hay línea ni trayectoria: el tiempo es **profundidad y materia**.

- **Mismos datos que HOY** (`buildDayView`): las 18 actividades del martes, transiciones incluidas (los huecos sintéticos no). Nada fijado al martes.
- **Tres planos**: primer plano (hasta 1 h de pasado / ~2 h de futuro), plano medio y fondo; lo lejano es más pequeño, más difuso y está más alto. El pasado está erosionado (plata, suelta materia); el futuro, todavía formándose (hielo, incompleto). **AHORA** es el centro perceptivo: destaca por nitidez, materialidad, escala y estabilidad (no hace morph ni deriva), con un azul hielo-plata poco saturado.
- **Cinco Aperturas** (Cardinal, Órbita, Disolvente, Eje, Prisma): la misma materia en cinco configuraciones; AHORA es el Prisma. Explorando, un único morph lento a la vez.
- **Tiempo y ejecución separados**: completado, parcial, omitido y sin registrar salen solo del estado guardado (núcleo de cada forma). Un bloque pasado sin registro nunca se muestra como hecho.
- **Revelado progresivo** en seis oleadas (0–2 s Merkaba, Hermana · 2–3,5 s Escritura, Breathwork, Substack · 3,5–5 s Inglés, Pausa, Lectura · 5–7 s Páginas Web, Velocity, Alimentación · 7–9 s Marca Wellness, Gimnasio, Comida / ducha · 9–11 s Marca Wellness, Cierre digital, Breathwork relajante, Dormir). Cada actividad: forma → Astral Fade → nombre → horario. **Cada nombre se lee ~1,5–2 s** y se disuelve en su sitio; las oleadas se solapan, así nunca están las 18 etiquetas a la vez. Después solo queda **AHORA / nombre / horario**, permanente.
- **Pista**: con el campo limpio aparece, muy discreto, `TOCA PARA EXPLORAR · ARRASTRA PARA RECORRER`. Se va con la primera interacción y no vuelve ese día (`dayscapeHintDate`).
- **Arrastrar** recorre el día con parallax: primer plano 100 %, medio 52 %, fondo 20 %, atmósfera 2–10 % (cada masa con su propio factor). Límites suaves e inercia.
- **Tocar** una actividad la trae al frente (tamaño de primer plano, nítida, recupera algo de materia) y la información se materializa a su alrededor —nombre y horario encima; ✦, tipo y estado debajo— sobre una neblina refractiva, **sin tarjeta**. El resto se aparta y baja, sin oscurecer; una masa de luz se acerca, muy despacio, a lo inspeccionado. Sus vecinas en el tiempo quedan menos atenuadas (preparado para deslizar a la anterior / siguiente más adelante). Tocar fuera o Esc lo devuelve todo a su sitio.
- **Símbolos delicados, dianas generosas**: cada actividad tiene un área de toque invisible de 44–52 px (gana la más cercana) y un botón accesible para teclado y lector de pantalla.
- **Atmósfera viva**: suelo perla con masas de luz independientes (perla, silver mist, hielo, violeta y un velo de niebla delante del fondo) y un reflejo especular. Cada masa vive su propia vida de 9–24 s —aparece, deriva, se expande, pierde definición, desaparece y renace en otro sitio—, visible en pocos segundos y nunca sincronizada.
- **Salida (≈ 6,6 s tras CONTINUAR)**: calma (0,6 s) → **FORMAS → FRAGMENTOS** (cada forma se abre en sus piezas, que se separan, giran y se erosionan a su manera; lo lejano primero) → **CAMPO DE PARTÍCULAS** (microfragmentos que se asientan en puntos perlados, con reflejos plata y profundidad por plano) → AHORA, el último en romperse (2,8 s) → **CONVERGENCIA** (3,7 s: cuatro puntos completan el módulo 3 × 3, una parte la absorbe el presente, el resto se disuelve) → el módulo aterriza en el AHORA de HOY mientras HOY emerge de la misma atmósfera.
- **Movimiento reducido**: sin deriva, morph ni partículas; revelado y nombres solo con opacidad; la inspección no mueve la actividad (la información aparece a su alrededor, en su sitio); arrastrar sigue funcionando, sin inercia; la atmósfera solo cambia de opacidad en su sitio; salida por fundidos.
- Código: `src/features/dayscape/` — `model.ts` (modelo y oleadas), `choreography.ts` (tiempos), `layout.ts` (composición D, nombres, inspección, dianas), `forms.ts` (las cinco formas), `morph.ts`, `matter.ts` (fragmentos → partículas → convergencia), `atmosphere.ts` (vidas de las masas de luz), `Aperture.tsx`, `MassField.tsx`, `MatterCanvas.tsx`, `DayscapeAtmosphere.tsx`, `Dayscape.tsx`.

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
    dayscape/      DAYSCAPE: el día entero alrededor del presente, su atmósfera y su materia
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
