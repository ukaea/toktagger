import "./src/app/globals.css";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Provider, defaultTheme, ToastContainer } from "@adobe/react-spectrum";
import { useNavigate } from "react-router-dom";
import { APISchemaProvider } from "./src/app/contexts/apiSchema";
import { AuthProvider, useAuth } from "./src/app/contexts/AuthContext";
import { ServerHealthProvider } from "./src/app/contexts/healthContext";
import Projects from "./src/app/projects/page";
import ProjectView from "./src/app/projects/project_id/page";
import SampleView from "./src/app/projects/project_id/samples/sample_id/page";
import LoginPage from "./src/app/pages/login";
import AdminUsersPage from "./src/app/pages/admin/users";
import ProfilePage from "./src/app/pages/profile";
import TopBar from "./src/app/components/tools/topBar";
import { BreadcrumbProvider } from "./src/app/contexts/BreadcrumbContext";

function SpectrumProvider({ children }) {
  const navigate = useNavigate();
  // Our own Link/Item hrefs are already fully-qualified app paths (e.g. "/ui/projects/123")
  // or absolute external URLs, never route "to" descriptors — so we don't pass react-router's
  // useHref here. It resolves every href relative to the current route, which mangles
  // external URLs (e.g. "https://ukaea.github.io/...") into broken in-app paths.
  return (
    <Provider theme={defaultTheme} router={{ navigate }}>
      <ToastContainer placement="top" />
      {children}
    </Provider>
  );
}

function AuthenticatedLayout({ children }) {
  return (
    <BreadcrumbProvider>
      <div className="flex flex-col h-screen">
        <TopBar />
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      </div>
    </BreadcrumbProvider>
  );
}

function RequireAuth({ children }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/ui/login" replace />;
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}

function RequireAdmin({ children }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/ui/login" replace />;
  if (user.global_role !== "admin")
    return <Navigate to="/ui/projects/" replace />;
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}

function App() {
  return (
    <APISchemaProvider>
      <Router>
        <SpectrumProvider>
          <ServerHealthProvider>
            <AuthProvider>
              <Routes>
                <Route path="/ui/login" element={<LoginPage />} />
                <Route
                  path="/"
                  element={
                    <RequireAuth>
                      <Projects />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/ui/projects/"
                  element={
                    <RequireAuth>
                      <Projects />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/ui/projects/:project_id"
                  element={
                    <RequireAuth>
                      <ProjectView />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/ui/projects/:project_id/samples/:sample_id"
                  element={
                    <RequireAuth>
                      <SampleView />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/ui/admin/users"
                  element={
                    <RequireAdmin>
                      <AdminUsersPage />
                    </RequireAdmin>
                  }
                />
                <Route
                  path="/ui/profile"
                  element={
                    <RequireAuth>
                      <ProfilePage />
                    </RequireAuth>
                  }
                />
              </Routes>
            </AuthProvider>
          </ServerHealthProvider>
        </SpectrumProvider>
      </Router>
    </APISchemaProvider>
  );
}

export default App;
