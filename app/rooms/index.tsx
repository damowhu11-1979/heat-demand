import React, { useState, useCallback, useEffect } from 'react';
import { Plus, X, Edit, Thermometer, Wind, Save } from 'lucide-react';

// --- Room Design Constants derived from uploaded documents ---

const ROOM_TYPES = [
  'Bathroom', 'Bedroom', 'Bedroom with en-suite', 'Bedroom/study',
  'Breakfast room', 'Cloakroom/WC', 'Dining room', 'Dressing room',
  'Family/breakfast room', 'Games room', 'Hall', 'Internal room/corridor',
  'Kitchen', 'Landing', 'Lounge/sitting room', 'Living room',
  'Shower room', 'Store room', 'Study', 'Toilet', 'Utility room'
];

// Design Temperature (°C) from design-conditions.pdf (Table 3.6)
const DESIGN_TEMPERATURES = {
  'Bathroom': { 'A-J': 22, 'K-onwards': 22 },
  'Bedroom': { 'A-J': 18, 'K-onwards': 21 },
  'Bedroom with en-suite': { 'A-J': 21, 'K-onwards': 21 },
  'Bedroom/study': { 'A-J': 21, 'K-onwards': 21 },
  'Breakfast room': { 'A-J': 21, 'K-onwards': 21 },
  'Cloakroom/WC': { 'A-J': 18, 'K-onwards': 21 },
  'Dining room': { 'A-J': 21, 'K-onwards': 21 },
  'Dressing room': { 'A-J': 18, 'K-onwards': 21 },
  'Family/breakfast room': { 'A-J': 21, 'K-onwards': 21 },
  'Games room': { 'A-J': 21, 'K-onwards': 21 },
  'Hall': { 'A-J': 18, 'K-onwards': 21 },
  'Internal room/corridor': { 'A-J': 18, 'K-onwards': 21 },
  'Kitchen': { 'A-J': 18, 'K-onwards': 21 },
  'Landing': { 'A-J': 18, 'K-onwards': 21 },
  'Lounge/sitting room': { 'A-J': 21, 'K-onwards': 21 },
  'Living room': { 'A-J': 21, 'K-onwards': 21 },
  'Shower room': { 'A-J': 22, 'K-onwards': 22 },
  'Store room': { 'A-J': 18, 'K-onwards': 21 },
  'Study': { 'A-J': 21, 'K-onwards': 21 },
  'Toilet': { 'A-J': 18, 'K-onwards': 21 },
  'Utility room': { 'A-J': 18, 'K-onwards': 21 },
};

// Minimum ACH (1/h) from ventilation-rates.pdf (Table 3.8)
const MINIMUM_ACH = {
  'Bathroom': { 'A-I': 3.0, 'J': 1.5, 'K-onwards': 0.5 },
  'Bedroom': { 'A-I': 1.0, 'J': 1.0, 'K-onwards': 0.5 },
  'Bedroom with en-suite': { 'A-I': 2.0, 'J': 1.5, 'K-onwards': 1.0 },
  'Bedroom/study': { 'A-I': 1.5, 'J': 1.5, 'K-onwards': 0.5 },
  'Breakfast room': { 'A-I': 1.5, 'J': 1.0, 'K-onwards': 0.5 },
  'Cloakroom/WC': { 'A-I': 2.0, 'J': 1.5, 'K-onwards': 1.5 },
  'Dining room': { 'A-I': 1.5, 'J': 1.0, 'K-onwards': 0.5 },
  'Dressing room': { 'A-I': 1.5, 'J': 1.0, 'K-onwards': 0.5 },
  'Family/breakfast room': { 'A-I': 2.0, 'J': 1.5, 'K-onwards': 0.5 },
  'Games room': { 'A-I': 1.5, 'J': 1.0, 'K-onwards': 0.5 },
  'Hall': { 'A-I': 2.0, 'J': 1.0, 'K-onwards': 0.5 },
  'Internal room/corridor': { 'A-I': 0.0, 'J': 0.0, 'K-onwards': 0.0 },
  'Kitchen': { 'A-I': 2.0, 'J': 1.5, 'K-onwards': 0.5 },
  'Landing': { 'A-I': 2.0, 'J': 1.0, 'K-onwards': 0.5 },
  'Lounge/sitting room': { 'A-I': 1.5, 'J': 1.0, 'K-onwards': 0.5 },
  'Living room': { 'A-I': 1.5, 'J': 1.0, 'K-onwards': 0.5 },
  'Shower room': { 'A-I': 3.0, 'J': 1.5, 'K-onwards': 0.5 },
  'Store room': { 'A-I': 1.0, 'J': 0.5, 'K-onwards': 0.5 },
  'Study': { 'A-I': 1.5, 'J': 1.5, 'K-onwards': 0.5 },
  'Toilet': { 'A-I': 3.0, 'J': 1.5, 'K-onwards': 1.5 },
  'Utility room': { 'A-I': 3.0, 'J': 2.0, 'K-onwards': 0.5 },
};

/**
 * Helper to determine which design data set to use for Temperature.
 */
const getDesignConditionAgeBand = (ageBand) => {
  return ageBand === 'K-onwards' ? 'K-onwards' : 'A-J';
};

/**
 * Helper to determine which ACH data set to use.
 */
const getACHAgeBand = (ageBand) => {
  if (ageBand.includes('K')) return 'K-onwards';
  if (ageBand.includes('J')) return 'J';
  return 'A-I';
};

/**
 * Calculates the default design values for a given room type and age band.
 */
const getDesignValues = (roomType, ageBand) => {
  const tempBand = getDesignConditionAgeBand(ageBand);
  const achBand = getACHAgeBand(ageBand);

  const temp = DESIGN_TEMPERATURES[roomType]?.[tempBand] || 21; // Default to 21 if unknown
  const ach = MINIMUM_ACH[roomType]?.[achBand] || 0.5; // Default to 0.5 if unknown
  
  return { temp: parseFloat(temp), ach: parseFloat(ach) };
};

// Component for editing/displaying Temperature and ACH values
const RoomValueEditor = ({ 
  id, field, label, icon: Icon, unit, currentValue, designValue, 
  isEditing, startEditing, stopEditing, handleChange, colorClass, step = 0.5
}) => {
  const isCustom = currentValue !== designValue;
  const fieldName = field.includes('Temp') ? 'Temperature' : 'ACH';

  return (
    <div className={`flex items-center text-sm text-gray-700 px-3 py-1 rounded-full shadow-inner transition-colors duration-150 ${isCustom ? 'bg-yellow-100 border border-yellow-400' : 'bg-indigo-100'}`}>
      <Icon size={16} className={`${colorClass} mr-2`} />
      <span className="font-semibold mr-1">{label}:</span>
      
      {isEditing ? (
        <div className="flex items-center">
          <input
            type="number"
            step={step}
            min={0}
            value={currentValue}
            onChange={(e) => handleChange(id, field, e.target.value)}
            onBlur={() => stopEditing()}
            onKeyPress={(e) => {
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
            {currentValue.toFixed(unit === '°C' ? 0 : 1)}
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


// Main App Component
const App = () => {
  // State for all rooms in the project
  const [rooms, setRooms] = useState([]);
  // State for the selected property age band
  const [ageBand, setAgeBand] = useState('K-onwards');
  
  // State for editing:
  const [editingId, setEditingId] = useState(null); // ID of the room being edited (for name or values)
  const [editingField, setEditingField] = useState(null); // Field being edited ('name', 'customTemp', or 'customAch')
  
  // State for the room type selector
  const [selectedRoomType, setSelectedRoomType] = useState(ROOM_TYPES[0]);


  /**
   * Refined naming logic to follow user's "multiple go up numerically" request
   */
  const getNextRoomNameRefined = useCallback((type) => {
    const matchingRooms = rooms.filter(room => room.type === type);
    
    let highestSuffix = 0;
    
    matchingRooms.forEach(room => {
        // Check for 'Bedroom 1', 'Bedroom 2', etc.
        const match = room.name.match(new RegExp(`${type}\\s*(\\d+)$`));
        if (match) {
            highestSuffix = Math.max(highestSuffix, parseInt(match[1], 10));
        } else if (room.name === type) {
            // Treat the base name "Bedroom" as index 1
            highestSuffix = Math.max(highestSuffix, 1);
        }
    });

    let nextSuffix = highestSuffix + 1;
    
    // If it's the very first room of this type, don't append a number
    if (matchingRooms.length === 0) {
        return type;
    }
    
    // Ensure the generated name is unique *before* setting it
    let proposedName = nextSuffix === 1 ? type : `${type} ${nextSuffix}`;
    let suffix = nextSuffix;
    
    while (rooms.some(room => room.name === proposedName)) {
        suffix++;
        proposedName = `${type} ${suffix}`;
    }

    return proposedName;

  }, [rooms]);
  
  /**
   * Adds a new room with initial design values.
   */
  const addRoom = () => {
    const type = selectedRoomType;
    const newName = getNextRoomNameRefined(type);
    
    // Calculate initial design values based on current ageBand
    const { temp, ach } = getDesignValues(type, ageBand);

    const newRoom = {
      id: Date.now(), // Unique ID
      type: type,
      name: newName,
      designTemp: temp, // Calculated default (baseline)
      customTemp: temp, // User-editable temperature (defaults to designTemp)
      designAch: ach,   // Calculated default (baseline)
      customAch: ach,   // User-editable ACH (defaults to designAch)
    };

    setRooms(prevRooms => [...prevRooms, newRoom]);
  };

  /**
   * Updates baseline design values for all rooms when the age band changes.
   * Keeps the user's custom values intact.
   */
  useEffect(() => {
    setRooms(prevRooms => {
      if (prevRooms.length === 0) return prevRooms;
      
      const newRooms = prevRooms.map(room => {
        const { temp, ach } = getDesignValues(room.type, ageBand);
        
        return {
          ...room,
          designTemp: temp, // Update baseline
          designAch: ach,   // Update baseline
          // customTemp and customAch remain as they were, allowing the user's override to persist.
        };
      });
      return newRooms;
    });
  }, [ageBand]);

  /**
   * Removes a room from the list.
   */
  const removeRoom = (id) => {
    setRooms(prevRooms => prevRooms.filter(room => room.id !== id));
  };

  /**
   * Starts editing a specific room field (name, customTemp, customAch).
   */
  const startEditing = (id, field) => {
    setEditingId(id);
    setEditingField(field);
  };

  /**
   * Stops any current editing.
   */
  const stopEditing = () => {
    setEditingId(null);
    setEditingField(null);
  };

  /**
   * Handles changes to the room name.
   */
  const handleNameChange = (id, newName) => {
    setRooms(prevRooms =>
      prevRooms.map(room =>
        room.id === id ? { ...room, name: newName } : room
      )
    );
  };

  /**
   * Handles changes to custom numerical values (Temp or ACH).
   */
  const handleCustomValueChange = (id, field, value) => {
    let numValue = parseFloat(value);
    
    setRooms(prevRooms =>
      prevRooms.map(room => {
        if (room.id === id) {
            // If parsing fails or value is empty, revert to the design value of that field type
            let newValue = numValue;
            if (isNaN(numValue) || value === '') {
                newValue = field === 'customTemp' ? room.designTemp : room.designAch;
            }
            // Ensure ACH cannot be negative, although the input type handles this with 'min=0'
            if (field === 'customAch' && newValue < 0) newValue = 0;

            return { ...room, [field]: newValue };
        }
        return room;
      })
    );
  };

  return (
    <div className="p-4 sm:p-8 bg-gray-50 min-h-screen font-sans">
      <h1 className="text-3xl font-bold text-gray-800 mb-6 border-b pb-2">
        Room Design Specification Tool
      </h1>

      {/* Age Band Selector */}
      <div className="mb-8 p-4 bg-white shadow-lg rounded-lg border border-indigo-200">
        <label htmlFor="age-band" className="block text-sm font-medium text-gray-700 mb-2">
          1. Select Property Age Band:
        </label>
        <select
          id="age-band"
          value={ageBand}
          onChange={(e) => setAgeBand(e.target.value)}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
        >
          <option value="A-I">A-I (Pre-1967)</option>
          <option value="J">J (1967–1975)</option>
          <option value="K-onwards">K onwards (Post-1975)</option>
        </select>
        <p className="text-xs text-gray-500 mt-2">
          Design values update automatically based on this selection. Current Temp Band: **{getDesignConditionAgeBand(ageBand)}**, ACH Band: **{getACHAgeBand(ageBand)}**
        </p>
      </div>

      {/* Add New Room Section */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-10 p-4 bg-indigo-50 border-2 border-indigo-400 rounded-xl shadow-xl">
        <div className="flex-grow">
          <label htmlFor="room-type-select" className="block text-sm font-medium text-indigo-700 mb-1">
            2. Choose Room Type to Add:
          </label>
          <select
            id="room-type-select"
            value={selectedRoomType}
            onChange={(e) => setSelectedRoomType(e.target.value)}
            className="w-full p-2 border border-indigo-300 rounded-lg text-gray-900 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          >
            {ROOM_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <button
          onClick={addRoom}
          className="flex items-center justify-center sm:self-end bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold shadow-md hover:bg-indigo-700 transition duration-150 transform hover:scale-[1.02]"
        >
          <Plus size={20} className="mr-2" /> Add Room
        </button>
      </div>

      {/* Room List */}
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">
        3. Project Room List ({rooms.length})
      </h2>
      <div className="space-y-4">
        {rooms.length === 0 ? (
          <p className="text-gray-500 p-6 bg-white rounded-lg shadow-inner text-center">
            Start by selecting a room type and clicking "Add Room".
          </p>
        ) : (
          rooms.map((room) => {
            const isNameEditing = editingId === room.id && editingField === 'name';

            return (
              <div
                key={room.id}
                className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-white rounded-xl shadow-md transition duration-100 hover:shadow-lg border-l-4 border-indigo-500"
              >
                {/* Room Name & Edit */}
                <div className="flex-1 min-w-0 mb-3 md:mb-0">
                  <span className="block text-xs font-medium text-indigo-600 uppercase mb-1">
                    {room.type}
                  </span>
                  <div className="flex items-center gap-2">
                    {isNameEditing ? (
                      <input
                        type="text"
                        value={room.name}
                        onChange={(e) => handleNameChange(room.id, e.target.value)}
                        onBlur={stopEditing}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') stopEditing();
                        }}
                        className="text-xl font-bold border-b-2 border-indigo-500 focus:outline-none w-full max-w-sm"
                        autoFocus
                      />
                    ) : (
                      <h3 className="text-xl font-bold text-gray-900 truncate">
                        {room.name || room.type}
                      </h3>
                    )}
                    <button
                      onClick={() => isNameEditing ? stopEditing() : startEditing(room.id, 'name')}
                      className="p-1 text-gray-400 hover:text-indigo-600 transition duration-150 rounded-full hover:bg-indigo-50"
                      aria-label={isNameEditing ? "Finish editing name" : "Edit room name"}
                    >
                      <Edit size={16} />
                    </button>
                  </div>
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

export default App;
