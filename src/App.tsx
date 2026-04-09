import { Routes, Route, Navigate } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { WorldList } from "./pages/WorldList";
import { WorldView } from "./pages/WorldView";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/worlds" element={<WorldList />} />
      <Route path="/world/:worldId" element={<WorldView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
