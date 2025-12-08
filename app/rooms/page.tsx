import React, { useEffect, useState, useMemo } from 'react';
import { PlusCircle, Trash2, ChevronDown, ChevronUp } from 'lucide-react'; // Using lucide-react for icons

// -----------------------------------------------------
// Data Structure and Constants
// -----------------------------------------------------

const STORAGE_KEY = 'mcs.rooms_config';

// Available room types for the dropdown
const ROOM_TYPES = [
  'Living Room',
  'Kitchen',
  'Bedroom',
  'Bathroom/WC',
  'Hallway',
  'Study/Office',
  'Utility Room',
  'Conservatory (Heated)',
  'Conservatory (Unheated)',
];

type Room = {
  id: string;
  name: string;
  type: string;
  ceiling: number; // m
  designTemp: number; // °C
  airChanges: number; // /hr
};

type Zone = {
  id: string;
  name: string;
  rooms: Room[];
};

const DEFAULT_ROOM: Omit<Room, 'id' | 'name'> = {
  type: 'Living Room',
  ceiling: 2.4,
  designTemp: 20,
  airChanges: 0.5,
};

const DEFAULT_ZONES: Zone[] = [{
  id: crypto.randomUUID(),
  name: 'Zone 1',
  rooms: [],
}];

/* ───────── storage helpers (using localStorage) ───────── */
const readConfig = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.length > 0 ? parsed : DEFAULT_ZONES;
  } catch {
    console.error("Error reading localStorage, using defaults.");
    return DEFAULT_ZONES;
  }
};

const writeConfig = (obj: Zone[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    console.error("Error writing localStorage");
  }
};

// -----------------------------------------------------
// UI Components & Shared Styles (Tailwind)
// -----------------------------------------------------

const btnPrimaryClasses = "flex items-center space-x-2 bg-gray-900 text-white px-4 py-2 rounded-xl shadow-lg hover:bg-gray-700 transition duration-150 cursor-pointer text-center font-medium text-sm md:text-base";
const btnSecondaryClasses = "flex items-center space-x-2 bg-white text-gray-900 px-4 py-2 rounded-xl border border-gray-300 shadow-md hover:bg-gray-50 transition duration-150 cursor-pointer text-center font-medium text-sm md:text-base";
const inputClasses = "w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm";


// -----------------------------------------------------
// Main Application Component
// -----------------------------------------------------

export default function App() {
  const [zones, setZones] = useState<Zone[]>(DEFAULT_ZONES);
  const [activeZoneId, setActiveZoneId] = useState<string>(DEFAULT_ZONES[0].id);
  const [newRoomName, setNewRoomName] = useState('');

  // Find the active zone
  const activeZone = useMemo(() => zones.find(z => z.id === activeZoneId), [zones, activeZoneId]);

  // Load state from localStorage on mount
  useEffect(() => {
    const saved = readConfig();
    if (saved && saved.length > 0) {
      setZones(saved);
      setActiveZoneId(saved[0].id);
    }
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    writeConfig(zones);
  }, [zones]);

  // --- Zone Handlers ---

  const addZone = () => {
    const newId = crypto.randomUUID();
    const newZone: Zone = {
      id: newId,
      name: `Zone ${zones.length + 1}`,
      rooms: [],
    };
    setZones(prev => [...prev, newZone]);
    setActiveZoneId(newId);
  };
  
  const removeZone = (zoneId: string) => {
    if (zones.length === 1) return; // Cannot delete the last zone

    setZones(prev => {
      const updatedZones = prev.filter(z => z.id !== zoneId);
      
      // If the active zone was deleted, switch to the first remaining zone
      if (activeZoneId === zoneId) {
        setActiveZoneId(updatedZones[0].id);
      }
      
      return updatedZones;
    });
  };

  // --- Room Handlers ---

  const addRoom = () => {
    if (!newRoomName.trim()) return;

    const newRoom: Room = {
      id: crypto.randomUUID(),
      name: newRoomName.trim(),
      ...DEFAULT_ROOM,
    };

    setZones(prev => prev.map(zone => {
      if (zone.id === activeZoneId) {
        return { ...zone, rooms: [...zone.rooms, newRoom] };
      }
      return zone;
    }));
    setNewRoomName(''); // Clear input after adding
  };

  const updateRoom = (roomId: string, field: keyof Room, value: string | number) => {
    setZones(prev => prev.map(zone => {
      if (zone.id === activeZoneId) {
        const updatedRooms = zone.rooms.map(room => {
          if (room.id === roomId) {
            return { ...room, [field]: value };
          }
          return room;
        });
        return { ...zone, rooms: updatedRooms };
      }
      return zone;
    }));
  };

  const removeRoom = (roomId: string) => {
    setZones(prev => prev.map(zone => {
      if (zone.id === activeZoneId) {
        const updatedRooms = zone.rooms.filter(room => room.id !== roomId);
        return { ...zone, rooms: updatedRooms };
      }
      return zone;
    }));
  };


  return (
    <main className="max-w-4xl mx-auto p-4 md:p-8 bg-white min-h-screen font-sans">
      
      {/* Header */}
      <h1 className="text-3xl font-extrabold mb-2 text-gray-900">Rooms</h1>
      <p className="text-sm text-gray-500 mb-6">
        Step 3 of 6 — List the rooms and ceiling heights for each zone of the property. Design temperature and air change rate are required for heat loss calculations.
      </p>

      {/* Zones Configuration Area */}
      <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-xl mb-6">
        
        {/* Zone Selector/Dropdown */}
        <div className="flex items-center space-x-3 mb-4">
          <select 
            value={activeZoneId} 
            onChange={(e) => setActiveZoneId(e.target.value)} 
            className="px-4 py-2 border border-gray-300 rounded-lg text-lg font-semibold bg-gray-50 shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            {zones.map(zone => (
              <option key={zone.id} value={zone.id}>{zone.name}</option>
            ))}
          </select>
          
          {/* Delete Zone Button (Hidden if only one zone) */}
          {zones.length > 1 && (
            <button 
                onClick={() => removeZone(activeZoneId)} 
                className="text-red-500 hover:text-red-700 p-2 rounded-full transition"
                aria-label="Delete current zone"
            >
                <Trash2 size={20} />
            </button>
          )}
        </div>

        {/* Room Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                <th className="py-3 pr-2 w-1/4">Room Name</th>
                <th className="py-3 px-2 w-1/5">Type</th>
                <th className="py-3 px-2">Ceiling (m)</th>
                <th className="py-3 px-2">Design Temp (°C)</th>
                <th className="py-3 px-2">Air Changes (/hr)</th>
                <th className="py-3 pl-2 w-12"></th> {/* Action column */}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeZone?.rooms.map(room => (
                <tr key={room.id} className="hover:bg-gray-50 transition duration-100">
                  
                  {/* Room Name */}
                  <td className="py-3 pr-2">
                    <input
                      type="text"
                      value={room.name}
                      onChange={(e) => updateRoom(room.id, 'name', e.target.value)}
                      className={inputClasses}
                    />
                  </td>
                  
                  {/* Type */}
                  <td className="py-3 px-2">
                    <select
                      value={room.type}
                      onChange={(e) => updateRoom(room.id, 'type', e.target.value)}
                      className={inputClasses}
                    >
                      {ROOM_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </td>
                  
                  {/* Ceiling (m) */}
                  <td className="py-3 px-2">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={room.ceiling}
                      onChange={(e) => updateRoom(room.id, 'ceiling', parseFloat(e.target.value) || 0)}
                      className={inputClasses + " text-right"}
                    />
                  </td>
                  
                  {/* Design Temp (°C) */}
                  <td className="py-3 px-2">
                    <input
                      type="number"
                      min={10}
                      max={30}
                      step={1}
                      value={room.designTemp}
                      onChange={(e) => updateRoom(room.id, 'designTemp', parseInt(e.target.value) || 10)}
                      className={inputClasses + " text-right"}
                    />
                  </td>
                  
                  {/* Air Changes (/hr) */}
                  <td className="py-3 px-2">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={room.airChanges}
                      onChange={(e) => updateRoom(room.id, 'airChanges', parseFloat(e.target.value) || 0)}
                      className={inputClasses + " text-right"}
                    />
                  </td>
                  
                  {/* Delete Button */}
                  <td className="py-3 pl-2 text-right">
                    <button 
                      onClick={() => removeRoom(room.id)} 
                      className="text-gray-400 hover:text-red-500 transition"
                      aria-label="Remove room"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              
              {/* Empty state row */}
              {activeZone?.rooms.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-500 italic">
                    No rooms in this zone yet. Add one below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      
        {/* Add Room Input and Button */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3 items-end border-t pt-4">
          <div className="flex-grow w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">New Room Name</label>
            <input
              type="text"
              placeholder="e.g., Master Bedroom, Dining Area"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addRoom(); }}
              className={inputClasses + " text-base"}
            />
          </div>
          <button onClick={addRoom} className="w-full sm:w-auto flex-shrink-0 bg-blue-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition">
            <PlusCircle size={20} className="mr-2" />
            Add Room
          </button>
        </div>
        
        {/* Add Zone Button */}
        <div className="mt-4">
          <button onClick={addZone} className="text-blue-600 font-medium hover:text-blue-800 transition flex items-center space-x-1">
            <PlusCircle size={18} />
            <span>Add New Zone ({zones.length + 1})</span>
          </button>
        </div>
      </section>


      {/* Navigation Footer */}
      <div className="flex justify-between sticky bottom-0 bg-white pt-4 pb-4 border-t border-gray-200 shadow-inner">
        <a href="/ventilation" className={btnSecondaryClasses}>
          ← Back: Ventilation
        </a>
        <a href="/building-elements" className={btnPrimaryClasses}>
          Next: Building Elements →
        </a>
      </div>
    </main>
  );
}
