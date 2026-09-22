import type { EnergyState } from './types'

export const ENERGY_LABEL: Record<EnergyState, string> = {
  activacion: 'Activación',
  focus: 'Focus',
  recuperacion: 'Recuperación',
  produccion: 'Producción',
  cuerpo: 'Cuerpo',
  'segundo-pico': 'Segundo pico',
  cierre: 'Cierre',
}

/** Contextual orientation shown on entry: ¿Listo para [estado]? */
export const ENERGY_QUESTION: Record<EnergyState, string> = {
  activacion: '¿Listo para activarte?',
  focus: '¿Listo para concentrarte?',
  recuperacion: '¿Listo para recuperarte?',
  produccion: '¿Listo para producir?',
  cuerpo: '¿Listo para moverte?',
  'segundo-pico': '¿Listo para el segundo pico?',
  cierre: '¿Listo para cerrar el día?',
}
