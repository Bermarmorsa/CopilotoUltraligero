export interface ChecklistItem {
  id: string;
  text: string;
}

export interface Checklist {
  id: string;
  name: string;
  items: ChecklistItem[];
}

export interface Waypoint {
  id: string;
  name: string;
  lugar: string;
  heading: string;
  altitude: string;
  ceiling: string;
  notes: string;
}

export interface Route {
  id: string;
  name: string;
  waypoints: Waypoint[];
}

export interface Runway {
  id: string;
  number: string;
  circuit: string;
  length?: string;
  slope?: string;
  material?: string;
}

export interface Aerodrome {
  id: string;
  code: string;
  name: string;
  elevation: string;
  runways: Runway[];
  frequencies: string[];
  observations: string;
}

export const CHECKLISTS: Record<string, Checklist> = {
  prevuelo: {
    id: 'prevuelo',
    name: 'Prevuelo',
    items: [
      { id: '1', text: 'Documentación del avión a bordo' },
      { id: '2', text: 'Inspección exterior general' },
      { id: '3', text: 'Nivel de combustible y aceite' },
      { id: '4', text: 'Mandos libres y correctos' },
      { id: '5', text: 'Instrumentos de motor en arco verde' },
      { id: '6', text: 'Cinturones y puertas cerradas' },
    ],
  },
  aproximacion: {
    id: 'aproximacion',
    name: 'Aproximación',
    items: [
      { id: '1', text: 'Altímetro ajustado' },
      { id: '2', text: 'Mezcla rica' },
      { id: '3', text: 'Bomba de combustible encendida' },
      { id: '4', text: 'Luces de aterrizaje encendidas' },
      { id: '5', text: 'Frenos comprobados' },
    ],
  },
  fallo_motor: {
    id: 'fallo_motor',
    name: 'Fallo de Motor',
    items: [
      { id: '1', text: 'Velocidad de planeo 65 nudos' },
      { id: '2', text: 'Buscar campo para aterrizaje' },
      { id: '3', text: 'Calefacción de carburador tirada' },
      { id: '4', text: 'Selector de combustible en ambos' },
      { id: '5', text: 'Magnetos en ambos' },
      { id: '6', text: 'Mayday en 121.5 si es posible' },
    ],
  },
  enfermedad_piloto: {
    id: 'enfermedad_piloto',
    name: 'Enfermedad de Piloto',
    items: [
      { id: '1', text: 'Acompañante toma los mandos' },
      { id: '2', text: 'Mantener nivel de vuelo' },
      { id: '3', text: 'Declarar emergencia' },
      { id: '4', text: 'Dirigirse al aeródromo más cercano' },
    ],
  },
  enfermedad_acompanante: {
    id: 'enfermedad_acompanante',
    name: 'Enfermedad de Acompañante',
    items: [
      { id: '1', text: 'Asegurar al acompañante' },
      { id: '2', text: 'Notificar a torre o frecuencia local' },
      { id: '3', text: 'Prioridad para el aterrizaje' },
    ],
  },
};

export const INITIAL_FLIGHT_PLANS: Route[] = [
  {
    id: '1',
    name: 'Taragudo a Sigüenza',
    waypoints: [
      {
        id: '1',
        name: 'Punto de Salida',
        lugar: 'Taragudo',
        heading: '090',
        altitude: '2000 ft',
        ceiling: '3500 ft',
        notes: 'Salida por el sector Este, evitar zona urbana.',
      },
      {
        id: '2',
        name: 'Cerro de Hita',
        lugar: 'Hita',
        heading: '120',
        altitude: '2500 ft',
        ceiling: '4000 ft',
        notes: 'Referencia visual clara, antena en la cima.',
      },
    ],
  },
];

export const INITIAL_AERODROMES: Aerodrome[] = [
  {
    id: '1',
    code: 'LECI',
    name: 'Casarrubios',
    elevation: '2000 ft',
    runways: [
      { id: 'r1', number: '08', circuit: 'Izquierda', length: '950m', material: 'Asfalto' },
      { id: 'r2', number: '26', circuit: 'Derecha', length: '950m', material: 'Asfalto' }
    ],
    frequencies: ['123.500'],
    observations: 'Frecuencia auto-información.',
  },
  {
    id: '2',
    code: 'LECU',
    name: 'Cuatro Vientos',
    elevation: '2267 ft',
    runways: [
      { id: 'r3', number: '09', circuit: 'Izquierda', length: '1200m', material: 'Asfalto' },
      { id: 'r4', number: '27', circuit: 'Derecha', length: '1200m', material: 'Asfalto' }
    ],
    frequencies: ['118.700', '121.700'],
    observations: 'Control torre obligatorio.',
  },
];
