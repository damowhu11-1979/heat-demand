'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Plus, X, Edit, Thermometer, Wind, Save, Ruler, LayoutGrid } from 'lucide-react';

// --- Room Design Constants derived from uploaded documents ---

const ROOM_TYPES = [
  'Bathroom', 'Bedroom', 'Bedroom with en-suite', 'Bedroom/study',
  'Breakfast room', 'Cloakroom/WC', 'Dining room', 'Dressing room',
  'Family/breakfast room', 'Games room', 'Hall', 'Internal room/corridor',
  'Kitchen', 'Landing', 'Lounge/sitting room', 'Living room',
  'Shower room', 'Store room', 'Study', 'Toilet', 'Utility room'
];

const DEFAULT_ZONES = ['Zone 1', 'Zone 2', 'Zone 3'];

// Design Temperature (°C) from design-conditions.pdf (Table 3.6)
const DESIGN_TEMPERATURES: Record<string, Record<string, number>> = {
  Bathroom: { 'A-J': 22, 'K-onwards': 22 },
  Bedroom: { 'A-J': 18, 'K-onwards': 21 },
  'Bedroom with en-suite': { 'A-J': 21, 'K-onwards': 21 },
  'Bedroom/study': { 'A-J': 21, 'K-onwards': 21 },
  'Breakfast room': { 'A-J': 21, 'K-onwards': 21 },
  'Cloakroom/WC': { 'A-J': 18, 'K-onwards': 21 },
  'Dining room': { 'A-J': 21, 'K-onwards': 21 },
  'Dressing room': { 'A-J': 18, 'K-onwards': 21 },
  'Family/breakfast room': { 'A-J': 21, 'K-onwards': 21 },
  'Games room': { 'A-J': 21, 'K-onwards': 21 },
  Hall: { 'A-J': 18, 'K-onwards': 21 },
  'Internal room/corridor': { 'A-J': 18, 'K-onwards': 21 },
  Kitchen: { 'A-J': 18, 'K-onwards': 21 },
  Landing: { 'A-J': 18, 'K-onwards': 21 },
  'Lounge/sitting room': { 'A-J': 21, 'K-onwards': 21 },
  'Living room': { 'A-J': 21, 'K-onwards': 21 },
  'Shower room': { 'A-J': 22, 'K-onwards': 22 },
  'Store room': { 'A-J': 18, 'K-onwards': 21 },
  Study: { 'A-J': 21, 'K-onwards': 21 },
  Toilet: { 'A-J': 18, 'K-onwards': 21 },
  'Utility room': { 'A-J': 18, 'K-onwards': 21 },
};

// Minimum ACH (1/h) from ventilation-rates.pdf (Table 3.8)
const MINIMUM_ACH: Record<string, Record<string, number>> = {
  Bathroom: { 'A-I': 3.0, J: 1.5, 'K-onwards': 0.5 },
  Bedroom: { 'A-I': 1.0, J: 1.0, 'K-onwards': 0.5 },
  'Bedroom with en-suite': { 'A-I': 2.0, J: 1.5, 'K-onwards': 1.0 },
  'Bedroom/study': { 'A-I': 1.5, J: 1.5, 'K-onwards': 0.5 },
  'Breakfast room': { 'A-I': 1.5, J: 1.0, 'K-onwards': 0.5 },
  'Cloakroom/WC': { 'A-I': 2.0, J: 1.5, 'K-onwards': 1.5 },
  'Dining room': { 'A-I': 1.5, J: 1.0, 'K-onwards': 0.5 },
  'Dressing room': { 'A-I': 1.5, J: 1.0, 'K-onwards': 0.5 },
  'Family/breakfast room': { 'A-I': 2.0, J: 1.5, 'K-onwards': 0.5 },
  'Games room': { 'A-I': 1.5, J: 1.0, 'K-onwards': 0.5 },
  Hall: { 'A-I': 2.0, J: 1.0, 'K-onwards': 0.5 },
  'Internal room/corridor': { 'A-I': 0.0, J: 0.0, 'K-onwards': 0.0 },
  Kitchen: { 'A-I': 2.0, J: 1.5, 'K-onwards': 0.5 },
  Landing: { 'A-I': 2.0, J: 1.0, 'K-onwards': 0.5 },
  'Lounge/sitting room': { 'A-I': 1.5, J: 1.0, 'K-onwards': 0.5 },
  'Living room': { 'A-I': 1.5, J: 1.0, 'K-onwards': 0.5 },
  'Shower room': { 'A-I': 3.0, J: 1.5, 'K-onwards': 0.5 },
  'Store room': { 'A-I': 1.0, J: 0.5, 'K-onwards': 0.5 },
  Study: { 'A-I': 1.5, J: 1.5, 'K-onwards': 0.5 },
  Toilet: { 'A-I': 3.0, J: 1.5, 'K-onwards': 1.5 },
  'Utility room': { 'A-I': 3.0, J: 2.0, 'K-onwards': 0.5 },
};

/** Helper to determine which design data set to use for Temperature. */
const getDesignConditionAgeBand = (ageBand: string) => {
  return ageBand === 'K-onwards' ? 'K-onwards' : 'A-J';
};

/** Helper to determine which ACH data set to use. */
const getACHAgeBand = (ageBand: string) => {
  if (ageBand.includes('K')) return 'K-onwards';
  if (ageBand.includes('J')) return 'J';
  return 'A-I';
};

/** Calculates the default design values for a given room type and age band. */
const getDesignValues = (roomType: string, ageBand: string) => {
  const tempBand = getDesignConditionAgeBand(ageBand);
  const achBand = getACHAgeBand(ageBand);

  const temp = DESIGN_TEMPERATURES[roomType]?.[tempBand] ?? 21;
  const ach = MINIMUM_ACH[roomType]?.[achBand] ?? 0.5;

  return { temp: parseFloat(String(temp)), ach: parseFloat(String(ach)) };
};

// Component for editing/displaying Temperature and ACH values
const RoomValueEditor = ({
  id,
  field,
  label,
  icon: Icon,
  unit,
  currentValue,
  designValue,
  isEditing,
  startEditing,
  stopEditing,
  handleChange,
  colorClass,
  step = 0.5,
}: {
  id: string | number;
  field: 'customTemp' | 'customAch';
  label: string;
  icon: any;
  unit: string;
  currentValue: number;
  designValue: number;
  isEditing: boolean;
  startEditing: (id: string | number, field: any) => void;
  stopEditing: () => void;
  handleChange: (id: string | number, field: any, value: string) => void;
  colorClass: string;
  step?: number;
}) => {
  const isCustom = currentValue !== designValue;
  const fieldName = field.includes('Temp') ? 'Temperature' : 'ACH';

  return (
    <div
      className={`flex items-center text-sm text-gray-700 px-3 py-1 rounded-full shadow-inner transition-colors duration-150 ${
        isCustom ? 'bg-yellow-100 border border-yellow-400' : 'bg-indigo-100'
      }`}
    >
      <Icon size={16} className={`${colorClass} mr-2`} />
      <span className="font-semibold mr-1">{label}:</span>

      {isEditing ? (
        <div className="flex items-center">
          <input
            type="number"
            step={step}
            min={field === 'customTemp' ? 10 : 0}
            inputMode="decimal"
            value={Number.isFinite(currentValue) ? currentValue : 0}
            onChange={(e) => handleChange(id, field, e.target.value)}
            onBlur={() => stopEditing()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') stopEditing();
            }}
            className="w-16 p-0.5 border-b border-indigo-500 text-center font-bold text-gray-900 bg-transparent focus:outline-none"
            autoFocus
          />
          <span className="ml-0.5 text-gray-700">{unit}</span>
          <button
            onClick={() => stopEditing()}
            className="ml-2 p-1 text-green-600 hover:text-green-800 transition duration-150 rounded-full"
            aria-label={`Save custom ${fieldName}`}
          >
            <Save size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center">
          <span className={`ml-0.5 font-bold ${isCustom ? 'text-yellow-700' : colorClass}`}>
            {unit === '°C' ? Math.round(currentValue) : currentValue.toFixed(1)}
          </span>
          <span className="ml-0.5 text-gray-700">{unit}</span>
          {isCustom && (
            <span className="ml-2 text-xs text-gray-500 italic" title={`Default: ${designValue}${unit}`}>
              (Custom)
            </span>
          )}
          <button
            onClick={() => startEditing(id, field)}
            className="ml-2 p-1 text-gray-400 hover:text-indigo-600 transition duration-150 rounded-full hover:bg-indigo-50"
            aria-label={`Edit custom ${fieldName}`}
          >
            <Edit size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

// Main Component
const RoomDesigner = () => {
  // State for all rooms in the project
  const [rooms, setRooms] = useState<
    Array<{
      id: string | number;
      type: string;
      name: string;
      zone: string;
      ceilingHeight: number;
      designTemp: number;
      customTemp: number;
      designAch: number;
      customAch: number;
    }>
  >([]);
  // State for the selected property age band
  const [ageBand, setAgeBand] = useState<'A-I' | 'J' | 'K-onwards'>('K-onwards');
  // State for heating zones
  const [zones, setZones] = useState<string[]>(DEFAULT_ZONES);
  const [newZoneName, setNewZoneName] = useState('');

  // State for editing:
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editingField, setEditingField] = useState<
    'name' | 'customTemp' | 'customAch' | 'ceilingHeight' | 'zone' | null
  >(null);

  // State for the room creation form inputs:
  const [selectedRoomType, setSelectedRoomType] = useState<string>(ROOM_TYPES[0]);
  const [selectedZone, setSelectedZone] = useState<string>(DEFAULT_ZONES[0]);
  const [newRoomCeilingHeight, setNewRoomCeilingHeight] = useState<number>(2.4); // m

  /** Refined naming logic to follow user's "multiple go up numerically" request */
  const getNextRoomNameRefined = useCallback(
    (type: string) => {
      const matchingRooms = rooms.filter((room) => room.type === type);
      let highestSuffix = 0;

      matchingRooms.forEach((room) => {
        const match = room.name.match(new RegExp(`${type}\\s*(\\d+)$`));
        if (match) {
          highestSuffix = Math.max(highestSuffix, parseInt(match[1], 10));
        } else if (room.name === type) {
          highestSuffix = Math.max(highestSuffix, 1);
        }
      });

      const nextSuffix = highestSuffix + 1;

      if (matchingRooms.length === 0) {
        return type;
      }

      let proposedName =
        nextSuffix === 1 && highestSuffix === 0 ? type : `${type} ${nextSuffix}`;

      let suffix = nextSuffix;
      while (rooms.some((room) => room.name === proposedName)) {
        suffix++;
        proposedName = `${type} ${suffix}`;
      }

      if (highestSuffix === 0 && proposedName === `${type} 1` && !rooms.some((r) => r.name === type)) {
        return type;
      }

      return proposedName;
    },
    [rooms]
  );

  /** Adds a new room with initial design values, zone, and ceiling height. */
  const addRoom = () => {
    const type = selectedRoomType;
    const newName = getNextRoomNameRefined(type);

    const { temp, ach } = getDesignValues(type, ageBand);

    const newRoom = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? (crypto as any).randomUUID()
          : `${Date.now()}-${Math.random()}`,
      type,
      name: newName,
      zone: selectedZone,
      ceilingHeight: newRoomCeilingHeight,
      designTemp: temp,
      customTemp: temp,
      designAch: ach,
      customAch: ach,
    };

    setRooms((prevRooms) => [...prevRooms, newRoom]);
  };

  /** Adds a new heating zone. */
  const addZone = () => {
    const trimmedName = newZoneName.trim();
    if (trimmedName && !zones.includes(trimmedName)) {
      // FIX: use prevZones, not prevRooms
      setZones((prevZones) => [...prevZones, trimmedName]);
      setSelectedZone(trimmedName);
      setNewZoneName('');
    }
  };

  /** Updates baseline design values for all rooms when the age band changes (keeps user's custom values). */
  useEffect(() => {
    setRooms((prevRooms) => {
      if (prevRooms.length === 0) return prevRooms;
      return prevRooms.map((room) => {
        const { temp, ach } = getDesignValues(room.type, ageBand);
        return {
          ...room,
          designTemp: temp,
          designAch: ach,
          // customTemp/customAch stay as-is
        };
      });
    });
  }, [ageBand]);

  const removeRoom = (id: string | number) => {
    setRooms((prevRooms) => prevRooms.filter((room) => room.id !== id));
  };

  const startEditing = (id: string | number, field: any) => {
    setEditingId(id);
    setEditingField(field);
  };

  const stopEditing = () => {
    setEditingId(null);
    setEditingField(null);
  };

  const handleStringChange = (id: string | number, field: 'name' | 'zone', value: string) => {
    setRooms((prevRooms) =>
      prevRooms.map((room) => (room.id === id ? { ...room, [field]: value } : room))
    );
  };

  const handleCustomValueChange = (id: string | number, field: 'customTemp' | 'customAch' | 'ceilingHeight', value: string) => {
    const numValue = parseFloat(value);
    setRooms((prevRooms) =>
      prevRooms.map((room) => {
        if (room.id !== id) return room;

        let newValue = numValue;

        if (!Number.isFinite(numValue) || value === '') {
          if (field === 'customTemp') newValue = room.designTemp;
          else if (field === 'customAch') newValue = room.designAch;
          else if (field === 'ceilingHeight') newValue = 2.4;
        }

        if (field === 'customAch' && newValue < 0) newValue = 0;
        if (field === 'ceilingHeight' && newValue < 1.8) newValue = 1.8;

        return { ...room, [field]: newValue };
      })
    );
  };

  // Component for editing/displaying Zone and Ceiling Height
  const RoomDetailEditor = ({ room }: { room: any }) => {
    const isCeilingEditing = editingId === room.id && editingField === 'ceilingHeight';
    const isZoneEditing = editingId === room.id && editingField === 'zone';

    return (
      <div className="flex items-center gap-4 text-sm text-gray-700 mt-2">
        {/* Ceiling Height Display/Editor */}
        <div className="flex items-center bg-gray-100 px-3 py-1 rounded-full shadow-inner">
          <Ruler size={16} className="text-purple-500 mr-2" />
          <span className="font-semibold mr-1">Ceiling:</span>
          {isCeilingEditing ? (
            <div className="flex items-center">
              <input
                type="number"
                step="0.1"
                min="1.8"
                inputMode="decimal"
                value={room.ceilingHeight}
                onChange={(e) => handleCustomValueChange(room.id, 'ceilingHeight', e.target.value)}
                onBlur={stopEditing}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') stopEditing();
                }}
                className="w-12 p-0.5 border-b border-indigo-500 text-center font-bold text-gray-900 bg-transparent focus:outline-none"
                autoFocus
              />
              <span className="ml-0.5 text-gray-700">m</span>
            </div>
          ) : (
            <div className="flex items-center">
              <span className="ml-0.5 font-bold text-gray-800">
                {room.ceilingHeight.toFixed(1)} m
              </span>
              <button
                onClick={() => startEditing(room.id, 'ceilingHeight')}
                className="ml-2 p-1 text-gray-400 hover:text-indigo-600 transition duration-150 rounded-full hover:bg-indigo-50"
                aria-label="Edit ceiling height"
              >
                <Edit size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Zone Display/Editor */}
        <div className="flex items-center bg-gray-100 px-3 py-1 rounded-full shadow-inner">
          <LayoutGrid size={16} className="text-green-600 mr-2" />
          <span className="font-semibold mr-1">Zone:</span>
          {isZoneEditing ? (
            <div className="flex items-center">
              <select
                value={room.zone}
                onChange={(e) => handleStringChange(room.id, 'zone', e.target.value)}
                onBlur={stopEditing}
                className="p-0.5 border-b border-indigo-500 text-center font-bold text-gray-900 bg-transparent focus:outline-none"
                autoFocus
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
              <button
                onClick={stopEditing}
                className="ml-2 p-1 text-green-600 hover:text-green-800 transition duration-150 rounded-full"
                aria-label="Save custom zone"
              >
                <Save size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center">
              <span className="ml-0.5 font-bold text-green-700">{room.zone}</span>
              <button
                onClick={() => startEditing(room.id, 'zone')}
                className="ml-2 p-1 text-gray-400 hover:text-indigo-600 transition duration-150 rounded-full hover:bg-indigo-50"
                aria-label="Edit room zone"
              >
                <Edit size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-8 bg-gray-50 min-h-screen font-sans">
      <h1 className="text-3xl font-bold text-gray-800 mb-6 border-b pb-2">Room Design Specification Tool</h1>

      {/* Age Band Selector */}
      <div className="mb-8 p-4 bg-white shadow-lg rounded-lg border border-indigo-200">
        <label htmlFor="age-band" className="block text-sm font-medium text-gray-700 mb-2">
          1. Select Property Age Band:
        </label>
        <select
          id="age-band"
          value={ageBand}
          onChange={(e) => setAgeBand(e.target.value as any)}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
        >
          <option value="A-I">A-I (Pre-1967)</option>
          <option value="J">J (1967–1975)</option>
          <option value="K-onwards">K onwards (Post-1975)</option>
        </select>
        <p className="text-xs text-gray-500 mt-2">
          Design values update automatically based on this selection. Current Temp Band:{' '}
          <strong>{getDesignConditionAgeBand(ageBand)}</strong>, ACH Band:{' '}
          <strong>{getACHAgeBand(ageBand)}</strong>
        </p>
      </div>

      {/* Zone Management */}
      <div className="mb-8 p-4 bg-white shadow-lg rounded-lg border border-green-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">2. Manage Heating Zones ({zones.length})</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {zones.map((zone) => (
            <span
              key={zone}
              className="px-3 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full border border-green-300"
            >
              {zone}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g., Bedroom Zone"
            value={newZoneName}
            onChange={(e) => setNewZoneName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addZone();
            }}
            className="flex-grow p-2 border border-gray-300 rounded-lg text-gray-900 shadow-sm"
          />
          <button
            onClick={addZone}
            disabled={!newZoneName.trim() || zones.includes(newZoneName.trim())}
            className="flex items-center bg-green-600 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:bg-green-700 disabled:bg-gray-400 transition duration-150"
          >
            <Plus size={16} className="mr-1" /> Add Zone
          </button>
        </div>
      </div>

      {/* Add New Room */}
      <div className="flex flex-col gap-4 mb-10 p-4 bg-indigo-50 border-2 border-indigo-400 rounded-xl shadow-xl">
        <h3 className="text-lg font-semibold text-indigo-700">3. Configure New Room</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Room Type */}
          <div>
            <label htmlFor="room-type-select" className="block text-sm font-medium text-indigo-700 mb-1">
              Room Type:
            </label>
            <select
              id="room-type-select"
              value={selectedRoomType}
              onChange={(e) => setSelectedRoomType(e.target.value)}
              className="w-full p-2 border border-indigo-300 rounded-lg text-gray-900 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              {ROOM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Zone Selection */}
          <div>
            <label htmlFor="zone-select" className="block text-sm font-medium text-indigo-700 mb-1">
              Assign Zone:
            </label>
            <select
              id="zone-select"
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="w-full p-2 border border-indigo-300 rounded-lg text-gray-900 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </div>

          {/* Ceiling Height Input */}
          <div>
            <label htmlFor="ceiling-height-input" className="block text-sm font-medium text-indigo-700 mb-1">
              Ceiling Height (m):
            </label>
            <input
              id="ceiling-height-input"
              type="number"
              step="0.1"
              min="1.8"
              inputMode="decimal"
              value={newRoomCeilingHeight}
              onChange={(e) => setNewRoomCeilingHeight(parseFloat(e.target.value))}
              className="w-full p-2 border border-indigo-300 rounded-lg text-gray-900 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        <button
          onClick={addRoom}
          className="flex items-center justify-center sm:self-end bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold shadow-md hover:bg-indigo-700 transition duration-150 transform hover:scale-[1.02] mt-4"
        >
          <Plus size={20} className="mr-2" /> Add Room to Project
        </button>
      </div>

      {/* Room List */}
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">4. Project Room List ({rooms.length})</h2>
      <div className="space-y-4">
        {rooms.length === 0 ? (
          <p className="text-gray-500 p-6 bg-white rounded-lg shadow-inner text-center">
            Start by configuring a room and clicking &quot;Add Room to Project&quot;.
          </p>
        ) : (
          rooms.map((room) => {
            const isNameEditing = editingId === room.id && editingField === 'name';

            return (
              <div
                key={room.id}
                className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-white rounded-xl shadow-md transition duration-100 hover:shadow-lg border-l-4 border-indigo-500"
              >
                {/* Room Name, Type, Zone, and Ceiling */}
                <div className="flex-1 min-w-0 mb-3 md:mb-0">
                  <span className="block text-xs font-medium text-indigo-600 uppercase mb-1">
                    {room.type}
                  </span>
                  <div className="flex items-center gap-2 mb-2">
                    {isNameEditing ? (
                      <input
                        type="text"
                        value={room.name}
                        onChange={(e) => handleStringChange(room.id, 'name', e.target.value)}
                        onBlur={stopEditing}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') stopEditing();
                        }}
                        className="text-xl font-bold border-b-2 border-indigo-500 focus:outline-none w-full max-w-sm"
                        autoFocus
                      />
                    ) : (
                      <h3 className="text-xl font-bold text-gray-900 truncate">{room.name || room.type}</h3>
                    )}
                    <button
                      onClick={() => (isNameEditing ? stopEditing() : startEditing(room.id, 'name'))}
                      className="p-1 text-gray-400 hover:text-indigo-600 transition duration-150 rounded-full hover:bg-indigo-50"
                      aria-label={isNameEditing ? 'Finish editing name' : 'Edit room name'}
                    >
                      <Edit size={16} />
                    </button>
                  </div>

                  {/* Zone and Ceiling Editors */}
                  <RoomDetailEditor room={room} />
                </div>

                {/* Design Values Editors */}
                <div className="flex gap-4 items-center flex-wrap mt-2 md:mt-0">
                  {/* Temperature Editor */}
                  <RoomValueEditor
                    id={room.id}
                    field="customTemp"
                    label="Temp"
                    icon={Thermometer}
                    unit="°C"
                    currentValue={room.customTemp}
                    designValue={room.designTemp}
                    isEditing={editingId === room.id && editingField === 'customTemp'}
                    startEditing={startEditing}
                    stopEditing={stopEditing}
                    handleChange={handleCustomValueChange}
                    colorClass="text-red-500"
                    step={1}
                  />

                  {/* ACH Editor */}
                  <RoomValueEditor
                    id={room.id}
                    field="customAch"
                    label="ACH"
                    icon={Wind}
                    unit=""
                    currentValue={room.customAch}
                    designValue={room.designAch}
                    isEditing={editingId === room.id && editingField === 'customAch'}
                    startEditing={startEditing}
                    stopEditing={stopEditing}
                    handleChange={handleCustomValueChange}
                    colorClass="text-blue-500"
                    step={0.1}
                  />
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => removeRoom(room.id)}
                  className="mt-3 md:mt-0 md:ml-6 p-2 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition duration-150 flex-shrink-0"
                  aria-label={`Remove room ${room.name}`}
                >
                  <X size={20} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default RoomDesigner;
