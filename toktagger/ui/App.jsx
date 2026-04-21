import "./src/app/globals.css";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { APISchemaProvider } from "./src/app/contexts/apiSchema";
import Projects from "./src/app/projects/page";
import ProjectView from "./src/app/projects/project_id/page";
import SampleView from "./src/app/projects/project_id/samples/sample_id/page";
import ModelForm from "./src/app/components/ui/schemaForm";
function App() {
  return (
    <APISchemaProvider>
      <Router>
        <Routes>
          <Route path="/ui/forms" element={<ModelForm />} />
          <Route path="/ui/projects/" element={<Projects />} />
          <Route path="/ui/projects/:project_id" element={<ProjectView />} />
          <Route
            path="/ui/projects/:project_id/samples/:sample_id"
            element={<SampleView />}
          />
        </Routes>
      </Router>
    </APISchemaProvider>
  );
}

export default App;
