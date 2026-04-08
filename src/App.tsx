import { Routes, Route, Navigate } from "react-router-dom";
import { WorldList } from "./pages/WorldList";
import { WorldView } from "./pages/WorldView";

function App() {
  return (
    <Routes>
      <Route path="/worlds" element={<WorldList />} />
      <Route path="/world/:worldId" element={<WorldView />} />
      <Route path="*" element={<Navigate to="/worlds" replace />} />
    </Routes>
  );
}

export default App;
