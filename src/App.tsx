/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, 
  MicOff, 
  CheckCircle2, 
  AlertTriangle, 
  Plane, 
  MapPin, 
  Radio, 
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Info,
  History,
  Volume2,
  Edit3,
  Plus,
  Trash2,
  X,
  Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CHECKLISTS as INITIAL_CHECKLISTS, INITIAL_FLIGHT_PLANS, INITIAL_AERODROMES, Checklist, ChecklistItem, Waypoint, Aerodrome, Route, Runway } from './constants';

// --- Types ---
type AppState = 'idle' | 'listening' | 'checklist' | 'info';

interface VoiceLog {
  id: string;
  text: string;
  type: 'user' | 'system';
  timestamp: Date;
}

const PHONETIC_ALPHABET: Record<string, string> = {
  'A': 'Alfa', 'B': 'Bravo', 'C': 'Charlie', 'D': 'Delta', 'E': 'Echo', 'F': 'Foxtrot',
  'G': 'Golf', 'H': 'Hotel', 'I': 'India', 'J': 'Juliett', 'K': 'Kilo', 'L': 'Lima',
  'M': 'Mike', 'N': 'November', 'O': 'Oscar', 'P': 'Papa', 'Q': 'Quebec', 'R': 'Romeo',
  'S': 'Sierra', 'T': 'Tango', 'U': 'Uniform', 'V': 'Victor', 'W': 'Whiskey', 'X': 'X-ray',
  'Y': 'Yankee', 'Z': 'Zulu',
  '0': 'cero', '1': 'uno', '2': 'dos', '3': 'tres', '4': 'cuatro', '5': 'cinco', '6': 'seis', '7': 'siete', '8': 'ocho', '9': 'nueve'
};

function spellAeronautical(text: string): string {
  return text.toUpperCase().split('').map(char => PHONETIC_ALPHABET[char] || char).join(' ');
}

function readFrequency(freq: string): string {
  return freq.split('').map(char => {
    if (char === '.') return 'decimal';
    return PHONETIC_ALPHABET[char] || char;
  }).join(' ');
}

function readSlope(slope: string): string {
  return slope.split('').map(char => {
    if (char === '-') return 'menos';
    if (char === '.') return 'punto';
    if (char === '%') return 'porciento';
    if (char === ' ') return '';
    return PHONETIC_ALPHABET[char] || char;
  }).filter(Boolean).join(' ');
}

function readRunways(runways: Runway[]): string {
  return runways.map(r => {
    const numSpelled = r.number.split('').map(digit => PHONETIC_ALPHABET[digit] || digit).join(' ');
    let details = `pista ${numSpelled} circuito a ${r.circuit.toLowerCase()}`;
    if (r.length) details += `, longitud ${r.length}`;
    if (r.material) details += `, superficie de ${r.material}`;
    if (r.slope) details += `, inclinación ${readSlope(r.slope)}`;
    return details;
  }).join('. ');
}

export default function App() {
  // --- Data State ---
  const [checklists, setChecklists] = useState<Record<string, Checklist>>(() => {
    const saved = localStorage.getItem('copiloto_checklists');
    return saved ? JSON.parse(saved) : INITIAL_CHECKLISTS;
  });
  const [routes, setRoutes] = useState<Route[]>(() => {
    const saved = localStorage.getItem('copiloto_routes');
    return saved ? JSON.parse(saved) : INITIAL_FLIGHT_PLANS;
  });
  const [aerodromes, setAerodromes] = useState<Aerodrome[]>(() => {
    const saved = localStorage.getItem('copiloto_aerodromes');
    if (!saved) return INITIAL_AERODROMES;
    try {
      const parsed = JSON.parse(saved);
      // Migration: convert old 'frequency' string to 'frequencies' array
      return parsed.map((a: any) => ({
        ...a,
        frequencies: a.frequencies || (a.frequency ? [a.frequency] : []),
        elevation: a.elevation || '',
        runways: (a.runways || []).map((r: any) => ({
          ...r,
          length: r.length || '',
          slope: r.slope || '',
          material: r.material || ''
        }))
      }));
    } catch (e) {
      return INITIAL_AERODROMES;
    }
  });

  const [activeRouteId, setActiveRouteId] = useState<string>(() => {
    const savedId = localStorage.getItem('copiloto_active_route_id');
    if (savedId) return savedId;
    const savedRoutes = localStorage.getItem('copiloto_routes');
    const parsedRoutes = savedRoutes ? JSON.parse(savedRoutes) : INITIAL_FLIGHT_PLANS;
    return parsedRoutes[0]?.id || '';
  });

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('copiloto_checklists', JSON.stringify(checklists));
  }, [checklists]);
  useEffect(() => {
    localStorage.setItem('copiloto_routes', JSON.stringify(routes));
  }, [routes]);
  useEffect(() => {
    localStorage.setItem('copiloto_aerodromes', JSON.stringify(aerodromes));
  }, [aerodromes]);
  useEffect(() => {
    localStorage.setItem('copiloto_active_route_id', activeRouteId);
  }, [activeRouteId]);

  // --- UI State ---
  const [appState, setAppState] = useState<AppState>('idle');
  const [logs, setLogs] = useState<VoiceLog[]>([]);
  const [activeChecklist, setActiveChecklist] = useState<Checklist | null>(null);
  const [checklistIndex, setChecklistIndex] = useState(-1);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecognitionEnabled, setIsRecognitionEnabled] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);

  // --- Editing State ---
  const [editingChecklist, setEditingChecklist] = useState<Checklist | null>(null);
  const [editingWaypoint, setEditingWaypoint] = useState<Waypoint | null>(null);
  const [editingAerodrome, setEditingAerodrome] = useState<Aerodrome | null>(null);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);
  const [isAddingChecklist, setIsAddingChecklist] = useState(false);
  const [isAddingAerodrome, setIsAddingAerodrome] = useState(false);
  const [isAddingRoute, setIsAddingRoute] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(window.speechSynthesis);
  const lastSpokenRef = useRef<string>("");
  const logsEndRef = useRef<HTMLDivElement>(null);

  const activeRoute = routes.find(r => r.id === activeRouteId) || routes[0];

  // --- Refs for state access in callbacks ---
  const stateRef = useRef({ appState, activeChecklist, checklistIndex, checklists, routes, activeRouteId, aerodromes });
  useEffect(() => {
    stateRef.current = { appState, activeChecklist, checklistIndex, checklists, routes, activeRouteId, aerodromes };
  }, [appState, activeChecklist, checklistIndex, checklists, routes, activeRouteId, aerodromes]);

  // --- Speech Synthesis ---
  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!synthesisRef.current) return;
    lastSpokenRef.current = text;
    synthesisRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      if (onEnd) onEnd();
    };
    synthesisRef.current.speak(utterance);
  }, []);

  const addLog = useCallback((text: string, type: 'user' | 'system') => {
    setLogs(prev => [
      ...prev,
      { id: Math.random().toString(36).substr(2, 9), text, type, timestamp: new Date() }
    ]);
  }, []);

  // --- Command Logic ---
  const processActualCommand = useCallback((cmd: string, currentAppState: AppState, currentActiveChecklist: Checklist | null, currentChecklistIndex: number) => {
    const { checklists: currentChecklists, routes: currentRoutes, activeRouteId: currentActiveRouteId, aerodromes: currentAerodromes } = stateRef.current;
    const currentRoute = currentRoutes.find(r => r.id === currentActiveRouteId) || currentRoutes[0];

    // 2. Checklist Commands
    if (cmd.includes('leer checklist') || cmd.includes('checklist')) {
      let target: Checklist | null = null;
      const checklistKeys = Object.keys(currentChecklists);
      for (const key of checklistKeys) {
        if (cmd.includes(currentChecklists[key].name.toLowerCase())) {
          target = currentChecklists[key];
          break;
        }
      }

      if (target) {
        setActiveChecklist(target);
        setChecklistIndex(0);
        setAppState('checklist');
        const firstItem = target.items[0].text;
        speak(`Iniciando checklist ${target.name}. Primer punto: ${firstItem}`);
        addLog(`Iniciando checklist ${target.name}. Primer punto: ${firstItem}`, 'system');
      } else {
        speak('No he reconocido esa checklist. Las opciones son: ' + Object.values(currentChecklists).map((c: Checklist) => c.name).join(', '));
      }
      return;
    }

    // 3. Checklist Progression
    if (currentAppState === 'checklist' && currentActiveChecklist) {
      if (cmd.includes('check') || cmd.includes('hecho') || cmd.includes('siguiente')) {
        const nextIndex = currentChecklistIndex + 1;
        if (nextIndex < currentActiveChecklist.items.length) {
          setChecklistIndex(nextIndex);
          const nextItem = currentActiveChecklist.items[nextIndex].text;
          speak(nextItem);
          addLog(nextItem, 'system');
        } else {
          speak(`Checklist ${currentActiveChecklist.name} completada.`);
          addLog(`Checklist ${currentActiveChecklist.name} completada.`, 'system');
          setAppState('idle');
          setActiveChecklist(null);
          setChecklistIndex(-1);
        }
        return;
      }

      if (cmd.includes('reiniciar') || cmd.includes('empezar de nuevo')) {
        setChecklistIndex(0);
        const firstItem = currentActiveChecklist.items[0].text;
        speak(`Reiniciando checklist. Primer punto: ${firstItem}`);
        addLog(`Reiniciando checklist ${currentActiveChecklist.name}. Primer punto: ${firstItem}`, 'system');
        return;
      }
    }

    // 4. Flight Plan / Aerodrome Info
    if (cmd.includes('plan de vuelo') || cmd.includes('waypoint') || cmd.includes('ruta')) {
      // 4a. Select Flight Plan by Name
      if (cmd.includes('cargar') || cmd.includes('seleccionar') || cmd.includes('activar')) {
        const targetPlan = currentRoutes.find(r => cmd.includes(r.name.toLowerCase()));
        if (targetPlan) {
          setActiveRouteId(targetPlan.id);
          const response = `Plan de vuelo ${targetPlan.name} cargado. Tiene ${targetPlan.waypoints.length} waypoints.`;
          speak(response);
          addLog(response, 'system');
          return;
        }
      }

      // 4b. Check if user is asking for a specific waypoint by name or number
      let targetWp: Waypoint | undefined;
      
      // Try matching by number (e.g., "waypoint 1")
      const numMatch = cmd.match(/waypoint\s*(\d+)/i) || cmd.match(/punto\s*(\d+)/i);
      if (numMatch) {
        const index = parseInt(numMatch[1]) - 1;
        if (index >= 0 && index < currentRoute.waypoints.length) {
          targetWp = currentRoute.waypoints[index];
        }
      }

      // Try matching by name if not found by number
      if (!targetWp) {
        targetWp = currentRoute.waypoints.find(wp => cmd.includes(wp.name.toLowerCase()));
      }
      
      if (targetWp) {
        const response = `Waypoint ${targetWp.name}. Rumbo ${targetWp.heading} grados, Altitud ${targetWp.altitude}, Techo ${targetWp.ceiling}. Notas: ${targetWp.notes}`;
        speak(response);
        addLog(response, 'system');
      } else {
        const info = currentRoute.waypoints.map((wp, i) => `${i + 1}: ${wp.name}`).join(', ');
        speak(`El plan ${currentRoute.name} tiene: ${info}. ¿De cuál quieres detalles?`);
        addLog(`Plan ${currentRoute.name}: ${info}`, 'system');
      }
      return;
    }

    if (cmd.includes('aeródromo') || cmd.includes('aerodromo') || cmd.includes('pistas')) {
      // Normalize command for better matching
      const normalizedCmd = cmd.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      
      // Find the aerodrome mentioned in the command
      const targetAero = currentAerodromes.find(a => {
        const nameNorm = a.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const codeNorm = a.code.toLowerCase();
        return normalizedCmd.includes(nameNorm) || normalizedCmd.includes(codeNorm);
      });
      
      const aero = targetAero || currentAerodromes[0];
      
      const codeSpelled = spellAeronautical(aero.code);
      const runwaysSpelled = readRunways(aero.runways);
      const freqsSpelled = (aero.frequencies || []).map(f => readFrequency(f)).join(' y ');
      const response = `Aeródromo ${aero.name}, código ${codeSpelled}. Elevación ${aero.elevation || 'no especificada'}. ${runwaysSpelled}. Frecuencias ${freqsSpelled}. ${aero.observations}`;
      speak(response);
      addLog(response, 'system');
      return;
    }

    // 5. Help
    if (cmd.includes('opciones') || cmd.includes('ayuda')) {
      const help = "Puedes decir: Leer checklist, datos de aeródromo, plan de vuelo, repetir o cancelar.";
      speak(help);
      addLog(help, 'system');
      return;
    }

    // 6. Cancel
    if (cmd.includes('cancelar') || cmd.includes('parar')) {
      speak('Operación cancelada');
      setAppState('idle');
      setActiveChecklist(null);
      setChecklistIndex(-1);
      return;
    }

    // 7. Repeat
    if (cmd.includes('repetir') || cmd.includes('repite')) {
      if (lastSpokenRef.current) {
        speak(lastSpokenRef.current);
        addLog(`Repitiendo: ${lastSpokenRef.current}`, 'system');
      } else {
        speak('No hay nada que repetir.');
      }
      return;
    }
  }, [speak, addLog]);

  const handleCommand = useCallback((command: string) => {
    const { appState: currentAppState, activeChecklist: currentActiveChecklist, checklistIndex: currentChecklistIndex } = stateRef.current;
    const cmd = command.toLowerCase().trim();
    addLog(command, 'user');

    if (cmd.includes('copiloto')) {
      const commandAfterWakeWord = cmd.split('copiloto')[1]?.trim();
      if (currentAppState === 'idle') {
        setAppState('listening');
        if (!commandAfterWakeWord) {
          speak('Copiloto a la escucha');
          addLog('Copiloto a la escucha', 'system');
          return;
        }
      }
      if (commandAfterWakeWord) {
        processActualCommand(commandAfterWakeWord, currentAppState, currentActiveChecklist, currentChecklistIndex);
        return;
      }
    }

    if (currentAppState !== 'idle') {
      processActualCommand(cmd, currentAppState, currentActiveChecklist, currentChecklistIndex);
    }
  }, [speak, addLog, processActualCommand]);

  // --- Speech Recognition Setup ---
  const startRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicError("Navegador no compatible");
      return;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'es-ES';
    recognition.onstart = () => { setMicError(null); };
    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      handleCommand(transcript);
    };
    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') setMicError("Permiso denegado");
      else if (event.error === 'network') setMicError("Error de red");
      else setMicError(`Error: ${event.error}`);
    };
    recognition.onend = () => {
      setTimeout(() => {
        try { recognition.start(); } catch (e) {}
      }, 300);
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      setMicError("Fallo al iniciar");
    }
  }, [handleCommand]);

  useEffect(() => {
    if (isRecognitionEnabled) startRecognition();
    else if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    };
  }, [startRecognition, isRecognitionEnabled]);

  const toggleRecognition = () => {
    const newState = !isRecognitionEnabled;
    setIsRecognitionEnabled(newState);
    if (newState) {
      speak('Sistema de escucha activado');
      addLog('Sistema de escucha activado', 'system');
    } else {
      speak('Sistema de escucha desactivado');
      addLog('Sistema de escucha desactivado', 'system');
      setAppState('idle');
    }
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // --- Editing Handlers ---
  const saveChecklist = (checklist: Checklist) => {
    if (isAddingChecklist) {
      const id = Math.random().toString(36).substr(2, 9);
      setChecklists(prev => ({ ...prev, [id]: { ...checklist, id } }));
      setIsAddingChecklist(false);
    } else {
      setChecklists(prev => ({ ...prev, [checklist.id]: checklist }));
    }
    setEditingChecklist(null);
  };

  const saveWaypoint = (wp: Waypoint) => {
    if (isAddingWaypoint) {
      const newWp = { ...wp, id: Math.random().toString(36).substr(2, 9) };
      setRoutes(prev => prev.map(r => r.id === activeRouteId ? { ...r, waypoints: [...r.waypoints, newWp] } : r));
      setIsAddingWaypoint(false);
    } else {
      setRoutes(prev => prev.map(r => r.id === activeRouteId ? {
        ...r,
        waypoints: r.waypoints.map(item => item.id === wp.id ? wp : item)
      } : r));
    }
    setEditingWaypoint(null);
  };

  const saveAerodrome = (aero: Aerodrome) => {
    if (isAddingAerodrome) {
      const newAero = { ...aero, id: Math.random().toString(36).substr(2, 9) };
      setAerodromes(prev => [...prev, newAero]);
      setIsAddingAerodrome(false);
    } else {
      setAerodromes(prev => prev.map(item => item.id === aero.id ? aero : item));
    }
    setEditingAerodrome(null);
  };

  const deleteWaypoint = (id: string) => {
    setRoutes(prev => prev.map(r => r.id === activeRouteId ? {
      ...r,
      waypoints: r.waypoints.filter(wp => wp.id !== id)
    } : r));
  };

  const deleteRoute = (id: string) => {
    if (routes.length <= 1) return;
    setRoutes(prev => {
      const filtered = prev.filter(r => r.id !== id);
      if (activeRouteId === id) {
        setActiveRouteId(filtered[0].id);
      }
      return filtered;
    });
  };

  const deleteAerodrome = (id: string) => {
    if (aerodromes.length <= 1) return;
    setAerodromes(prev => prev.filter(a => a.id !== id));
  };

  const deleteChecklist = (id: string) => {
    setChecklists(prev => {
      const newCls = { ...prev };
      delete newCls[id];
      return newCls;
    });
  };

  const saveRoute = (routeData: Route) => {
    if (isAddingRoute) {
      const newRoute = { 
        ...routeData, 
        id: Math.random().toString(36).substr(2, 9), 
        waypoints: routeData.waypoints || [] 
      };
      setRoutes(prev => [...(prev || []), newRoute]);
      setActiveRouteId(newRoute.id);
      setIsAddingRoute(false);
    } else {
      setRoutes(prev => (prev || []).map(r => r.id === routeData.id ? routeData : r));
    }
    setEditingRoute(null);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0] font-mono selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-white/10 p-4 flex justify-between items-center bg-black/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <Plane className="text-emerald-400 w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest uppercase">Copiloto V1.1</h1>
            <div className="flex items-center gap-2 text-[10px] text-emerald-400/70">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              SISTEMA ACTIVO - MODO LOCAL
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowHelp(true)}
            className="p-2 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-colors"
            title="Guía de Comandos"
          >
            <Info className="w-5 h-5" />
          </button>
          {micError && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/50 text-red-400 text-[10px] font-bold uppercase animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              {micError}
              <button onClick={startRecognition} className="ml-2 underline hover:text-white">Reintentar</button>
            </div>
          )}
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${!isRecognitionEnabled ? 'bg-red-500/10 border-red-500/30 text-red-400' : appState === 'listening' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-white/5 border-white/10 text-white/40'}`}>
            {!isRecognitionEnabled ? <MicOff className="w-4 h-4" /> : appState === 'listening' ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            <span className="text-xs font-bold uppercase tracking-tighter">
              {!isRecognitionEnabled ? 'Desactivado' : appState === 'listening' ? 'Escuchando' : 'En espera'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6 pb-24">
        
        {/* Main Dashboard - 3 Sections */}
        <div className="lg:col-span-8 space-y-6">
          <AnimatePresence mode="wait">
            {appState === 'checklist' && activeChecklist ? (
              <motion.div 
                key="checklist-view"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#141414] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
              >
                <div className="bg-emerald-500/10 p-4 border-b border-white/10 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="text-emerald-400 w-5 h-5" />
                    <h2 className="font-bold uppercase tracking-wider text-sm">Checklist: {activeChecklist.name}</h2>
                  </div>
                  <button onClick={() => { setAppState('idle'); setActiveChecklist(null); }} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                  {activeChecklist.items.map((item, idx) => (
                    <div key={item.id} className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${idx === checklistIndex ? 'bg-emerald-500/10 border-emerald-500/50 scale-[1.02]' : idx < checklistIndex ? 'opacity-40' : 'opacity-100 border-white/5'}`}>
                      <div className={`mt-1 w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 ${idx <= checklistIndex ? 'bg-emerald-500 border-emerald-500 text-black' : 'border-white/20'}`}>
                        {idx < checklistIndex ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                      </div>
                      <p className="text-lg leading-tight">{item.text}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Checklists Area */}
                <section className="bg-[#141414] border border-white/10 rounded-2xl overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <h2 className="text-xs font-bold uppercase tracking-widest">Checklists</h2>
                    </div>
                    <button onClick={() => { setEditingChecklist({ id: '', name: '', items: [] }); setIsAddingChecklist(true); }} className="p-1 hover:bg-white/10 rounded text-emerald-400"><Plus className="w-4 h-4" /></button>
                  </div>
                  <div className="p-4 space-y-2 flex-1">
                    {Object.values(checklists).map((cl: Checklist) => (
                      <div key={cl.id} className="group flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-all">
                        <span className="text-sm font-medium">{cl.name}</span>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingChecklist(cl); setIsAddingChecklist(false); }} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-emerald-400"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => deleteChecklist(cl.id)} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Flight Plan Area */}
                <section className="bg-[#141414] border border-white/10 rounded-2xl overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-blue-400">
                      <MapPin className="w-4 h-4" />
                      <h2 className="text-xs font-bold uppercase tracking-widest">Planes de Vuelo</h2>
                    </div>
                    <button onClick={() => { setEditingRoute({ id: '', name: '', waypoints: [] }); setIsAddingRoute(true); }} className="p-1 hover:bg-white/10 rounded text-blue-400"><Plus className="w-4 h-4" /></button>
                  </div>
                  
                  <div className="p-4 space-y-2 max-h-48 overflow-y-auto border-b border-white/10">
                    {routes.map(r => (
                      <div 
                        key={r.id} 
                        onClick={() => setActiveRouteId(r.id)}
                        className={`group flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${activeRouteId === r.id ? 'bg-blue-500/20 border-blue-500/50' : 'bg-white/5 border-white/5 hover:border-blue-500/30'}`}
                      >
                        <div className="flex flex-col">
                          <span className={`text-xs font-bold ${activeRouteId === r.id ? 'text-blue-400' : 'text-white/70'}`}>{r.name}</span>
                          <span className="text-[8px] text-white/30 uppercase">{r.waypoints.length} puntos</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const duplicated = { ...r, id: Math.random().toString(36).substr(2, 9), name: `${r.name} (Copia)` };
                              setRoutes(prev => [...prev, duplicated]);
                              setActiveRouteId(duplicated.id);
                            }} 
                            className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-blue-400"
                            title="Duplicar"
                          >
                            <History className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingRoute(r);
                              setIsAddingRoute(false);
                            }} 
                            className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-blue-400"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRoute(r.id);
                            }} 
                            className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-blue-500/5 flex-1 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-white/40 uppercase">Waypoints de:</span>
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-tighter">{activeRoute.name}</span>
                      </div>
                      <button onClick={() => { setEditingWaypoint({ id: '', name: '', lugar: '', heading: '', altitude: '', ceiling: '', notes: '' }); setIsAddingWaypoint(true); }} className="p-2 bg-blue-500/20 hover:bg-blue-500/40 rounded-lg text-blue-400 transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                      {activeRoute.waypoints.map((wp, idx) => (
                        <div key={wp.id} className="group flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:border-blue-500/30 transition-all">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-blue-400/50 w-4">{idx + 1}</span>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{wp.name}</span>
                              <span className="text-[10px] text-white/40">{wp.lugar} | {wp.heading}° | {wp.altitude}</span>
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingWaypoint(wp); setIsAddingWaypoint(false); }} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-blue-400"><Edit3 className="w-4 h-4" /></button>
                            <button onClick={() => deleteWaypoint(wp.id)} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      ))}
                      {activeRoute.waypoints.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-white/20 py-8">
                          <MapPin className="w-8 h-8 mb-2 opacity-20" />
                          <p className="text-[10px] uppercase tracking-widest">Sin waypoints</p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Aerodromes Area */}
                <section className="bg-[#141414] border border-white/10 rounded-2xl overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-amber-400">
                      <Radio className="w-4 h-4" />
                      <h2 className="text-xs font-bold uppercase tracking-widest">Aeródromos</h2>
                    </div>
                    <button onClick={() => { setEditingAerodrome({ id: '', code: '', name: '', elevation: '', runways: [{ id: Date.now().toString(), number: '', circuit: '', length: '', slope: '', material: '' }], frequencies: [], observations: '' }); setIsAddingAerodrome(true); }} className="p-1 hover:bg-white/10 rounded text-amber-400"><Plus className="w-4 h-4" /></button>
                  </div>
                  <div className="p-4 space-y-2 flex-1">
                    {aerodromes.map(aero => (
                      <div key={aero.id} className="group flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:border-amber-500/30 transition-all">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{aero.name}</span>
                          <div className="flex gap-2">
                            <span className="text-[10px] text-white/40">{(aero.frequencies || []).join(', ')} MHz</span>
                            {aero.elevation && <span className="text-[10px] text-amber-400/60">ALT: {aero.elevation}</span>}
                          </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingAerodrome(aero); setIsAddingAerodrome(false); }} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-amber-400"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => deleteAerodrome(aero.id)} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Voice Logs */}
        <div className="lg:col-span-4 flex flex-col h-[calc(100vh-140px)]">
          <div className="bg-[#141414] border border-white/10 rounded-2xl flex-1 flex flex-col overflow-hidden shadow-xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-white/40" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Registro de Voz</span>
              </div>
              {isSpeaking && (
                <div className="flex gap-1">
                  {[1, 2, 3].map(i => (
                    <motion.div key={i} animate={{ height: [4, 12, 4] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }} className="w-1 bg-emerald-400 rounded-full" />
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {logs.map(log => (
                <div key={log.id} className={`flex flex-col ${log.type === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${log.type === 'user' ? 'bg-white/10 text-white rounded-tr-none' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-tl-none'}`}>
                    {log.text}
                  </div>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </main>

      {/* Modals for Editing */}
      <AnimatePresence>
        {editingChecklist && (
          <Modal title={isAddingChecklist ? "Nueva Checklist" : `Editar Checklist: ${editingChecklist.name}`} onClose={() => setEditingChecklist(null)}>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-white/40 uppercase">Nombre</label>
                <input 
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2 mt-1" 
                  value={editingChecklist.name} 
                  onChange={e => setEditingChecklist({...editingChecklist, name: e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-white/40 uppercase">Puntos de Chequeo</label>
                {editingChecklist.items.map((item, idx) => (
                  <div key={item.id} className="flex gap-2 items-center">
                    <div className="flex flex-col gap-1">
                      <button 
                        disabled={idx === 0}
                        onClick={() => {
                          const newItems = [...editingChecklist.items];
                          [newItems[idx], newItems[idx - 1]] = [newItems[idx - 1], newItems[idx]];
                          setEditingChecklist({ ...editingChecklist, items: newItems });
                        }}
                        className="p-1 hover:bg-white/10 rounded disabled:opacity-20"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button 
                        disabled={idx === editingChecklist.items.length - 1}
                        onClick={() => {
                          const newItems = [...editingChecklist.items];
                          [newItems[idx], newItems[idx + 1]] = [newItems[idx + 1], newItems[idx]];
                          setEditingChecklist({ ...editingChecklist, items: newItems });
                        }}
                        className="p-1 hover:bg-white/10 rounded disabled:opacity-20"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                    <input 
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg p-2 text-sm" 
                      value={item.text} 
                      onChange={(e) => {
                        const newItems = [...editingChecklist.items];
                        newItems[idx].text = e.target.value;
                        setEditingChecklist({ ...editingChecklist, items: newItems });
                      }}
                    />
                    <button onClick={() => {
                      const newItems = editingChecklist.items.filter((_, i) => i !== idx);
                      setEditingChecklist({ ...editingChecklist, items: newItems });
                    }} className="text-red-400 p-2"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => setEditingChecklist({ ...editingChecklist, items: [...editingChecklist.items, { id: Date.now().toString(), text: '' }] })} className="w-full py-2 border border-dashed border-white/20 rounded-lg text-xs text-white/40 hover:text-white hover:border-white/40">+ Añadir Punto</button>
              <button onClick={() => saveChecklist(editingChecklist)} className="w-full py-3 bg-emerald-500 text-black font-bold rounded-xl flex items-center justify-center gap-2"><Save className="w-4 h-4" /> {isAddingChecklist ? 'Crear' : 'Guardar'}</button>
            </div>
          </Modal>
        )}

        {editingWaypoint && (
          <Modal title={isAddingWaypoint ? "Añadir Waypoint" : "Editar Waypoint"} onClose={() => setEditingWaypoint(null)}>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="text-[10px] text-white/40 uppercase">Nombre</label><input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 mt-1" value={editingWaypoint.name} onChange={e => setEditingWaypoint({...editingWaypoint, name: e.target.value})} /></div>
              <div className="col-span-2"><label className="text-[10px] text-white/40 uppercase">Lugar</label><input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 mt-1" value={editingWaypoint.lugar} onChange={e => setEditingWaypoint({...editingWaypoint, lugar: e.target.value})} /></div>
              <div><label className="text-[10px] text-white/40 uppercase">Rumbo</label><input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 mt-1" value={editingWaypoint.heading} onChange={e => setEditingWaypoint({...editingWaypoint, heading: e.target.value})} /></div>
              <div><label className="text-[10px] text-white/40 uppercase">Altitud</label><input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 mt-1" value={editingWaypoint.altitude} onChange={e => setEditingWaypoint({...editingWaypoint, altitude: e.target.value})} /></div>
              <div><label className="text-[10px] text-white/40 uppercase">Techo</label><input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 mt-1" value={editingWaypoint.ceiling} onChange={e => setEditingWaypoint({...editingWaypoint, ceiling: e.target.value})} /></div>
              <div className="col-span-2"><label className="text-[10px] text-white/40 uppercase">Notas</label><textarea className="w-full bg-white/5 border border-white/10 rounded-lg p-2 mt-1" value={editingWaypoint.notes} onChange={e => setEditingWaypoint({...editingWaypoint, notes: e.target.value})} /></div>
              <button onClick={() => saveWaypoint(editingWaypoint)} className="col-span-2 py-3 bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-2"><Save className="w-4 h-4" /> {isAddingWaypoint ? 'Añadir' : 'Guardar'}</button>
            </div>
          </Modal>
        )}

        {editingAerodrome && (
          <Modal title={isAddingAerodrome ? "Nuevo Aeródromo" : `Editar Aeródromo: ${editingAerodrome.name}`} onClose={() => setEditingAerodrome(null)}>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1"><label className="text-[10px] text-white/40 uppercase">Código</label><input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 mt-1 text-sm" value={editingAerodrome.code} onChange={e => setEditingAerodrome({...editingAerodrome, code: e.target.value})} /></div>
                <div className="col-span-1"><label className="text-[10px] text-white/40 uppercase">Nombre</label><input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 mt-1 text-sm" value={editingAerodrome.name} onChange={e => setEditingAerodrome({...editingAerodrome, name: e.target.value})} /></div>
                <div className="col-span-1"><label className="text-[10px] text-white/40 uppercase">Elevación</label><input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 mt-1 text-sm" placeholder="Ej: 2000 ft" value={editingAerodrome.elevation} onChange={e => setEditingAerodrome({...editingAerodrome, elevation: e.target.value})} /></div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-white/40 uppercase">Frecuencias</label>
                {(editingAerodrome.frequencies || []).map((freq, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input 
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg p-2 text-sm" 
                      value={freq} 
                      onChange={(e) => {
                        const newFreqs = [...(editingAerodrome.frequencies || [])];
                        newFreqs[idx] = e.target.value;
                        setEditingAerodrome({ ...editingAerodrome, frequencies: newFreqs });
                      }}
                    />
                    <button onClick={() => {
                      const newFreqs = (editingAerodrome.frequencies || []).filter((_, i) => i !== idx);
                      setEditingAerodrome({ ...editingAerodrome, frequencies: newFreqs });
                    }} className="text-red-400 p-2"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                <button onClick={() => setEditingAerodrome({ ...editingAerodrome, frequencies: [...(editingAerodrome.frequencies || []), ''] })} className="w-full py-2 border border-dashed border-white/20 rounded-lg text-[10px] text-white/40 hover:text-white hover:border-white/40">+ Añadir Frecuencia</button>
              </div>
              
              <div className="space-y-4">
                <label className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Pistas y Circuitos</label>
                {editingAerodrome.runways.map((runway, idx) => (
                  <div key={runway.id} className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-3 relative group/runway">
                    <button 
                      onClick={() => {
                        const newRunways = editingAerodrome.runways.filter((_, i) => i !== idx);
                        setEditingAerodrome({ ...editingAerodrome, runways: newRunways });
                      }} 
                      className="absolute top-2 right-2 text-red-400/40 hover:text-red-400 p-1 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[8px] text-white/20 uppercase">Pista</label>
                        <input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs" placeholder="Ej: 08" value={runway.number} onChange={e => {
                          const newRunways = [...editingAerodrome.runways];
                          newRunways[idx].number = e.target.value;
                          setEditingAerodrome({...editingAerodrome, runways: newRunways});
                        }} />
                      </div>
                      <div>
                        <label className="text-[8px] text-white/20 uppercase">Circuito</label>
                        <select 
                          className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs outline-none" 
                          value={runway.circuit} 
                          onChange={e => {
                            const newRunways = [...editingAerodrome.runways];
                            newRunways[idx].circuit = e.target.value;
                            setEditingAerodrome({...editingAerodrome, runways: newRunways});
                          }}
                        >
                          <option value="" className="bg-[#141414]">Seleccionar</option>
                          <option value="Izquierda" className="bg-[#141414]">Izquierda</option>
                          <option value="Derecha" className="bg-[#141414]">Derecha</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[8px] text-white/20 uppercase">Longitud</label>
                        <input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-[10px]" placeholder="Ej: 900m" value={runway.length} onChange={e => {
                          const newRunways = [...editingAerodrome.runways];
                          newRunways[idx].length = e.target.value;
                          setEditingAerodrome({...editingAerodrome, runways: newRunways});
                        }} />
                      </div>
                      <div>
                        <label className="text-[8px] text-white/20 uppercase">Superficie</label>
                        <input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-[10px]" placeholder="Asfalto/Tierra" value={runway.material} onChange={e => {
                          const newRunways = [...editingAerodrome.runways];
                          newRunways[idx].material = e.target.value;
                          setEditingAerodrome({...editingAerodrome, runways: newRunways});
                        }} />
                      </div>
                      <div>
                        <label className="text-[8px] text-white/20 uppercase">Inclinación</label>
                        <input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-[10px]" placeholder="Ej: 1%" value={runway.slope} onChange={e => {
                          const newRunways = [...editingAerodrome.runways];
                          newRunways[idx].slope = e.target.value;
                          setEditingAerodrome({...editingAerodrome, runways: newRunways});
                        }} />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => setEditingAerodrome({ ...editingAerodrome, runways: [...editingAerodrome.runways, { id: Date.now().toString(), number: '', circuit: '', length: '', slope: '', material: '' }] })} className="w-full py-2 border border-dashed border-white/20 rounded-lg text-[10px] text-white/40 hover:text-white hover:border-white/40 transition-all">+ Añadir Pista</button>
              </div>

              <div><label className="text-[10px] text-white/40 uppercase">Observaciones</label><textarea className="w-full bg-white/5 border border-white/10 rounded-lg p-2 mt-1" value={editingAerodrome.observations} onChange={e => setEditingAerodrome({...editingAerodrome, observations: e.target.value})} /></div>
              <button onClick={() => saveAerodrome(editingAerodrome)} className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl flex items-center justify-center gap-2"><Save className="w-4 h-4" /> {isAddingAerodrome ? 'Crear' : 'Guardar'}</button>
            </div>
          </Modal>
        )}

        {editingRoute && (
          <Modal title={isAddingRoute ? "Nuevo Plan de Vuelo" : "Editar Plan de Vuelo"} onClose={() => setEditingRoute(null)}>
            <div className="space-y-4">
              <div><label className="text-[10px] text-white/40 uppercase">Nombre del Plan</label><input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 mt-1" value={editingRoute.name} onChange={e => setEditingRoute({...editingRoute, name: e.target.value})} /></div>
              <button onClick={() => saveRoute(editingRoute)} className="w-full py-3 bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-2"><Save className="w-4 h-4" /> {isAddingRoute ? 'Crear' : 'Guardar'}</button>
            </div>
          </Modal>
        )}

        {showHelp && (
          <Modal title="Guía de Comandos de Voz" onClose={() => setShowHelp(null)}>
            <div className="space-y-6">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                <p className="text-xs text-emerald-400 font-bold uppercase mb-2">Activación</p>
                <p className="text-sm">Di <span className="text-white font-bold">"Copiloto"</span> seguido de tu orden, o espera a que responda <span className="italic">"Copiloto a la escucha"</span>.</p>
              </div>

              <div className="space-y-4">
                <section>
                  <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Checklists</h3>
                  <ul className="space-y-2 text-sm">
                    <li>• <span className="text-emerald-400">"Leer checklist [Nombre]"</span>: Inicia una lista.</li>
                    <li>• <span className="text-emerald-400">"Check / Hecho / Siguiente"</span>: Pasa al siguiente punto.</li>
                    <li>• <span className="text-emerald-400">"Reiniciar"</span>: Vuelve al primer punto.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Información de Vuelo</h3>
                  <ul className="space-y-2 text-sm">
                    <li>• <span className="text-blue-400">"Cargar plan [Nombre]"</span>: Cambia el plan activo.</li>
                    <li>• <span className="text-blue-400">"Plan de vuelo / Ruta"</span>: Resumen del plan activo.</li>
                    <li>• <span className="text-blue-400">"Detalles de waypoint [Número]"</span>: Info por orden.</li>
                    <li>• <span className="text-blue-400">"Detalles de [Nombre Waypoint]"</span>: Info específica.</li>
                    <li>• <span className="text-amber-400">"Aeródromo / Pistas"</span>: Datos del aeródromo.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Sistema</h3>
                  <ul className="space-y-2 text-sm">
                    <li>• <span className="text-white">"Repetir"</span>: Repite lo último que dijo el copiloto.</li>
                    <li>• <span className="text-white">"Ayuda / Opciones"</span>: Escucha los comandos.</li>
                    <li>• <span className="text-red-400">"Cancelar / Parar"</span>: Detiene la acción actual.</li>
                  </ul>
                </section>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Voice Control Button */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={toggleRecognition}
          className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl border-4 border-[#0A0A0A] transition-all ${!isRecognitionEnabled ? 'bg-red-500/20 text-red-400 border-red-500/30' : appState === 'listening' ? 'bg-emerald-500 text-black' : 'bg-[#141414] text-emerald-400'}`}
        >
          {!isRecognitionEnabled ? <MicOff className="w-8 h-8" /> : appState === 'listening' ? <div className="flex gap-1">{[1, 2, 3].map(i => <motion.div key={i} animate={{ scaleY: [1, 2, 1] }} transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.1 }} className="w-1 h-4 bg-black rounded-full" />)}</div> : <Mic className="w-8 h-8" />}
        </motion.button>
      </div>

      {appState === 'listening' && <div className="fixed inset-0 pointer-events-none border-[8px] border-emerald-500/20 animate-pulse z-50" />}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-[#1A1A1A] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
          <h2 className="text-sm font-bold uppercase tracking-widest">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 max-h-[70vh] overflow-y-auto">{children}</div>
      </motion.div>
    </div>
  );
}
