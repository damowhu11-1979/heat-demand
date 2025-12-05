import React from 'react';
// Final attempt at path resolution: Assuming the component is directly in the parent 'src' directory,
// and allowing the bundler to resolve the file extension.
import RoomDesignTool from '../RoomDesignTool';

function RoomsPage() {
  return (
    // Render the correctly imported component
    <RoomDesignTool />
  );
}

export default RoomsPage;
