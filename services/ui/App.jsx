import "./src/app/globals.css";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Projects from "./src/app/projects/page";
import ProjectView from "./src/app/projects/project_id/page";
import SampleView from "./src/app/projects/project_id/samples/sample_id/page";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Projects />} />
        <Route path="/ui/projects/" element={<Projects />} />
        <Route path="/ui/projects/:project_id" element={<ProjectView />} />
        <Route path="/ui/projects/:project_id/samples/:sample_id" element={<SampleView />} />
      </Routes>
    </Router>
  );
}

export default App;